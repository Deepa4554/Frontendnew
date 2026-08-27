import { splitGst, buildTaxBreakdown, buildReceiptLines, buildKotLines, inferTaxRatePct, PrintableReceipt, PrintableReceiptItem } from './receiptFormat';

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

describe('buildReceiptLines — logo', () => {
  const receipt = (over: Partial<PrintableReceipt> = {}): PrintableReceipt => ({
    businessName: 'Cafe',
    orderNumber: '#1294',
    time: '02:07 PM',
    title: 'Table #T1',
    orderTypeLabel: 'Dine In',
    items: [item()],
    subtotal: 100,
    taxRatePct: 5,
    tax: 5,
    total: 105,
    footer: 'Thanks!',
    ...over,
  });

  it('prints no image line for a bill built before logos existed', () => {
    // Every caller that hasn't been touched yet calls buildReceiptLines with just (receipt,
    // columns) — no third argument, no receipt.logoUrl. That has to keep printing exactly
    // the bill it always did, not a blank logo band or a crash on a missing parameter.
    const lines = buildReceiptLines(receipt());
    expect(lines.some((l) => l.kind === 'image')).toBe(false);
  });

  it('carries the pre-fetched ESC/POS raster when the caller supplied one', () => {
    const raster = new Uint8Array([0x1d, 0x76, 0x30, 0x00]);
    const lines = buildReceiptLines(receipt(), 32, raster);
    const img = lines.find((l) => l.kind === 'image');
    expect(img).toBeDefined();
    expect(img!.kind === 'image' && img!.escposBytes).toBe(raster);
    // The 'browser' transport reads previewUrl, not escposBytes — a caller that only had a
    // raster (the wifi/bluetooth path) must not also claim to have a preview URL it never had.
    expect(img!.kind === 'image' && img!.previewUrl).toBeUndefined();
  });

  it('carries the plain logo URL when the receipt has one but no raster was fetched', () => {
    // The 'browser' transport's own case: PrinterService.printReceipt never fetches a raster
    // for it (see its own comment on why), so only receipt.logoUrl is available here.
    const lines = buildReceiptLines(receipt({ logoUrl: 'https://example.com/logo.png' }), 32, null);
    const img = lines.find((l) => l.kind === 'image');
    expect(img).toBeDefined();
    expect(img!.kind === 'image' && img!.previewUrl).toBe('https://example.com/logo.png');
    expect(img!.kind === 'image' && img!.escposBytes).toBeUndefined();
  });

  it('is the very first line, ahead of the business name', () => {
    // A logo the guest has to scroll past three lines to notice defeats the point of it — it
    // has to be the first thing on the slip, above even the cafe's own name.
    const lines = buildReceiptLines(receipt({ logoUrl: 'https://example.com/logo.png' }));
    expect(lines[0].kind).toBe('image');
  });

  it('never adds an image line to a kitchen ticket or a token slip', () => {
    // Only buildReceiptLines takes a logo parameter at all — buildKotLines/buildTokenSlipLines
    // don't, on purpose (see buildReceiptLines' own doc comment on why a KOT/token slip
    // shouldn't spend paper on it). This is really a type-level guarantee (there is no
    // parameter to pass), but asserting the shipped behaviour keeps that guarantee visible
    // here rather than only in a comment someone could stop reading.
    const kotLines = buildKotLines({
      title: 'Table #T1', kotNumber: 'KOT-1', time: '02:07 PM',
      items: [{ name: 'Chicken Lolipop', qty: 1 }],
    });
    expect(kotLines.some((l) => l.kind === 'image')).toBe(false);
  });
});

