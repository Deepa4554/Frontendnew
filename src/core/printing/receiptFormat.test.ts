import { splitGst, buildTaxBreakdown, buildReceiptLines, PrintableReceipt, PrintableReceiptItem } from './receiptFormat';

const round2 = (n: number) => Math.round(n * 100) / 100;

const item = (over: Partial<PrintableReceiptItem> = {}): PrintableReceiptItem => ({
  name: 'Item',
  qty: 1,
  price: 100,
  ...over,
});

describe('splitGst', () => {
  it('halves an evenly divisible amount', () => {
    expect(splitGst(50)).toEqual({ cgst: 25, sgst: 25 });
  });

  it('gives the odd paise to SGST instead of rounding both halves up', () => {
    // 5% of 333 is 16.65 — halving it lands on 8.325, which cannot be printed. Rounding
    // both to 8.33 would make the two tax rows out-total the tax actually charged.
    expect(splitGst(16.65)).toEqual({ cgst: 8.32, sgst: 8.33 });
  });

  it('never loses or invents a paise, for any amount', () => {
    for (let paise = 0; paise <= 2000; paise++) {
      const amount = paise / 100;
      const { cgst, sgst } = splitGst(amount);
      expect(round2(cgst + sgst)).toBe(amount);
    }
  });

  it('handles a zero bill', () => {
    expect(splitGst(0)).toEqual({ cgst: 0, sgst: 0 });
  });

  it('handles a single paise', () => {
    expect(splitGst(0.01)).toEqual({ cgst: 0, sgst: 0.01 });
  });
});

describe('buildTaxBreakdown', () => {
  it('splits a single slab into halves that add back to the slab', () => {
    const slabs = buildTaxBreakdown(
      [item({ taxRatePct: 5, taxableAmount: 1000, taxAmount: 50 })],
      5,
    );

    expect(slabs).toHaveLength(1);
    expect(slabs[0]).toMatchObject({
      ratePct: 5,
      halfRatePct: 2.5,
      taxAmount: 50,
      cgstAmount: 25,
      sgstAmount: 25,
    });
  });

  it('keeps the combined taxAmount alongside the halves', () => {
    // The halves are additive fields — callers that only want the combined figure (the POS
    // checkout preview) must keep working untouched.
    const [slab] = buildTaxBreakdown([item({ taxRatePct: 18, taxableAmount: 200, taxAmount: 36 })], 18);
    expect(slab.taxAmount).toBe(36);
    expect(slab.cgstAmount + slab.sgstAmount).toBe(36);
  });

  it('splits each slab separately when the bill mixes rates', () => {
    const slabs = buildTaxBreakdown(
      [
        item({ taxRatePct: 5, taxableAmount: 1000, taxAmount: 50 }),
        item({ taxRatePct: 12, taxableAmount: 500, taxAmount: 60 }),
      ],
      5,
    );

    expect(slabs.map((s) => [s.ratePct, s.halfRatePct, s.cgstAmount, s.sgstAmount])).toEqual([
      [5, 2.5, 25, 25],
      [12, 6, 30, 30],
    ]);
  });

  it('folds lines with no rate of their own into the fallback rate', () => {
    const slabs = buildTaxBreakdown([item({ taxableAmount: 400, taxAmount: 20 })], 5);
    expect(slabs).toHaveLength(1);
    expect(slabs[0]).toMatchObject({ ratePct: 5, halfRatePct: 2.5, cgstAmount: 10, sgstAmount: 10 });
  });

  it('ignores callers that send no per-line tax at all', () => {
    // The printer-settings sample receipt predates per-line tax; it must not produce a bogus
    // 0% row.
    expect(buildTaxBreakdown([item()], 5)).toEqual([]);
  });

  it('leaves a voided line out of the slab it was billed at', () => {
    // A voided line keeps the taxableAmount/taxAmount it last held — the server only
    // recomputes live lines — so counting it would overstate the slab's taxable value.
    const slabs = buildTaxBreakdown(
      [
        item({ taxRatePct: 5, taxableAmount: 1000, taxAmount: 50 }),
        item({ taxRatePct: 5, taxableAmount: 400, taxAmount: 20, voided: true }),
      ],
      5,
    );
    expect(slabs).toHaveLength(1);
    expect(slabs[0]).toMatchObject({ ratePct: 5, taxableAmount: 1000, taxAmount: 50 });
  });
});

describe('buildReceiptLines — cancelled items', () => {
  const receipt = (items: PrintableReceiptItem[]): PrintableReceipt => ({
    businessName: 'Cafe',
    orderNumber: '#1294',
    time: '02:07 PM',
    title: 'Table #T1',
    orderTypeLabel: 'Dine In',
    items,
    subtotal: 100,
    taxRatePct: 5,
    tax: 5,
    total: 105,
    footer: 'Thanks!',
  });

  const textOf = (lines: ReturnType<typeof buildReceiptLines>) =>
    lines.map((l) => ('text' in l ? l.text : '')).join('\n');

  it('does not print a cancelled line on the bill', () => {
    // The guest is not charged for it (the server drops voided lines from every total), so
    // itemising it makes the printed lines add up to more than the subtotal beneath them.
    const out = textOf(buildReceiptLines(receipt([
      item({ name: 'Chicken Lolipop', price: 100 }),
      item({ name: 'Mineral Water', qty: 2, price: 20, voided: true }),
    ])));

    expect(out).toContain('Chicken Lolipop');
    expect(out).not.toContain('Mineral Water');
  });

  it('still prints the live lines when every other line was cancelled', () => {
    const out = textOf(buildReceiptLines(receipt([
      item({ name: 'Chapati Plain', qty: 8, price: 12.5 }),
      item({ name: 'Chicken Dana', voided: true }),
      item({ name: '7 up', voided: true }),
    ])));

    expect(out).toContain('Chapati Plain');
    expect(out).not.toContain('Chicken Dana');
    expect(out).not.toContain('7 up');
  });
});
