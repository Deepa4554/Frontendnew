import { useEffect } from 'react';
import { Platform } from 'react-native';
import { HttpTransportType, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { queryClient } from '../query';
import { getAccessToken } from '../storage/tokenStore';
import { getHubBaseUrl } from '../config/env';
import { queryKeys } from '../api/hooks/queryKeys';
import { recordSocketSignal, markSocketNotAlive } from './socketLiveness';

/**
 * Query keys each server-side scope stands for — the client half of RealtimeScopes in
 * RealtimeNotifier.cs on the API, and the two lists have to be changed together. Keys are
 * prefixes, so ['menu'] also covers ['menu','best-sellers',...] and ['inventory'] covers
 * ['inventory',id,'transactions'].
 *
 * "orders" isn't sent as a scope by the server (the older, separate "ordersChanged" event
 * still carries it, so app builds already in the field keep working) — it lives here so both
 * events can share one invalidation path. Reports are deliberately not in any scope: they're
 * date-ranged historical aggregates a user opens deliberately, and the queries are expensive
 * enough that invalidating them on every write would be a real load cost for no live value.
 *
 * No "notifications" entry on purpose: AppNotification is the push-notification payload
 * itself, and that already has its own precise per-user/per-role delivery channel (FCM —
 * see usePushNotifications.ts/.web.ts, the only things that ever invalidate ['notifications']).
 * Piping it through this tenant-wide "something changed" broadcast too would mean a
 * notification meant for one person also waking every other connected device — the two
 * channels stay on separate tracks, see RealtimeScopes.cs's own doc comment on the API.
 */
const SCOPE_QUERY_KEYS: Record<string, readonly (readonly unknown[])[]> = {
  orders: [['orders'], ['tables'], queryKeys.bestSellersToday, ['dashboard']],
  menu: [['menu'], ['categories'], ['stations'], ['tax-groups'], ['order-note-suggestions'], ['menu-items']],
  inventory: [['inventory'], ['inventory-batches'], ['inventory-expiring'], ['stock-takes'], ['vendors'], ['purchase-orders']],
  customers: [['customers'], ['rewards']],
  staff: [['staff'], ['attendance'], ['leave-requests'], ['staff-loans'], ['payroll-runs'], ['payroll']],
  tasks: [['tasks']],
  approvals: [['approvals']],
  settings: [['settings'], ['branches'], ['subscription'], ['integrations']],
};

/**
 * Pushes arrive in bursts, not singly: firing one KOT writes the order, its items, an
 * inventory transaction per ingredient and the customer's visit row, and each save that the
 * request makes is its own event. Collecting a burst into one invalidation keeps a busy
 * service from turning every ticket into a stack of duplicate refetches on every connected
 * device. Trailing-only, and short enough that nobody perceives it as lag.
 */
const COALESCE_MS = 250;

/** Exponential, capped at 30s — the shape SignalR's own default reconnect uses. */
const backoffMs = (attempt: number) => Math.min(2000 * 2 ** attempt, 30000);

/**
 * Full jitter: a delay anywhere in [50%, 100%] of the computed backoff. Enough spread that a
 * roomful of devices knocked offline together don't retry in lockstep, without letting any
 * one device drift so late that a waiter notices the board is stale.
 */
const withJitter = (ms: number) => Math.round(ms * (0.5 + Math.random() * 0.5));

/**
 * The app's single realtime connection, mounted once in AppNavigator (so it lives exactly as
 * long as an authenticated session). It carries three server-to-client events, all pushed
 * from CafePosDbContext.SaveChangesAsync + StaffController on the API so no call site has to
 * remember to fire one:
 *
 * - "ordersChanged" — an Order/OrderItem/CafeTable write in this device's tenant. This is
 *   what lets useOrders/useTables treat their refetchInterval as a safety net rather than the
 *   primary update path.
 * - "dataChanged" — a scope list (menu, inventory, staff, ...) for everything outside the
 *   order family, which had no push at all before and so only updated on remount/focus.
 * - "accessChanged" — pushed to this device's own user group when an Owner edits this staff
 *   member's screen access. Reuses this connection instead of opening a second socket.
 *
 * Dependability comes from three things that all have to be present: the jittered reconnect
 * policy below, the start() retry loop (which covers the FIRST connect, that the policy does
 * not), and re-invalidating on every connect — SignalR never replays events missed while the
 * socket was down, so a reconnect has to assume it missed everything.
 *
 * Transport selection is per-platform, because the two builds reach the hub by different
 * routes (see env.ts's getHubBaseUrl):
 *
 * - Native talks straight to the Render origin, where the WebSocket upgrade succeeds, so it
 *   keeps skipNegotiation + WebSockets-only: straight to the socket, no HTTP "negotiate"
 *   round trip.
 * - Web goes through Vercel's same-origin /hubs rewrite, and a Vercel rewrite proxies plain
 *   HTTP but NOT a WebSocket upgrade — so WebSockets-only + skipNegotiation could never
 *   connect there and, worse, had no way to fall back (skipping negotiation is what removes
 *   the fallback). Every web client was silently left on useOrders/useTables' 10–30s
 *   refetchInterval, which is why production felt slow: another device settling a bill or
 *   confirming a QR order only showed up on the next poll tick. Negotiating lets SignalR try
 *   WebSockets first and drop to ServerSentEvents/LongPolling when the proxy refuses the
 *   upgrade — and self-correct back to WebSockets if the hosting ever supports it. The CORS
 *   preflight skipNegotiation used to avoid isn't a concern on this path: the rewrite makes
 *   the hub same-origin from the browser's point of view.
 *
 * Auth differs per platform too: native passes its MMKV token through accessTokenFactory as
 * an "access_token" query param (a browser can't set an Authorization header on a WS
 * handshake), while the web build has no token in JS at all — there accessTokenFactory
 * yields '' and the httpOnly pos_access_token cookie rides the handshake instead, which
 * Program.cs's JwtBearer OnMessageReceived falls back to reading. That cookie is carried by
 * the negotiate POST and the SSE/long-poll requests exactly as it was by the WS handshake.
 */
export const useOrdersRealtime = () => {
  useEffect(() => {
    const isWeb = Platform.OS === 'web';
    const connection = new HubConnectionBuilder()
      .withUrl(`${getHubBaseUrl()}/hubs/orders`, {
        transport: isWeb
          ? HttpTransportType.WebSockets | HttpTransportType.ServerSentEvents | HttpTransportType.LongPolling
          : HttpTransportType.WebSockets,
        skipNegotiation: !isWeb,
        accessTokenFactory: () => getAccessToken() ?? '',
      })
      // Jittered rather than SignalR's fixed [0, 2s, 10s, 30s] default. A backend restart
      // drops every device in the building at the same instant, so a deterministic schedule
      // has all of them reconnect — and then each fire a full resync — at the same wall-clock
      // offsets, hammering the API precisely as it's coming back up. Spreading each device
      // across its own random slice of the window turns that thundering herd into a trickle.
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (ctx) => withJitter(backoffMs(ctx.previousRetryCount)),
      })
      .configureLogging(LogLevel.Warning)
      .build();

    const pendingScopes = new Set<string>();
    let coalesceTimer: ReturnType<typeof setTimeout> | undefined;

    const flushScopes = () => {
      coalesceTimer = undefined;
      const scopes = [...pendingScopes];
      pendingScopes.clear();
      for (const scope of scopes)
        for (const queryKey of SCOPE_QUERY_KEYS[scope] ?? [])
          queryClient.invalidateQueries({ queryKey });
    };

    const queueScopes = (scopes: readonly string[]) => {
      for (const scope of scopes) pendingScopes.add(scope);
      if (!coalesceTimer) coalesceTimer = setTimeout(flushScopes, COALESCE_MS);
    };

    const resyncOrders = () => queueScopes(['orders']);
    /** Catch-up after a gap: every scope, since any of them could have been pushed while the
     * socket was down — not just orders, which is all this used to recover. */
    const resyncEverything = () => queueScopes(Object.keys(SCOPE_QUERY_KEYS));

    connection.on('ordersChanged', () => {
      recordSocketSignal();
      resyncOrders();
    });

    // Scope list comes off the wire, so an API that learns a new scope before this build does
    // must not break it — unknown names fall through SCOPE_QUERY_KEYS' lookup harmlessly, and
    // a malformed payload is ignored rather than thrown from inside the socket callback.
    connection.on('dataChanged', (scopes: unknown) => {
      recordSocketSignal();
      if (Array.isArray(scopes)) queueScopes(scopes.filter((s): s is string => typeof s === 'string'));
    });

    connection.on('accessChanged', () => {
      recordSocketSignal();
      queryClient.invalidateQueries({ queryKey: ['auth', 'liveAccess'] });
    });

    // Carries no payload and invalidates nothing — HeartbeatService's only job is proving the
    // pipe is actually delivering messages (see socketLiveness.ts), which lets the safety-net
    // polling hooks slow down without trusting connection.state, which has lied before (see
    // this file's own transport-selection comment below).
    connection.on('heartbeat', recordSocketSignal);

    // Every push sent while the socket was down is gone for good — SignalR doesn't replay
    // them — so treat "we have a connection again" as its own resync trigger. Without this a
    // KDS that dropped mid-service reconnects to a board that's still missing the tickets
    // fired during the gap, and stays wrong until the next unrelated push.
    //
    // Deliberately does NOT call recordSocketSignal() — a reconnected handshake is exactly
    // the thing that already fooled connection.state once (see this file's transport-selection
    // comment). Liveness is only earned back once a real message actually arrives afterward.
    connection.onreconnected(resyncEverything);

    // The instant SignalR itself knows the connection dropped, not 25s later when the
    // liveness window happens to lapse — every safety-net poll should be back to its fast
    // interval before the window even matters, so a drop mid-reconnect-attempt never has to
    // wait out the timeout on a connection everyone already knows is gone.
    connection.onreconnecting(() => markSocketNotAlive());

    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempt = 0;

    // withAutomaticReconnect() only covers drops AFTER one successful connect — a failed
    // FIRST start (Render cold-starting the API, a moment offline, a network that briefly
    // blocks WebSockets) is never retried by it, which left realtime silently dead for the
    // entire session. Retrying here with backoff is what makes the push path actually
    // dependable instead of "worked if the very first attempt happened to land".
    const start = async () => {
      if (disposed) return;
      try {
        await connection.start();
        if (disposed) return;
        // Same catch-up as onreconnected: anything that changed between mount and this
        // connect landing was never pushed to us.
        resyncEverything();
        retryAttempt = 0;
      } catch {
        if (disposed) return;
        markSocketNotAlive();
        // Jittered for the same reason the reconnect policy above is: a cold-starting API
        // rejects every device's first connect at once, so an unjittered retry would bring
        // them all back simultaneously.
        retryTimer = setTimeout(start, withJitter(backoffMs(retryAttempt)));
        retryAttempt += 1;
      }
    };
    // Still never rejects outward — a socket that can't come up must not break the screen
    // it's mounted on, it just falls back to the safety-net refetchInterval as before.
    void start();

    return () => {
      disposed = true;
      // This device's own liveness signal, not a global one — another mounted instance (there
      // is only ever one, this hook is mounted once for the session's lifetime) isn't affected.
      // Matters for the case this cleanup runs on logout: the next login mounts a fresh
      // connection and must not inherit a stale "alive" reading from the one just torn down.
      markSocketNotAlive();
      if (retryTimer) clearTimeout(retryTimer);
      if (coalesceTimer) clearTimeout(coalesceTimer);
      connection.stop();
    };
  }, []);
};