describe('buildReceiptLines — billing-time reductions and charges', () => {
  const receipt = (over: Partial<PrintableReceipt> = {}): PrintableReceipt => ({
    businessName: 'Cafe',
    orderNumber: '#1294',
    time: '02:07 PM',
    title: 'Table #T1',
    orderTypeLabel: 'Dine In',
    items: [item({ name: 'Paneer Masala', qty: 2, price: 500 })],
    subtotal: 1000,
    taxRatePct: 5,
    tax: 50,
    total: 1050,
    footer: 'Thanks!',
    ...over,
  });

  const textOf = (lines: ReturnType<typeof buildReceiptLines>) =>
    lines.map((l) => ('text' in l ? l.text : '')).join('\n');

  /** Every "label ....... Rs.x" row on the slip, as a signed number — a reduction prints
   * "-Rs.50.00", a charge "Rs.20.00". Lets a test add the printed bill up the way a customer
   * holding it would, instead of re-asserting the arithmetic the renderer was handed. */
  const moneyRows = (out: string) =>
    out
      .split('\n')
      .map((l) => /^(.*\S)\s+([+-]?)Rs\.([\d.]+)$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ label: m[1].trim(), amount: (m[2] === '-' ? -1 : 1) * Number(m[3]) }));

  const ALL_LABELS = [
    'Bill Discount', 'Coupon', 'Gift Card', 'Loyalty Points',
    'Service Charge', 'Packing Charge', 'Delivery Charge', 'Tip', 'Round Off',
  ];

  it('prints none of them on a bill where nothing was applied', () => {
    // The whole compatibility guarantee: a plain bill has to come off the printer exactly as
    // it did before any of these fields existed.
    const out = textOf(buildReceiptLines(receipt()));
    for (const label of ALL_LABELS) expect(out).not.toContain(label);
  });

  it('prints a row only for the adjustment that actually fired', () => {
    const out = textOf(buildReceiptLines(receipt({ serviceChargeAmount: 52.5 })));
    expect(out).toContain('Service Charge');
    expect(out).toContain('Rs.52.50');
    for (const label of ALL_LABELS.filter((l) => l !== 'Service Charge')) expect(out).not.toContain(label);
  });

  it('treats a zero amount as not applied', () => {
    // The server sends 0 rather than omitting the field, so gating on presence alone would
    // print "Tip Rs.0.00" on every bill in the cafe.
    const out = textOf(buildReceiptLines(receipt({
      tipAmount: 0, couponDiscountAmount: 0, packingChargeAmount: 0, roundOffAmount: 0,
    })));
    for (const label of ALL_LABELS) expect(out).not.toContain(label);
  });

  it('names the coupon, gift card and points that were used', () => {
    const out = textOf(buildReceiptLines(receipt({
      couponDiscountAmount: 20, couponCode: 'DIWALI20',
      giftCardAmountApplied: 40, giftCardCode: 'GC-8842',
      loyaltyDiscountAmount: 10, loyaltyPointsRedeemed: 10,
    })));
    expect(out).toContain('Coupon (DIWALI20)');
    expect(out).toContain('Gift Card (GC-8842)');
    expect(out).toContain('Loyalty Points (10)');
  });

  it('falls back to a bare label when there is no code to name', () => {
    const out = textOf(buildReceiptLines(receipt({ couponDiscountAmount: 20, giftCardAmountApplied: 40 })));
    expect(out).toContain('Coupon');
    expect(out).toContain('Gift Card');
    expect(out).not.toContain('(null)');
    expect(out).not.toContain('undefined');
  });

  it('signs a round-off in both directions', () => {
    expect(textOf(buildReceiptLines(receipt({ roundOffAmount: 0.4 })))).toContain('+Rs.0.40');
    // Without the sign a downward rounding reads as another charge on the bill.
    expect(textOf(buildReceiptLines(receipt({ roundOffAmount: -0.5 })))).toContain('-Rs.0.50');
  });

  it('prints the charges below the tax rows, not above them', () => {
    // They are added on top of tax by RecomputeTotals; printed above the GST rows the invoice
    // would be stating that they had been taxed.
    const out = textOf(buildReceiptLines(receipt({ serviceChargeAmount: 20 })));
    expect(out.indexOf('CGST')).toBeGreaterThan(-1);
    expect(out.indexOf('Service Charge')).toBeGreaterThan(out.indexOf('CGST'));
    expect(out.indexOf('Service Charge')).toBeLessThan(out.indexOf('TOTAL'));
  });

  it('adds up: Subtotal plus every printed row equals the printed TOTAL', () => {
    // The defect this whole block exists for. RecomputeTotals folds all of these into
    // Order.Total, so a slip that omits any one of them itemises to a figure other than the
    // TOTAL beneath it — and the customer is the one who notices.
    const out = textOf(buildReceiptLines(receipt({
      discountAmount: 50,
      discountPct: 5,
      billDiscountAmount: 30,
      couponDiscountAmount: 20,
      couponCode: 'DIWALI20',
      offerDiscountAmount: 100,
      appliedOfferTitle: 'Buy 2 Get 1 - Coffee',
      giftCardAmountApplied: 40,
      loyaltyDiscountAmount: 10,
      loyaltyPointsRedeemed: 10,
      serviceChargeAmount: 20,
      packingChargeAmount: 10,
      deliveryChargeAmount: 15,
      tipAmount: 25,
      roundOffAmount: -0.5,
      tax: 37.5,
      // 1000 gross - 250 of reductions + 37.50 tax + 70 of charges - 0.50 rounding
      total: 857,
    })));

    const rows = moneyRows(out);
    const start = rows.findIndex((r) => r.label === 'Subtotal');
    const end = rows.findIndex((r) => r.label === 'TOTAL');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const printedTotal = rows[end].amount;
    const addedUp = round2(rows.slice(start, end).reduce((sum, r) => sum + r.amount, 0));
    expect(addedUp).toBe(printedTotal);
    expect(printedTotal).toBe(857);
  });

  it('itemises every reduction and charge that was applied', () => {
    const out = textOf(buildReceiptLines(receipt({
      billDiscountAmount: 30,
      couponDiscountAmount: 20,
      offerDiscountAmount: 100,
      appliedOfferTitle: 'Happy Hour',
      giftCardAmountApplied: 40,
      loyaltyDiscountAmount: 10,
      serviceChargeAmount: 20,
      packingChargeAmount: 10,
      deliveryChargeAmount: 15,
      tipAmount: 25,
      roundOffAmount: -0.5,
    })));
    for (const label of ALL_LABELS) expect(out).toContain(label);
    expect(out).toContain('Happy Hour');
  });
});

