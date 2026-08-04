import { createNavigationContainerRef } from '@react-navigation/native';

// Lets code outside the component tree (a push-notification tap handler, which fires from a
// native event listener, not a screen) drive navigation — see pushNotifications.ts's
// handleNotificationOpen. Attached to RootNavigator's NavigationContainer via `ref`.
export const navigationRef = createNavigationContainerRef();

/** Best-effort: a cold-started app may not have the navigator mounted yet by the time a
 * notification tap fires, so this silently no-ops rather than throwing (matches
 * useOrdersRealtime's "nothing here should be able to break the screen it's mounted on"). There's
 * no per-order detail route today for AppNotification.ActionUrl ("/orders/{id}") to resolve to
 * (NotificationCenterScreen itself doesn't consume it either — see its own file) — so every tap
 * just opens the Notification Center, same place the in-app bell icon already goes, rather than
 * guessing at a screen that doesn't exist. */
export const navigateToActionUrl = (_actionUrl: string | undefined) => {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Notifications' as never);
};
