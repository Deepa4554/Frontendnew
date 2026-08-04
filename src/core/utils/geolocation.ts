import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Why a location read failed. Callers show `message` verbatim — the distinction
 * matters because the fixes are completely different: 'insecure-context' can't be
 * resolved by granting any permission, while 'timeout' usually just needs a retry. */
export type LocationFailureReason =
  | 'insecure-context'
  | 'unsupported'
  | 'permission-denied'
  | 'position-unavailable'
  | 'timeout'
  | 'unknown';

export type LocationResult =
  | { ok: true; coords: Coordinates }
  | { ok: false; reason: LocationFailureReason; message: string };

const FAILURE_MESSAGES: Record<LocationFailureReason, string> = {
  'insecure-context':
    'Location needs a secure connection — open the app over https or on localhost, not a plain http:// IP address.',
  unsupported: "This browser can't provide location — try Chrome or Safari.",
  'permission-denied': 'Location access was denied — allow it for this site/app and try again.',
  'position-unavailable':
    "Your device couldn't determine a position — check that location services are turned on.",
  timeout: 'Getting your location took too long — move somewhere with a clearer signal and try again.',
  unknown: 'Could not get your location — enable location access and try again.',
};

const fail = (reason: LocationFailureReason): LocationResult => ({
  ok: false,
  reason,
  message: FAILURE_MESSAGES[reason],
});

/** Both the browser Geolocation API and @react-native-community/geolocation use the
 * same numeric error codes (1 denied / 2 unavailable / 3 timeout); anything else
 * (Android's PLAY_SERVICE_NOT_AVAILABLE, SETTINGS_NOT_SATISFIED, ...) falls through
 * to the generic message. */
function reasonFromErrorCode(code: number | undefined): LocationFailureReason {
  switch (code) {
    case 1:
      return 'permission-denied';
    case 2:
      return 'position-unavailable';
    case 3:
      return 'timeout';
    default:
      return 'unknown';
  }
}

/** iOS's permission prompt is driven by Info.plist's NSLocationWhenInUseUsageDescription
 * automatically the first time getCurrentPosition is called — only Android needs this
 * explicit runtime request. */
async function ensureAndroidPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
    title: 'Location Permission',
    message: 'PrabandhOS needs your location to record punch in/out attendance from the cafe.',
    buttonPositive: 'Allow',
  });
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

/** A high-accuracy GPS fix regularly exceeds the timeout indoors (and always does on an
 * emulator with no fix). Rather than failing outright, the second attempt accepts a
 * coarse network/wifi position and a recent cached one — still far more precise than the
 * 500m geofence needs. */
const PRIMARY_OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
const FALLBACK_OPTIONS = { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 };
const shouldRetryCoarse = (reason: LocationFailureReason) =>
  reason === 'timeout' || reason === 'position-unavailable';

type PositionGetter = (
  onSuccess: (pos: any) => void,
  onError: (err: any) => void,
  options: typeof PRIMARY_OPTIONS,
) => void;

function readPosition(getPosition: PositionGetter, options: typeof PRIMARY_OPTIONS): Promise<LocationResult> {
  return new Promise((resolve) => {
    getPosition(
      (pos) => resolve({ ok: true, coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } }),
      (err) => resolve(fail(reasonFromErrorCode(err?.code))),
      options,
    );
  });
}

async function readWithCoarseFallback(getPosition: PositionGetter): Promise<LocationResult> {
  const first = await readPosition(getPosition, PRIMARY_OPTIONS);
  if (first.ok || !shouldRetryCoarse(first.reason)) return first;
  return readPosition(getPosition, FALLBACK_OPTIONS);
}

/** Resolves the device's current GPS coordinates, or a typed failure describing why not
 * — location is mandatory for attendance (see AttendanceController.
 * EnsureWithinGeofenceAsync), so callers surface `message` and abort. Web uses the
 * browser's Geolocation API; native uses @react-native-community/geolocation. */
export async function getCurrentLocation(): Promise<LocationResult> {
  if (Platform.OS === 'web') {
    // Browsers expose geolocation only in a secure context (https, localhost or
    // 127.0.0.1). Served from the dev server as http://<lan-ip>:3000 the API is either
    // missing outright or errors as "denied" with no prompt, so check this FIRST —
    // otherwise the user is told to grant a permission that was never asked for.
    if ((globalThis as any).isSecureContext === false) return fail('insecure-context');

    const nav = (globalThis as any).navigator;
    if (!nav?.geolocation) return fail('unsupported');

    return readWithCoarseFallback((onSuccess, onError, options) =>
      nav.geolocation.getCurrentPosition(onSuccess, onError, options),
    );
  }

  const hasPermission = await ensureAndroidPermission();
  if (!hasPermission) return fail('permission-denied');

  return readWithCoarseFallback((onSuccess, onError, options) =>
    Geolocation.getCurrentPosition(onSuccess, onError, options),
  );
}
