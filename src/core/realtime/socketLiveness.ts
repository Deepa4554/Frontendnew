/**
 * "Is the realtime socket actually delivering messages right now" — deliberately NOT the same
 * question as "what does HubConnectionState say". ordersRealtime.ts has already hit a case
 * (see its own doc comment) where a connection reported Connected on the web build while the
 * Vercel proxy was silently dropping the WebSocket upgrade, and every client fell back to being
 * carried entirely by each screen's safety-net refetchInterval — invisibly, because nothing
 * ever asked the connection state, which was lying.
 *
 * This module tracks proof of life instead: the timestamp of the last message that actually
 * arrived (the server's periodic "heartbeat", or any real push — ordersChanged/dataChanged/
 * accessChanged all count equally, see ordersRealtime.ts's handlers). A polling hook asks
 * isSocketRecentlyAlive() right before each refetch to decide whether the socket has earned a
 * slower interval this time.
 *
 * Deliberately a plain module-level variable, not React state / Redux: nothing here needs a
 * re-render when the socket's liveness changes — React Query's refetchInterval already accepts
 * a function and re-evaluates it around every fetch, which is the only place this value is
 * actually read. Wiring it through Redux would cost every polling hook's owning screen a
 * re-render on every heartbeat for no visible benefit.
 */

// Comfortably above HeartbeatService's 15s server-side tick, so one missed heartbeat (a GC
// pause, one dropped frame) doesn't alone flip every screen back to fast polling — it takes
// roughly two misses in a row before this window lapses.
const LIVENESS_WINDOW_MS = 25000;

let lastSignalAt = 0;

/** Call on every message that actually arrived over the socket — proof it's really delivering,
 * not just proof the handshake completed. */
export const recordSocketSignal = () => {
  lastSignalAt = Date.now();
};

/** Call the instant the connection is known to be down or degrading (onreconnecting, a failed
 * start, dispose) so the fast interval kicks back in immediately instead of waiting out the
 * window on a connection everyone already knows is gone. */
export const markSocketNotAlive = () => {
  lastSignalAt = 0;
};

/** No signal ever recorded (fresh mount, an app build older than HeartbeatService, a socket
 * that never came up) reads as "not alive" — the same fast-polling default this app already
 * had before any of this existed. Failing toward the pre-existing behavior, never past it. */
export const isSocketRecentlyAlive = () => lastSignalAt > 0 && Date.now() - lastSignalAt < LIVENESS_WINDOW_MS;

/**
 * A React Query `refetchInterval` value that stays at `fastMs` (today's unconditional
 * interval) until the socket has proven itself, then relaxes to `slowMs`. Pass straight as
 * `refetchInterval` — React Query calls functions of this shape around every fetch, which is
 * exactly the cadence this needs: no separate timer, no re-render wiring, just read fresh each
 * time a poll is about to fire.
 *
 * One consequence worth having in mind: while already in `slowMs` mode, a socket dying doesn't
 * shorten the *current* wait — the query only re-evaluates this function at its next scheduled
 * fetch, so detection lags by up to one `slowMs` period even though onreconnecting/dispose call
 * markSocketNotAlive() immediately. That's a wider window than the 25s liveness threshold
 * alone suggests, but it's still bounded and self-correcting — never the silent, indefinite
 * staleness the plain interval had before any of this existed.
 */
export const socketAwareInterval = (fastMs: number, slowMs: number) => () => (isSocketRecentlyAlive() ? slowMs : fastMs);