describe('buildReceiptLines — refunded banner', () => {
  const receipt = (over: Partial<PrintableReceipt> = {}): PrintableReceipt => ({
    businessName: 'Cafe',
    orderNumber: '#1294',
    time: '02:07 PM',
    title: 'Table #T1',
    orderTypeLabel: 'Dine In',
    items: [item()],
    subtotal: 100,
    taxRatePct: 5,
    tax: 5,
    total: 105,
    footer: 'Thanks!',
    ...over,
  });

  const textOf = (lines: ReturnType<typeof buildReceiptLines>) =>
    lines.map((l) => ('text' in l ? l.text : '')).join('\n');

  it('prints no banner on a live bill', () => {
    expect(textOf(buildReceiptLines(receipt()))).not.toContain('REFUNDED');
  });

  it('prints the banner with the refunded amount', () => {
    const out = textOf(buildReceiptLines(receipt({ refunded: true, refundedAmount: 105 })));
    expect(out).toContain('REFUNDED - Rs.105.00');
  });

  it('prints a bare banner when the amount is not known', () => {
    const out = textOf(buildReceiptLines(receipt({ refunded: true, refundedAmount: null })));
    expect(out).toContain('REFUNDED');
    expect(out).not.toContain('REFUNDED -');
  });

  it('prints the banner below TOTAL and above the footer', () => {
    const out = textOf(buildReceiptLines(receipt({ refunded: true, refundedAmount: 105 })));
    expect(out.indexOf('TOTAL')).toBeLessThan(out.indexOf('REFUNDED'));
    expect(out.indexOf('REFUNDED')).toBeLessThan(out.indexOf('Thanks!'));
  });
});

describe('inferTaxRatePct', () => {
  it('recovers the flat rate a plain bill was charged at', () => {
    expect(inferTaxRatePct({ subtotal: 1000, tax: 50 })).toBe(5);
  });

  it('backs the reduction out of the base before dividing, for every reduction type', () => {
    // 1000 gross, 250 of combined reductions -> 750 taxable, taxed at 5% = 37.50.
    // A formula that only subtracts discountAmount (the old per-screen formula) would divide
    // 37.50 by 950 instead of 750, and misreport the rate as ~3.9% instead of 5%.
    expect(inferTaxRatePct({
      subtotal: 1000,
      tax: 37.5,
      discountAmount: 50,
      offerDiscountAmount: 100,
      billDiscountAmount: 30,
      couponDiscountAmount: 20,
      giftCardAmountApplied: 40,
      loyaltyDiscountAmount: 10,
    })).toBe(5);
  });

  it('falls back to 0 — not a guessed default — when nothing is taxable', () => {
    expect(inferTaxRatePct({ subtotal: 100, tax: 0, discountAmount: 100 })).toBe(0);
    expect(inferTaxRatePct({ subtotal: 0, tax: 0 })).toBe(0);
  });

  it('treats missing reduction fields as zero', () => {
    expect(inferTaxRatePct({ subtotal: 500, tax: 25 })).toBe(5);
  });
});
