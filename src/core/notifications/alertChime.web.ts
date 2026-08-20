/// <reference lib="dom" />
// The RN TypeScript config deliberately omits the DOM lib (see BluetoothPrinter.web.ts for the
// same note) — this file is web-only, so it layers the browser globals back in just for itself.
/**
 * The two-note chime that goes with the pending-order alert (see PendingOrdersHost).
 *
 * Synthesised rather than played from a file: an alert tone is two sine waves, and generating
 * them costs nothing at all — no mp3 in the bundle, no asset to fail to load, no audio library
 * added to package.json for one beep. Web Audio is in every browser this app runs a till on.
 *
 * Never throws. A chime is an accompaniment to the alert, not the alert — an audio stack that
 * refuses to play must not take the toast and the pill down with it.
 */

/** The two notes, in Hz: A5 then E6. A rising pair reads as "something arrived" where a single
 * flat tone reads as an error, which is the opposite of what a new order is. */
const NOTES_HZ = [880, 1318.5];
/** Seconds. Short — this fires repeatedly while orders sit unconfirmed, and anything longer
 * starts to feel like an alarm in a room where people are also talking to customers. */
const NOTE_SECONDS = 0.13;
const GAP_SECONDS = 0.02;
/** Audible across a counter without being shrill. Full scale would clip on laptop speakers. */
const PEAK_GAIN = 0.22;
/** How long the note takes to reach PEAK_GAIN and to fall back to silence. A gain that jumps
 * straight to full is heard as a click on the front of the note, and one that stops dead is
 * heard as another on the end — the ramps are what make this a chime instead of a tick. */
const RAMP_SECONDS = 0.012;

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/**
 * Browsers refuse to let a page make noise until someone has interacted with it, and a context
 * created before that starts out 'suspended' — so the very first chime on a freshly loaded,
 * untouched tab would be silent no matter what play() does.
 *
 * These listeners exist to close that window: any click or keypress anywhere in the app wakes
 * the context up, so by the time an order actually lands the till has long since been touched.
 * Deliberately not `once` — the browser can suspend the context again (a backgrounded tab
 * does exactly this), and re-arming on every gesture is cheaper than tracking that. Both are
 * passive and exit immediately when there is nothing to resume.
 */
if (typeof window !== 'undefined') {
  const wake = () => {
    if (context?.state === 'suspended') void context.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake, { passive: true });
}

/** One note. `startAt` is on the context's own clock, which is what lets the second note be
 * scheduled ahead of time rather than waiting on a timer that a busy main thread would delay. */
function playNote(ctx: AudioContext, hz: number, startAt: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = hz;

  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(PEAK_GAIN, startAt + RAMP_SECONDS);
  gain.gain.setValueAtTime(PEAK_GAIN, startAt + NOTE_SECONDS - RAMP_SECONDS);
  gain.gain.linearRampToValueAtTime(0, startAt + NOTE_SECONDS);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(startAt);
  // Stopped a touch after the gain has already reached zero, so the node is torn down in
  // silence rather than mid-sample.
  oscillator.stop(startAt + NOTE_SECONDS + RAMP_SECONDS);
}

export const alertChime = {
  play(): void {
    try {
      const ctx = getContext();
      if (!ctx) return;
      // A tab that was backgrounded comes back suspended. Resuming is async, but the notes are
      // scheduled against the context clock and simply start once it is running again.
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

      const start = ctx.currentTime;
      NOTES_HZ.forEach((hz, i) => playNote(ctx, hz, start + i * (NOTE_SECONDS + GAP_SECONDS)));
    } catch {
      // See the module comment: the alert itself must survive a broken audio stack.
    }
  },
};
