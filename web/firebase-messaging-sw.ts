/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// Compiled by webpack into its own standalone bundle at dist-web/firebase-messaging-sw.js (see
// webpack.config.js's second entry) and registered from pushNotifications.web.ts — this is what
// lets a push actually show a system notification while the PrabandhOS tab is backgrounded or
// closed entirely, which page JS alone can never do (the page isn't running at that point).
//
// Uses the SDK's dedicated "/sw" subpath (not the same firebase/messaging import the page uses)
// — it's the modular build meant for a service-worker global scope (no `window`/DOM), self-
// hosted via this same webpack bundle rather than the old firebase-*-compat.js CDN
// importScripts() approach, so it works under this app's CSP with no extra allowlisting.
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import { FIREBASE_WEB_CONFIG } from '../src/core/config/firebaseWebConfig';

// TEMP DIAGNOSTIC — remove once push delivery is confirmed working end-to-end. Listens on the
// raw 'push' event (below Firebase's own parsing) so we can tell "no push ever arrived at this
// service worker" apart from "a push arrived but Firebase's onBackgroundMessage failed on it".
self.addEventListener('push', (event) => {
  console.log('[push diagnostic] RAW push event received at service worker:', event.data?.text());
});

console.log('[push diagnostic] firebase-messaging-sw.ts loaded, apiKey configured=', !!FIREBASE_WEB_CONFIG.apiKey);

if (FIREBASE_WEB_CONFIG.apiKey) {
  const app = initializeApp(FIREBASE_WEB_CONFIG);
  const messaging = getMessaging(app);

  onBackgroundMessage(messaging, (payload) => {
    // TEMP DIAGNOSTIC — remove once push delivery is confirmed working end-to-end.
    console.log('[push diagnostic] onBackgroundMessage payload:', payload);
    const title = payload.notification?.title ?? 'PrabandhOS';
    self.registration.showNotification(title, {
      body: payload.notification?.body,
      // Same asset HtmlWebpackPlugin emits the page's own favicon from (see index.html's
      // generated <link rel="icon">) — there's no separate notification-specific icon asset.
      icon: '/prabandhos_icon.svg',
      data: payload.data,
    });
  });
}

// Same target as tapping a push notification on native (see navigationRef.ts's own comment on
// why that's the Notification Center, not a fabricated per-order deep link) — focuses the
// existing PrabandhOS tab if one's open, otherwise opens a new one at the app's origin.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    }),
  );
});
