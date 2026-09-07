import { buildDuplicateReceipt, slipTypeLabel } from './duplicateBill';
import { buildReceiptLines } from './receiptFormat';
import { ApiOrder, OrderItem } from '../api/ordersApi';
import { ApiSettings } from '../api/settingsApi';

const line = (over: Partial<OrderItem> = {}): OrderItem => ({
  id: 1,
  menuItemId: 10,
  name: 'Masala Dosa',
  qty: 2,
  price: 120,
  variantId: null,
  variantName: null,
  selectedModifiers: [],
  taxableAmount: 240,
  taxAmount: 12,
  fireBatch: 1,
  status: 'SERVED',
  newQty: 0,
  readQty: 0,
  preparingQty: 0,
  readyQty: 0,
  servedQty: 2,
  voided: false,
  voidedAt: null,
  stationName: 'Kitchen',
  ...over,
});

const order = (over: Partial<ApiOrder> = {}): ApiOrder => ({
  id: 501,
  number: '#88',
  title: 'Table #T4',
  orderType: 'DINE_IN',
  tableCode: 'T4',
  tokenNumber: null,
  guestName: null,
  guestPhone: '9876500000',
  customerId: null,
  deliveryAddress: null,
  hasDeliveryLocation: false,
  deliveryLatitude: null,
  deliveryLongitude: null,
  items: [line()],
  subtotal: 240,
  discountPct: 0,
  discountAmount: 0,
  billDiscountAmount: 0,
  couponDiscountAmount: 0,
  offerDiscountAmount: 0,
  loyaltyDiscountAmount: 0,
  loyaltyPointsRedeemed: 0,
  serviceChargeAmount: 0,
  packingChargeAmount: 0,
  deliveryChargeAmount: 0,
  tipAmount: 0,
  roundOffAmount: 0,
  tax: 12,
  total: 252,
  status: 'SERVED',
  paid: true,
  refunded: false,
  refundedAmount: null,
  cancelled: false,
  cancelledAt: null,
  cancelReason: null,
  createdAt: '2026-08-14T09:30:00Z',
  branchId: null,
  createdByName: 'Ramesh',
  servedByName: 'Sunita',
  couponCode: null,
  giftCardCode: null,
  giftCardAmountApplied: 0,
  paymentMethod: 'Cash',
  payments: [],
  amountPaid: 252,
  ...over,
} as ApiOrder);

const settings = (over: Partial<ApiSettings> = {}): ApiSettings => ({
  businessName: 'Anna Madrasi',
  address: '  Jagatpura, Jaipur  ',
  gstNumber: null,
  licenceNumber: null,
  isCompositionScheme: false,
  logoUrl: null,
  receiptFooter: 'Thank you!',
  receiptShowAddress: true,
  receiptShowWaiterName: true,
  receiptShowGuestPhone: true,
  receiptShowItemNotes: true,
  receiptShowFooter: true,
  googleReviewUrl: 'https://g.page/r/verylongreviewlink',
  taxRatePct: 5,
  ...over,
} as ApiSettings);

const textOf = (receipt: ReturnType<typeof buildDuplicateReceipt>) =>
  buildReceiptLines(receipt).map((l) => ('text' in l ? l.text : '')).join('\n');

describe('buildDuplicateReceipt — the bill\'s own money is reprinted, never recomputed', () => {
  it('prints the stored tax and total verbatim', () => {
    // Cafe has since moved to 18%; the bill was charged 12 on 240 and must still say so.
    const r = buildDuplicateReceipt(order({ tax: 12, total: 252 }), settings({ taxRatePct: 18 }));
    expect(r.tax).toBe(12);
    expect(r.total).toBe(252);
  });

  it('takes the rate from the bill\'s own lines, not from today\'s settings', () => {
    const r = buildDuplicateReceipt(
      order({ items: [line({ taxRatePct: 5 })] }),
      settings({ taxRatePct: 18 }),
    );
    expect(r.taxRatePct).toBe(5);
  });

  it('carries every billing-time adjustment onto the slip', () => {
    const r = buildDuplicateReceipt(order({
      billDiscountAmount: 20,
      couponCode: 'DIWALI',
      couponDiscountAmount: 15,
      offerDiscountAmount: 10,
      appliedOfferTitle: 'Happy Hour',
      giftCardCode: 'GC-9',
      giftCardAmountApplied: 25,
      loyaltyDiscountAmount: 5,
      loyaltyPointsRedeemed: 5,
      serviceChargeAmount: 12,
      packingChargeAmount: 8,
      deliveryChargeAmount: 30,
      tipAmount: 20,
      roundOffAmount: -0.4,
    }), settings());
    const out = textOf(r);
    for (const label of ['Bill Discount', 'Coupon (DIWALI)', 'Happy Hour', 'Gift Card (GC-9)',
      'Loyalty Points (5)', 'Service Charge', 'Packing Charge', 'Delivery Charge', 'Tip', 'Round Off']) {
      expect(out).toContain(label);
    }
  });

  it('keeps voided lines off the reprint, exactly as the original did', () => {
    const out = textOf(buildDuplicateReceipt(
      order({ items: [line(), line({ id: 2, name: 'Filter Coffee', voided: true })] }),
      settings(),
    ));
    expect(out).toContain('Masala Dosa');
    expect(out).not.toContain('Filter Coffee');
  });
});

