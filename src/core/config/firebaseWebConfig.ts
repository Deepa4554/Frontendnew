/**
 * Firebase console → Project settings → General → "Your apps" → add/select the Web app →
 * SDK setup and configuration → Config. These values are public by design (they identify the
 * project, not a secret — Firebase's actual access control is Auth + security rules), so it's
 * fine for them to sit in client bundle code like this.
 *
 * FIREBASE_VAPID_KEY comes from a different tab: Project settings → Cloud Messaging → Web
 * Push certificates → generate a key pair.
 *
 * Left blank, isFirebaseWebConfigured() is false and every web push code path (see
 * pushNotifications.web.ts / usePushNotifications.web.ts) no-ops — native Android/iOS push and
 * every non-push feature keep working regardless.
 */
export const FIREBASE_WEB_CONFIG = {
  apiKey: 'AIzaSyBm2TKclyOyilAaR1uafeKLY4yS8X7DEUM',
  authDomain: 'prabandhos-e5f2a.firebaseapp.com',
  projectId: 'prabandhos-e5f2a',
  storageBucket: 'prabandhos-e5f2a.firebasestorage.app',
  messagingSenderId: '246643933735',
  appId: '1:246643933735:web:76e7c04829958906a84402',
};

export const FIREBASE_VAPID_KEY = 'BNF70siEPYN4Y1qJmoic83raUDI0SpRHTMkkNIOksR8CkPPF7x7kqWPjPBfEeFudhP_zVapdhCsPqfpZq5n7fSs';

export const isFirebaseWebConfigured = (): boolean => !!(FIREBASE_WEB_CONFIG.apiKey && FIREBASE_VAPID_KEY);
