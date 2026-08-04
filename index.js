/**
 * @format
 */

import { AppRegistry, Platform } from 'react-native';
import App from './src/app/App';
import { name as appName } from './app.json';

// Must be registered here, at module scope outside any component — RNFirebase invokes this
// even when the app is killed/backgrounded, before any React code has a chance to run. Doesn't
// need to do anything itself: a data-only push just needs SOME handler registered for Android to
// deliver it in that state at all; the actual UI update happens next time the app is foregrounded
// (usePushNotifications' onMessage/onNotificationOpenedApp, or the next Notification Center pull).
if (Platform.OS !== 'web') {
   
  const messaging = require('@react-native-firebase/messaging').default;
  messaging().setBackgroundMessageHandler(async () => {});
}

AppRegistry.registerComponent(appName, () => App);
