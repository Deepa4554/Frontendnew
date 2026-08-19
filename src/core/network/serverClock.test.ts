import { noteServerDate, serverNow, clockOffsetMs, isClockSynced, __resetServerClock } from './serverClock';

const MINUTE = 60 * 1000;

beforeEach(() => {
  __resetServerClock();
  jest.useRealTimers();
});

describe('serverClock', () => {
  it('falls back to the device clock until a response has been seen', () => {
    expect(isClockSynced()).toBe(false);
    // With nothing better to go on, the device's own clock is the best available guess.
    expect(Math.abs(serverNow() - Date.now())).toBeLessThan(50);
  });

  it('measures how far the device clock is from the server', () => {
    // A till running ten minutes FAST: the server's Date header is ten minutes behind it.
    const serverTime = new Date(Date.now() - 10 * MINUTE);
    noteServerDate(serverTime.toUTCString());

    expect(isClockSynced()).toBe(true);
    // ~ -10 minutes, allowing for the second-resolution of an HTTP date and test scheduling.
    expect(clockOffsetMs()).toBeLessThan(-9.9 * MINUTE);
    expect(clockOffsetMs()).toBeGreaterThan(-10.1 * MINUTE);
  });

  it('reports the server time, not the device time, once synced', () => {
    const serverTime = Date.now() - 10 * MINUTE;
    noteServerDate(new Date(serverTime).toUTCString());

    expect(Math.abs(serverNow() - serverTime)).toBeLessThan(2000);
  });

  it('re-syncs on every response, so a clock being corrected is tracked', () => {
    noteServerDate(new Date(Date.now() - 10 * MINUTE).toUTCString());
    expect(clockOffsetMs()).toBeLessThan(-9 * MINUTE);

    // The till's clock gets fixed; the next response should collapse the offset.
    noteServerDate(new Date().toUTCString());
    expect(Math.abs(clockOffsetMs())).toBeLessThan(2000);
  });

  it('ignores a missing or unparseable Date header instead of throwing', () => {
    noteServerDate(new Date(Date.now() - 10 * MINUTE).toUTCString());
    const before = clockOffsetMs();

    // A proxy that strips or mangles the header must not break every caller, and must not
    // silently reset a good offset to zero either.
    noteServerDate(undefined);
    noteServerDate(null);
    noteServerDate('not a date');
    noteServerDate(12345 as unknown as string);

    expect(clockOffsetMs()).toBe(before);
  });

  /**
   * The failure this whole module exists to prevent: AutoKotPrintHost asks "was this ticket
   * fired within the last 15 minutes?" — on a badly-set till, the device clock answers no for
   * a ticket fired seconds ago, and the kitchen silently loses it.
   */
  it('keeps a freshly-fired ticket inside a 15-minute window on a badly-set till', () => {
    const MAX_AGE = 15 * MINUTE;
    // Server says the batch fired 30 seconds ago...
    const firedAt = Date.now() - 20 * MINUTE + 30 * 1000;
    // ...but this till's clock is 20 minutes fast, so its own Date.now() is way ahead.
    noteServerDate(new Date(Date.now() - 20 * MINUTE).toUTCString());

    const ageByDeviceClock = Date.now() - firedAt;
    const ageByServerClock = serverNow() - firedAt;

    expect(ageByDeviceClock).toBeGreaterThan(MAX_AGE); // would have been discarded
    expect(ageByServerClock).toBeLessThan(MAX_AGE); // correctly still printable
  });
});
