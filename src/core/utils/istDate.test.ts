import { istToday, istDateOf, istDatePlusDays, nowIst } from './istDate';

/** Freezes wall-clock time at a given IST moment, whatever timezone the test host runs in. */
const atIst = (istWallClock: string, run: () => void) => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(`${istWallClock}+05:30`));
  try {
    run();
  } finally {
    jest.useRealTimers();
  }
};

describe('istDate', () => {
  describe('istToday', () => {
    // The regression this module exists for: orders billed just after midnight IST were
    // invisible in Billing until 5:30 AM, because toISOString() still spelled yesterday.
    it('returns the cafe day, not the UTC day, in the post-midnight window', () => {
      atIst('2026-08-05T01:00:00', () => {
        expect(new Date().toISOString().slice(0, 10)).toBe('2026-08-04'); // the old, wrong value
        expect(istToday()).toBe('2026-08-05');
      });
    });

    it.each([
      ['2026-08-05T00:00:00', '2026-08-05'], // first instant of the cafe day
      ['2026-08-05T05:29:00', '2026-08-05'], // still inside the old blind spot
      ['2026-08-05T05:31:00', '2026-08-05'], // just past it — was already correct before
      ['2026-08-05T23:59:00', '2026-08-05'], // last minute before rollover
    ])('resolves %s IST to %s', (ist, expected) => {
      atIst(ist, () => expect(istToday()).toBe(expected));
    });

    it('rolls over at IST midnight, not UTC midnight', () => {
      atIst('2026-08-05T23:59:59', () => expect(istToday()).toBe('2026-08-05'));
      atIst('2026-08-06T00:00:01', () => expect(istToday()).toBe('2026-08-06'));
    });
  });

  describe('istDateOf', () => {
    it('maps a stored UTC instant onto the cafe day it belongs to', () => {
      // 19:30Z on Aug 4 is 01:00 IST on Aug 5 — the order from the bug report.
      expect(istDateOf(new Date('2026-08-04T19:30:00Z'))).toBe('2026-08-05');
    });

    it('keeps the same day for an instant well inside it', () => {
      expect(istDateOf(new Date('2026-08-05T06:00:00Z'))).toBe('2026-08-05');
    });
  });

  describe('istDatePlusDays', () => {
    it('gives the previous cafe day for -1 inside the post-midnight window', () => {
      atIst('2026-08-05T01:00:00', () => expect(istDatePlusDays(-1)).toBe('2026-08-04'));
    });

    it('crosses a month boundary backwards', () => {
      atIst('2026-08-01T02:00:00', () => expect(istDatePlusDays(-1)).toBe('2026-07-31'));
    });

    it('is a no-op at 0', () => {
      atIst('2026-08-05T01:00:00', () => expect(istDatePlusDays(0)).toBe(istToday()));
    });
  });

  describe('nowIst', () => {
    it('reads 5:30 ahead of UTC', () => {
      atIst('2026-08-05T01:00:00', () => {
        // Shifted instant, so the UTC-rendered fields spell out IST wall clock.
        expect(nowIst().toISOString()).toBe('2026-08-05T01:00:00.000Z');
      });
    });
  });
});
