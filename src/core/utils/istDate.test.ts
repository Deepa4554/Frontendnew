import { istToday, istDateOf, istDatePlusDays, nowIst, formatIstReceiptTime, formatIstClockTime, formatIstDateTime } from './istDate';

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

  describe('formatIstReceiptTime', () => {
    it('renders the cafe wall-clock date and time, not the UTC one', () => {
      // 19:30Z on Aug 4 is 01:00 IST on Aug 5 — a bill settled just after midnight has to
      // print the 5th, not the 4th its stored UTC instant would suggest.
      expect(formatIstReceiptTime(new Date('2026-08-04T19:30:00Z'))).toBe('5 Aug, 01:00 AM');
    });

    it('formats noon and midnight correctly (the 12-hour wraparound)', () => {
      expect(formatIstReceiptTime(new Date('2026-08-05T06:30:00Z'))).toBe('5 Aug, 12:00 PM'); // noon IST
      expect(formatIstReceiptTime(new Date('2026-08-04T18:30:00Z'))).toBe('5 Aug, 12:00 AM'); // midnight IST
    });

    it('pads single-digit minutes', () => {
      expect(formatIstReceiptTime(new Date('2026-08-05T08:35:05Z'))).toBe('5 Aug, 02:05 PM');
    });
  });

  /**
   * Every case here is a UTC instant with a known IST reading, so the expected strings only
   * come out right if the formatter renders at +5:30 and ignores the machine's own timezone.
   * Run the file under TZ=UTC, TZ=Asia/Kolkata or TZ=America/New_York and all of it still
   * passes — that invariance is what's being tested, not the wording.
   */
  describe('formatIstClockTime', () => {
    it('renders midnight UTC as 05:30 AM, which is only true at +5:30', () => {
      // The sharpest case: this reads "12:00 AM" under UTC and "07:00 PM" (previous day) in
      // New York. Only IST gives 05:30 AM — so a device-local formatter can never pass it.
      expect(formatIstClockTime(new Date('2026-09-07T00:00:00Z'))).toBe('05:30 AM');
    });

    it('puts an order taken at 7:42 PM IST on the tile as 07:42 PM', () => {
      expect(formatIstClockTime(new Date('2026-09-07T14:12:00Z'))).toBe('07:42 PM');
    });

    it('zero-pads the hour so a column of times never jitters', () => {
      expect(formatIstClockTime(new Date('2026-09-07T02:30:00Z'))).toBe('08:00 AM');
      expect(formatIstClockTime(new Date('2026-09-06T19:30:00Z'))).toBe('01:00 AM');
    });

    it('reads noon and midnight IST as 12 PM and 12 AM, not 00', () => {
      expect(formatIstClockTime(new Date('2026-09-07T06:30:00Z'))).toBe('12:00 PM');
      expect(formatIstClockTime(new Date('2026-09-06T18:30:00Z'))).toBe('12:00 AM');
    });

    it('does not drift on a date a DST-aware conversion would have moved', () => {
      // India observes no DST, so March and November render at the same +5:30.
      expect(formatIstClockTime(new Date('2026-03-29T00:00:00Z'))).toBe('05:30 AM');
      expect(formatIstClockTime(new Date('2026-11-01T00:00:00Z'))).toBe('05:30 AM');
    });

    it('agrees with the receipt line built on top of it', () => {
      const at = new Date('2026-09-07T14:12:00Z');
      expect(formatIstReceiptTime(at).endsWith(formatIstClockTime(at))).toBe(true);
    });
  });

  describe('formatIstDateTime', () => {
    it('rolls the date forward at 18:30 UTC, not at UTC midnight', () => {
      expect(formatIstDateTime(new Date('2026-09-06T18:29:00Z'))).toBe('6 Sep 2026, 11:59 PM');
      expect(formatIstDateTime(new Date('2026-09-06T18:30:00Z'))).toBe('7 Sep 2026, 12:00 AM');
    });

    it('carries the year a receipt deliberately omits', () => {
      const at = new Date('2026-09-07T14:12:00Z');
      expect(formatIstDateTime(at)).toBe('7 Sep 2026, 07:42 PM');
      expect(formatIstReceiptTime(at)).not.toContain('2026');
    });
  });
});
