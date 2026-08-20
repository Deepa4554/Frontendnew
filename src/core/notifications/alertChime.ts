/**
 * Native counterpart to the pending-order chime (see alertChime.web.ts for the real tone,
 * which webpack picks up instead via its .web.ts resolution priority).
 *
 * Buzzes instead of beeping. Playing an actual sound on iOS/Android would mean adding a native
 * audio dependency for one alert — a new pod/gradle module, a rebuild, and another entry in
 * patches/ — and a phone in an apron pocket is felt long before it is heard across a kitchen
 * anyway. Vibration ships with React Native itself, so this costs nothing.
 *
 * The pattern mirrors the web chime's shape: two pulses, so it reads as a deliberate alert
 * rather than the single buzz every other app on the phone uses for everything. iOS ignores
 * the durations and vibrates its own fixed length per entry, which is fine — the count is the
 * part that carries.
 */
import { Vibration } from 'react-native';

/** [wait, vibrate, wait, vibrate] in ms — Android honours these, iOS just takes the count. */
const PATTERN = [0, 180, 110, 180];

export const alertChime = {
  play(): void {
    try {
      Vibration.vibrate(PATTERN);
    } catch {
      // A device with no vibrator (or a simulator) must not take the alert down with it.
    }
  },
};
