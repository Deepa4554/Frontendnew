/**
 * Cafe local time (Asia/Kolkata, IST = UTC+5:30, no DST) — the frontend counterpart to the
 * API's `IstClock`. Anything that names a calendar day to the backend ("today's billing",
 * a report's from/to) means the cafe's own clock, and the API reads `from`/`to` as IST
 * calendar days (OrdersController shifts them to UTC bounds via IstClock.IstDateStartUtc).
 *
 * The trap this exists to close: `new Date().toISOString().slice(0, 10)` yields the *UTC*
 * calendar day, which between 00:00 and 05:30 IST is still yesterday. Billing asked for the
 * wrong day in that window, so orders taken after midnight were invisible until 5:30 AM —
 * present in the database the whole time, just never inside the queried range.
 *
 * Deliberately NOT device-local (`getFullYear()`/`getMonth()`/`getDate()`): the business day
 * is the cafe's, not the viewer's. A tablet left on the wrong timezone, or the web build
 * opened from anywhere else, must still agree with the server on which day "today" is.
 */

const IST_OFFSET_MS = 330 * 60 * 1000; // +5:30, fixed — Asia/Kolkata observes no DST

/** Wall-clock time at the cafe. Display/bucketing only — never persist this. */
export const nowIst = (): Date => new Date(Date.now() + IST_OFFSET_MS);

/**
 * The IST calendar date (`yyyy-MM-dd`) a given instant falls on. Shifting the instant by the
 * offset first makes the UTC-rendered fields read as IST wall clock, so `toISOString()` then
 * spells out the cafe's date rather than UTC's.
 */
export const istDateOf = (instant: Date): string =>
  new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Today at the cafe, as `yyyy-MM-dd` — the format the API's from/to params expect. */
export const istToday = (): string => istDateOf(new Date());

/**
 * `yyyy-MM-dd` for a whole number of days before (negative) or after (positive) today IST.
 * Safe to do by subtracting 24h per day because IST has no DST — no day is ever 23 or 25
 * hours long here.
 */
export const istDatePlusDays = (days: number): string =>
  istDateOf(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "26 Aug, 02:07 PM" — cafe wall-clock, for a printed bill/receipt.
 *
 * Deliberately not `toLocaleTimeString`/`toLocaleDateString` on the raw instant: those read
 * the DEVICE's timezone, not the cafe's. A tablet left on the wrong TZ (or a web build opened
 * from anywhere else) printed a time that didn't match the kitchen's clock or the till — the
 * WhatsApp PDF of the very same order already avoids this by shifting server-side (see
 * backend IstClock.ToIst); this is the client-side counterpart so the printed slip agrees
 * with it. Reads UTC-getters on an IST-shifted instant (see nowIst) rather than calling
 * Intl with a named timeZone, matching every other date helper in this file — no year, since
 * a receipt is read the day it's printed.
 */
export const formatIstReceiptTime = (instant: Date): string => {
  const d = new Date(instant.getTime() + IST_OFFSET_MS);
  const day = d.getUTCDate();
  const month = MONTHS[d.getUTCMonth()];
  let hour = d.getUTCHours();
  const minute = d.getUTCMinutes().toString().padStart(2, '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  // Zero-padded to match toLocaleTimeString's own 'hour: 2-digit' output — every screen this
  // replaces used that option, and a bill printed the moment before this change and the
  // moment after must read the same width ("01:00 AM", not "1:00 AM").
  return `${day} ${month}, ${hour.toString().padStart(2, '0')}:${minute} ${ampm}`;
};
