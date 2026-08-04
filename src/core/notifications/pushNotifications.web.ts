/// <reference lib="dom" />
// The RN TypeScript config deliberately omits the DOM lib (this project targets native
// platforms primarily) — this file is web-only (see webpack.config.js's resolve.extensions),
// so it layers the real browser Notification/navigator.serviceWorker typings back in just for
// itself rather than widening every other file's globals.
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken as getFcmToken } from 'firebase/messaging';
import { FIREBASE_VAPID_KEY, FIREBASE_WEB_CONFIG, isFirebaseWebConfigured } from '../config/firebaseWebConfig';

// Metro (native builds) never resolves this file at all — see this folder's plain
// pushNotifications.ts for the native/@react-native-firebase implementation. Webpack prefers
// this .web.ts variant only when bundling for web (see webpack.config.js's resolve.extensions).
export const getFirebaseAppIfConfigured = (): FirebaseApp | null => {
  if (!isFirebaseWebConfigured()) return null;
  return getApps().length ? getApp() : initializeApp(FIREBASE_WEB_CONFIG);
};

export const requestPushPermission = async (): Promise<boolean> => {
  if (!isFirebaseWebConfigured() || typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
};

/** Null whenever web push isn't available: unconfigured, permission denied, no service-worker
 * support, or the registration/token fetch itself failed — every caller treats this the same
 * as "push isn't available on this browser right now", never as an error to surface. */
export const getPushToken = async (): Promise<string | null> => {
  const app = getFirebaseAppIfConfigured();
  if (!app || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
    return await getFcmToken(getMessaging(app), { vapidKey: FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration });
  } catch {
    return null;
  }
};
