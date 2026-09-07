import { fmtElapsed } from './ElapsedTimer';
import { autoDismissMs } from '../ToastHost';

describe('fmtElapsed', () => {
  const s = (n: number) => n * 1000;

  it('counts MM:SS for anything inside the hour', () => {
    expect(fmtElapsed(0)).toBe('00:00');
    expect(fmtElapsed(s(9))).toBe('00:09');
    expect(fmtElapsed(s(90))).toBe('01:30');
    expect(fmtElapsed(s(59 * 60 + 59))).toBe('59:59');
  });

  it('switches to hours rather than letting the minutes run away', () => {
    // A dine-in table can sit all evening; "142:07" is not a number anyone reads.
    expect(fmtElapsed(s(3600))).toBe('1h 00m');
    expect(fmtElapsed(s(2 * 3600 + 22 * 60 + 7))).toBe('2h 22m');
  });

  it('clamps a clock skew that puts the start in the future', () => {
    expect(fmtElapsed(-5000)).toBe('00:00');
  });
});

describe('autoDismissMs', () => {
  it('holds a short confirmation long enough to register', () => {
    expect(autoDismissMs('Saved')).toBe(2200);
  });

  it('gives a long sentence time to actually be read', () => {
    const long = 'Voided Paneer Tikka off the bill — no stock reversal (already served).';
    expect(autoDismissMs(long)).toBeGreaterThan(autoDismissMs('Saved'));
  });

  it('never holds the screen longer than six seconds', () => {
    expect(autoDismissMs('x'.repeat(500), 'danger')).toBe(6000);
  });

  it('holds a problem longer than a confirmation of the same length', () => {
    const msg = 'Could not update quantity for this line right now.';
    expect(autoDismissMs(msg, 'danger')).toBeGreaterThan(autoDismissMs(msg, 'success'));
    expect(autoDismissMs(msg, 'warning')).toBeGreaterThan(autoDismissMs(msg, 'success'));
  });
});
