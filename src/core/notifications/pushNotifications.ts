import { PermissionsAndroid, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';

/** Android 13+ (API 33) gates notifications behind a runtime permission like camera/location —
 * messaging().requestPermission() only drives the iOS/web prompt, so Android needs this
 * PermissionsAndroid call instead. Older Android versions have no such prompt (permission is
 * implicitly granted), so this resolves true immediately for them. */
export const requestPushPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < 33) return true;
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }

  const authStatus = await messaging().requestPermission();
  return (
    authStatus === messaging.AuthorizationStatus.AUTHORIZED || authStatus === messaging.AuthorizationStatus.PROVISIONAL
  );
};

/** Null on any failure (permission denied, no Firebase config on this build, ...) — every
 * caller treats "no token" as "push isn't available on this device right now" rather than an
 * error to surface to the user. */
export const getPushToken = (): Promise<string | null> => messaging().getToken().catch(() => null);
