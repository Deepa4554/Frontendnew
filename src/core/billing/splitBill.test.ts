import { equalShares, paidShareCount } from './splitBill';

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

describe('equalShares', () => {
  it('divides a cleanly divisible bill evenly', () => {
    expect(equalShares(450, 3)).toEqual([150, 150, 150]);
  });

  it('puts the rounding remainder on the last share so the shares still total the bill', () => {
    // The bug this exists to prevent: 3 x 33.33 collects 99.99 and the bill can never close.
    const shares = equalShares(100, 3);
    expect(shares).toEqual([33.33, 33.33, 33.34]);
    expect(sum(shares)).toBe(100);
  });

  it('always adds back up to the total, whatever the split', () => {
    for (const total of [100, 450.5, 999.99, 1234.57, 0.03]) {
      for (const ways of [2, 3, 4, 5, 6, 7, 8]) {
        expect(sum(equalShares(total, ways))).toBe(Math.round(total * 100) / 100);
      }
    }
  });

  it('returns nothing to collect for a zero, negative or nonsense total', () => {
    expect(equalShares(0, 3)).toEqual([]);
    expect(equalShares(-50, 3)).toEqual([]);
    expect(equalShares(Number.NaN, 3)).toEqual([]);
  });
});

describe('paidShareCount', () => {
  const shares = [150, 150, 150];

  it('counts nothing paid on an untouched bill', () => {
    expect(paidShareCount(shares, 0)).toBe(0);
  });

  it('counts each fully covered leading share', () => {
    expect(paidShareCount(shares, 150)).toBe(1);
    expect(paidShareCount(shares, 300)).toBe(2);
    expect(paidShareCount(shares, 450)).toBe(3);
  });

  it('does not count a share that is only part paid', () => {
    expect(paidShareCount(shares, 149)).toBe(0);
    expect(paidShareCount(shares, 220)).toBe(1);
  });

  it('tolerates a paisa of rounding drift, so an uneven split still reads as paid', () => {
    const uneven = equalShares(100, 3); // [33.33, 33.33, 33.34]
    expect(paidShareCount(uneven, 33.33)).toBe(1);
    expect(paidShareCount(uneven, 66.66)).toBe(2);
    expect(paidShareCount(uneven, 100)).toBe(3);
  });
});
