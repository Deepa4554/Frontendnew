import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useSelector } from 'react-redux';
import messaging from '@react-native-firebase/messaging';
import { RootState } from '../store/rootReducer';
import { deviceTokenApi } from '../api/deviceTokenApi';
import { queryKeys } from '../api/hooks/queryKeys';
import { queryClient } from '../query';
import { navigateToActionUrl } from '../navigation/navigationRef';
import { requestPushPermission } from './pushNotifications';

/**
 * Mirrors useOrdersRealtime's lifecycle (mounted once in AppNavigator, so it starts on login and
 * stops on logout): requests notification permission, registers this device's FCM token with the
 * backend (see DeviceTokensController), and keeps it fresh across token rotation. A foreground
 * push just triggers the same query-invalidation NotificationCenterScreen already does on pull;
 * tapping one (from background or a cold start) opens the Notification Center — see
 * navigationRef's own comment for why that's the honest target instead of a fabricated deep link.
 *
 * Web has no FCM — Firebase web push needs its own VAPID-key setup this app doesn't have yet, so
 * this no-ops there entirely rather than half-working.
 */
export const usePushNotifications = () => {
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);
  const registeredTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' || !isAuthenticated) return;

    let cancelled = false;

    const register = async (token: string) => {
      if (cancelled || token === registeredTokenRef.current) return;
      registeredTokenRef.current = token;
      try {
        await deviceTokenApi.register(token, Platform.OS === 'ios' ? 'iOS' : 'Android');
      } catch {
        // Best-effort: a failed registration just means this device misses pushes until the
        // next token refresh or app relaunch retries it — never worth surfacing to the user.
      }
    };

    const handleOpen = (remoteMessage: { data?: Record<string, string | object> } | null) => {
      if (!remoteMessage) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      navigateToActionUrl(remoteMessage.data?.actionUrl as string | undefined);
    };

    (async () => {
      const granted = await requestPushPermission();
      if (!granted || cancelled) return;
      const token = await messaging().getToken().catch(() => null);
      if (token) await register(token);
    })();

    const unsubscribeTokenRefresh = messaging().onTokenRefresh(register);
    const unsubscribeForeground = messaging().onMessage(async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    });
    const unsubscribeOpened = messaging().onNotificationOpenedApp(handleOpen);
    messaging().getInitialNotification().then(handleOpen);

    return () => {
      cancelled = true;
      unsubscribeTokenRefresh();
      unsubscribeForeground();
      unsubscribeOpened();
    };
  }, [isAuthenticated]);
};
