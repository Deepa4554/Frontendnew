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

/** The notes, in Hz: C6, G6, C7 — a rising octave arpeggio, the figure every doorbell and till
 * bell already uses, because three rising notes read as "attend to this" where two read as a
 * blip and one flat tone reads as an error. Deliberately high: the ear is most sensitive
 * between roughly 2 and 4 kHz, so a note placed up there carries across a room at a level that
 * would go unheard an octave down. */
const NOTES_HZ = [1046.5, 1568, 2093];
/** Seconds. Short — this fires repeatedly while orders sit unconfirmed, and anything longer
 * starts to feel like an alarm in a room where people are also talking to customers. Three
 * notes at this length still land inside 0.4s, so the phrase got sharper, not longer. */
const NOTE_SECONDS = 0.11;
const GAP_SECONDS = 0.03;
/**
 * A square wave, not a sine. This is the single biggest reason the old chime went unheard: a
 * sine is the one waveform with no harmonics at all, so it has nothing above its fundamental to
 * ride over a room of conversation and a grinder — it is the easiest sound there is to miss. A
 * square is all harmonics, which is exactly why every appliance that needs you to look up uses
 * one, and at equal peak it is also ~3dB louder, its RMS being the full amplitude rather than
 * amplitude over root two.
 */
const TONE_TYPE: OscillatorType = 'square';
/**
 * Hz. A raw square is harsh — its harmonics run up forever, and the top ones are what make a
 * cheap buzzer sound cheap. Rolling off here keeps the harmonics that carry (the 3rd and 5th,
 * landing right in the ear's sensitive band) and drops the ones that only add glare, so this
 * reads as a bell rather than an alarm clock.
 */
const TONE_FILTER_HZ = 5000;
/** Audible across a counter without being shrill. Was 0.22, which paired with a sine left the
 * chime barely above a quiet room; a square at this level is roughly 11dB louder in RMS terms
 * and still leaves 40% headroom before anything clips on laptop speakers. */
const PEAK_GAIN = 0.6;
/** How long the note takes to reach PEAK_GAIN and to fall back to silence. A gain that jumps
 * straight to full is heard as a click on the front of the note, and one that stops dead is
 * heard as another on the end — the ramps are what make this a chime instead of a tick. */
const RAMP_SECONDS = 0.012;
/**
 * Seconds of head start given to the first note. Scheduling at exactly `currentTime` means
 * "already due": the audio thread works a render quantum ahead, so a note handed to it with no
 * lead has its attack clipped or is dropped outright. Small enough that nobody perceives it as
 * a delay, big enough that the phrase always starts whole.
 */
const SCHEDULE_LEAD_SECONDS = 0.02;

let context: AudioContext | null = null;

/**
 * iOS decides whether a page may make noise from the *audio session category*, not from the
 * volume alone — and the category WebKit picks by default is one the hardware ring/silent
 * switch mutes. That is why a synthesised chime is inaudible on an iPhone whose switch is
 * flicked to silent while every video on the same page still plays sound: media elements get
 * a playback category, bare Web Audio does not.
 *
 * `navigator.audioSession` (WebKit 16.4+, so Safari and every WKWebView browser on a current
 * iOS — Bluefy included) is the one lever a page has over that. 'playback' is the category for
 * audio that IS the point of the page rather than decoration, which is exactly a till alerting
 * someone that food has been ordered: it survives the silent switch.
 *
 * Best-effort by design. On a browser without the API this does nothing and the chime still
 * works everywhere it already worked.
 */
function claimPlaybackSession(): void {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
  } catch {
    // An older WebKit rejects the assignment outright. Nothing to do and nothing to report.
  }
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  // Before construction, not after: the category is read as the context takes the audio
  // hardware, so setting it afterwards leaves the first context on the muted default.
  if (!context) claimPlaybackSession();
  context ??= new Ctor();
  return context;
}

/**
 * Starts a single silent sample. WebKit hands a page the audio hardware only once it has seen
 * something actually *start* from inside a user gesture — a context that merely exists, even
 * one reporting 'running', can still be a context that never makes a sound. One frame of
 * silence is the cheapest thing that counts as playing.
 */
function primeSilently(ctx: AudioContext): void {
  try {
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // See the module comment.
  }
}

