import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { onMessage, getMessaging } from 'firebase/messaging';
import { RootState } from '../store/rootReducer';
import { deviceTokenApi } from '../api/deviceTokenApi';
import { queryKeys } from '../api/hooks/queryKeys';
import { queryClient } from '../query';
import { getFirebaseAppIfConfigured, getPushToken, requestPushPermission } from './pushNotifications.web';

/**
 * Web counterpart to usePushNotifications.ts (native) — see webpack.config.js's
 * resolve.extensions for why this .web.ts file is the one that actually gets bundled here.
 * Same mount-on-login lifecycle as the native hook, but no onTokenRefresh/
 * onNotificationOpenedApp/getInitialNotification equivalents exist in the Firebase Web SDK: a
 * fresh token is just fetched again on every mount (cheap no-op if unchanged, since getToken()
 * returns the same token until it's actually rotated), and a background/quit-tab notification
 * tap is handled by the service worker itself (see web/firebase-messaging-sw.ts's
 * notificationclick listener), not by this in-page code.
 */
export const usePushNotifications = () => {
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);
  const registeredTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      // Cleared on sign-out, not just left behind. The ref is a "we already told the server
      // about this token" marker, and on a shared front-counter tablet the browser hands out
      // the SAME token to the next person who logs in — so a stale ref made the check below
      // short-circuit and this device was never registered under the new user at all. (The
      // previous user's registration is separately removed by AuthRepository's logout.)
      registeredTokenRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      const granted = await requestPushPermission();
      if (!granted || cancelled) return;

      const token = await getPushToken();
      // TEMP DIAGNOSTIC — remove once push delivery is confirmed working end-to-end.
      console.log('[push diagnostic] usePushNotifications: permission granted, token=', token ? token.slice(0, 12) + '...' : null);
      if (!token || cancelled || token === registeredTokenRef.current) return;
      registeredTokenRef.current = token;
      try {
        await deviceTokenApi.register(token, 'Web');
        console.log('[push diagnostic] deviceTokenApi.register succeeded');
      } catch (err) {
        console.error('[push diagnostic] deviceTokenApi.register FAILED:', err);
        // Best-effort — same as the native hook, a failed registration just means this
        // browser misses pushes until the next login/mount retries it.
      }
    })();

    const app = getFirebaseAppIfConfigured();
    let unsubscribeForeground: (() => void) | undefined;
    if (app) {
      try {
        unsubscribeForeground = onMessage(getMessaging(app), (payload) => {
          // TEMP DIAGNOSTIC — remove once push delivery is confirmed working end-to-end.
          console.log('[push diagnostic] FOREGROUND push received:', payload);
          // Tab is open and focused — a real notification popup would be redundant (the user
          // is already looking at the app), so this just refreshes the in-app list, same as a
          // foreground push does on native.
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
        });
      } catch {
        // getMessaging() throws "Service messaging is not available" wherever the browser
        // can't do FCM — no service worker / PushManager / Notification API, an insecure
        // origin, a private window, some mobile browsers. Being configured (the check above)
        // is not the same as being supported. Uncaught, this threw straight through the
        // effect and the ErrorBoundary blanked the entire app on a screen that has nothing
        // to do with notifications. Foreground push is a nice-to-have: degrade to "no live
        // refresh" and let everything else work.
      }
    }

    return () => {
      cancelled = true;
      unsubscribeForeground?.();
    };
  }, [isAuthenticated]);
};
