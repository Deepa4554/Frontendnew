/**
 * The server's idea of "now", for code that has to measure how old a server timestamp is.
 *
 * Every timestamp the API hands out (Order.createdAt, FireBatch.firedAt, ...) comes from the
 * server's UTC clock. Comparing one against `Date.now()` silently measures something else:
 * the gap between the event and *this device's* clock, which on a cheap till left unplugged,
 * or one that never talks to an NTP server, drifts by minutes. AutoKotPrintHost's "is this
 * ticket too old to still cook?" window is exactly that comparison, so a till running ten
 * minutes fast would throw away perfectly fresh kitchen tickets and nobody would know why.
 *
 * The fix needs no backend change: every HTTP response already carries a `Date` header, which
 * is the server's own clock at the moment it replied. One subtraction gives the offset between
 * the two clocks, and applying it turns the device's monotonic-ish local time into the
 * server's frame.
 *
 * Deliberately NOT a stored value that ages: the offset is refreshed on every response, so it
 * tracks a clock that is being corrected (or drifting) while the app runs.
 */

/** Server time minus device time, in ms. Zero until the first response is seen — which is the
 * right default: with nothing better to go on, the device's own clock IS the best guess. */
let offsetMs = 0;
let synced = false;

/**
 * Feed one response's `Date` header in. Ignores anything unparseable rather than throwing —
 * a proxy that strips or mangles the header must not break every caller of serverNow().
 */
export const noteServerDate = (headerValue: unknown): void => {
  if (typeof headerValue !== 'string') return;
  const serverMs = Date.parse(headerValue);
  if (Number.isNaN(serverMs)) return;
  offsetMs = serverMs - Date.now();
  synced = true;
};

/** Milliseconds since the epoch, on the server's clock. */
export const serverNow = (): number => Date.now() + offsetMs;

/**
 * How far this device's clock is from the server's, in ms — positive when the device is
 * behind. Exposed so a caller can decide whether an age is trustworthy enough to act on.
 */
export const clockOffsetMs = (): number => offsetMs;

/** False until a response has been seen, i.e. serverNow() is still just the device clock. */
export const isClockSynced = (): boolean => synced;

/** Test seam — resets both the offset and the synced flag. */
export const __resetServerClock = (): void => {
  offsetMs = 0;
  synced = false;
};