/**
 * Browsers refuse to let a page make noise until someone has interacted with it, and a context
 * created before that starts out 'suspended' — so the very first chime on a freshly loaded,
 * untouched tab would be silent no matter what play() does.
 *
 * These listeners exist to close that window: any click or keypress anywhere in the app wakes
 * the context up, so by the time an order actually lands the till has long since been touched.
 *
 * They must CREATE the context, not just resume one — an earlier version tested
 * `context?.state`, which is null until the first play() and so did nothing on every gesture
 * before the first order. The context was then first constructed inside play() itself, with no
 * gesture in sight, which is the one case iOS refuses to start: resume() outside a gesture is
 * not honoured there, so the till stayed silent through the orders that mattered.
 *
 * Deliberately not `once` — the browser can suspend the context again (a backgrounded tab, or
 * on iOS switching to another app and back, does exactly this), and re-arming on every gesture
 * is cheaper than tracking that. Both are passive and exit immediately when there is nothing
 * left to do.
 */
let primed = false;

/**
 * Resumes an already-unlocked context, and deliberately never creates one — that is the whole
 * difference between this and `wake` below. Creating a context here would be worse than
 * useless: away from a user gesture it would come up suspended and unresumable, yet it would
 * still burn the one-shot `primed` flag, so the real gesture that followed would skip the
 * priming that actually unlocks iOS.
 *
 * This exists for latency, not for unlocking. A suspended context freezes its clock, so a
 * chime fired while suspended cannot sound until resume() has finished — on iOS that means
 * waiting for the audio session to activate, a few hundred milliseconds during which the toast
 * is already on screen and the till appears to beep late. Resuming when the tab comes back to
 * the foreground takes that wait off the critical path: by the time an order lands the context
 * is already running and the notes start immediately.
 */
function warmUp(): void {
  if (context?.state === 'suspended') void context.resume().catch(() => {});
}

if (typeof window !== 'undefined') {
  const wake = () => {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    if (!primed) {
      primed = true;
      primeSilently(ctx);
    }
  };
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake, { passive: true });

  // Coming back to the foreground is the moment a suspend is most likely to have happened and
  // the moment there is most time to spare — an order arriving is the moment there is least.
  // 'pageshow' covers the bfcache restore, which fires no visibilitychange of its own.
  window.addEventListener('focus', warmUp, { passive: true });
  window.addEventListener('pageshow', warmUp, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') warmUp();
  });
}

/** One note. `startAt` is on the context's own clock, which is what lets the second note be
 * scheduled ahead of time rather than waiting on a timer that a busy main thread would delay. */
function playNote(ctx: AudioContext, hz: number, startAt: number): void {
  const oscillator = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  oscillator.type = TONE_TYPE;
  oscillator.frequency.value = hz;

  filter.type = 'lowpass';
  filter.frequency.value = TONE_FILTER_HZ;

  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(PEAK_GAIN, startAt + RAMP_SECONDS);
  gain.gain.setValueAtTime(PEAK_GAIN, startAt + NOTE_SECONDS - RAMP_SECONDS);
  gain.gain.linearRampToValueAtTime(0, startAt + NOTE_SECONDS);

  oscillator.connect(filter).connect(gain).connect(ctx.destination);
  oscillator.start(startAt);
  // Stopped a touch after the gain has already reached zero, so the node is torn down in
  // silence rather than mid-sample.
  oscillator.stop(startAt + NOTE_SECONDS + RAMP_SECONDS);
}

/** Lays the phrase out on the context clock, reading it at the moment of scheduling. */
function scheduleNotes(ctx: AudioContext): void {
  try {
    const start = ctx.currentTime + SCHEDULE_LEAD_SECONDS;
    NOTES_HZ.forEach((hz, i) => playNote(ctx, hz, start + i * (NOTE_SECONDS + GAP_SECONDS)));
  } catch {
    // See the module comment: the alert itself must survive a broken audio stack.
  }
}

export const alertChime = {
  play(): void {
    try {
      const ctx = getContext();
      if (!ctx) return;

      // A suspended context has a STOPPED clock, so currentTime is whatever instant it froze
      // at. Scheduling against that — which this used to do — puts every note in the past the
      // moment the clock restarts, and the phrase does not sound until resume() has finished:
      // on iOS, the few hundred milliseconds it takes to activate the audio session. That is
      // heard as the chime lagging behind its own toast. Waiting for the resume and reading
      // the clock afterwards costs the same wall time but puts the notes where they belong;
      // warmUp() above is what keeps that wait out of the way in the first place.
      if (ctx.state === 'suspended') {
        void ctx.resume().then(() => scheduleNotes(ctx)).catch(() => {});
        return;
      }

      scheduleNotes(ctx);
    } catch {
      // See the module comment: the alert itself must survive a broken audio stack.
    }
  },
};