describe('buildDuplicateReceipt — a reprint says what it is', () => {
  it('marks every copy DUPLICATE', () => {
    expect(textOf(buildDuplicateReceipt(order(), settings()))).toContain('DUPLICATE COPY');
  });

  it('banners a refunded bill as well as marking it duplicate', () => {
    const out = textOf(buildDuplicateReceipt(order({ refunded: true, refundedAmount: 252 }), settings()));
    expect(out).toContain('DUPLICATE COPY');
    expect(out).toContain('REFUNDED - Rs.252.00');
  });

  it('banners a cancelled order, which the report deliberately still lists', () => {
    const out = textOf(buildDuplicateReceipt(order({ cancelled: true, paid: false }), settings()));
    expect(out).toContain('CANCELLED');
  });

  it('drops the "rate us on Google" QR, which only belongs on a guest walking out', () => {
    expect(buildDuplicateReceipt(order(), settings()).reviewQrUrl).toBeUndefined();
  });
});

describe('buildDuplicateReceipt — header', () => {
  it.each([
    ['DINE_IN', 'Dine In'],
    ['TAKEAWAY', 'Takeaway'],
    ['DELIVERY', 'Delivery'],
    ['QSR', 'Token'],
    ['CASH', 'Counter'],
  ])('labels a %s bill as %s', (type, label) => {
    expect(slipTypeLabel(type)).toBe(label);
  });

  it('falls back to the raw code for an order type it has never seen', () => {
    expect(slipTypeLabel('DRIVE_THRU')).toBe('DRIVE_THRU');
  });

  it('prefers the waiter who served over whoever rang it up', () => {
    expect(buildDuplicateReceipt(order(), settings()).waiterName).toBe('Sunita');
    expect(buildDuplicateReceipt(order({ servedByName: null }), settings()).waiterName).toBe('Ramesh');
  });

  it('trims the address and omits a blank one rather than printing an empty line', () => {
    expect(buildDuplicateReceipt(order(), settings()).addressLine).toBe('Jagatpura, Jaipur');
    expect(buildDuplicateReceipt(order(), settings({ address: '   ' })).addressLine).toBeUndefined();
  });

  it('survives settings that have not loaded yet', () => {
    const r = buildDuplicateReceipt(order(), undefined);
    expect(r.businessName).toBe('Business');
    expect(r.total).toBe(252);
    expect(textOf(r)).toContain('DUPLICATE COPY');
  });
});

describe('buildDuplicateReceipt — the document title follows TODAY\'s registration', () => {
  // Documents the known limitation rather than asserting it is desirable: GSTIN, business name
  // and address are not snapshotted on the order, so a reprint states the cafe as it is now.
  it('titles an old pre-GST bill TAX INVOICE once the cafe registers', () => {
    const out = textOf(buildDuplicateReceipt(order(), settings({ gstNumber: '08AAAPA1234A1Z5' })));
    expect(out).toContain('TAX INVOICE');
    expect(out).toContain('GSTIN: 08AAAPA1234A1Z5');
  });

  it('titles it BILL OF SUPPLY once the cafe moves to the composition scheme', () => {
    const out = textOf(buildDuplicateReceipt(
      order(),
      settings({ gstNumber: '08AAAPA1234A1Z5', isCompositionScheme: true }),
    ));
    expect(out).toContain('BILL OF SUPPLY');
  });
});
