import { buildUpiPaymentUri } from './upi';

/** Pulls one query param out of a built upi:// link, already URI-decoded. */
const param = (uri: string, key: string): string | null => {
  const match = uri.split('?')[1]?.split('&').find((p) => p.startsWith(`${key}=`));
  return match ? decodeURIComponent(match.slice(key.length + 1)) : null;
};

describe('buildUpiPaymentUri', () => {
  const base = { vpa: 'aroma@okaxis', payeeName: 'Aroma Cafe', amount: 450 };

  it('addresses the cafe VPA for the exact amount, in INR', () => {
    const uri = buildUpiPaymentUri(base)!;
    expect(uri.startsWith('upi://pay?')).toBe(true);
    expect(param(uri, 'pa')).toBe('aroma@okaxis');
    expect(param(uri, 'pn')).toBe('Aroma Cafe');
    expect(param(uri, 'cu')).toBe('INR');
  });

  it('always sends the amount with 2 decimals', () => {
    expect(param(buildUpiPaymentUri({ ...base, amount: 450 })!, 'am')).toBe('450.00');
    expect(param(buildUpiPaymentUri({ ...base, amount: 99.5 })!, 'am')).toBe('99.50');
    expect(param(buildUpiPaymentUri({ ...base, amount: 1234.567 })!, 'am')).toBe('1234.57');
  });

  it('escapes a payee name containing & so the amount survives the query string', () => {
    // The bug this guards: an unescaped "&" ends the pn value early and turns the rest of
    // the name into bogus params, leaving am= unreadable to the UPI app.
    const uri = buildUpiPaymentUri({ ...base, payeeName: 'Tea & Co' })!;
    expect(param(uri, 'pn')).toBe('Tea & Co');
    expect(param(uri, 'am')).toBe('450.00');
  });

  it('carries a trimmed note and drops an empty one', () => {
    expect(param(buildUpiPaymentUri({ ...base, note: '  Bill T3-1042  ' })!, 'tn')).toBe('Bill T3-1042');
    expect(param(buildUpiPaymentUri({ ...base, note: '   ' })!, 'tn')).toBeNull();
    expect(param(buildUpiPaymentUri(base)!, 'tn')).toBeNull();
  });

  it('caps an over-long note rather than sending one apps would reject', () => {
    const note = buildUpiPaymentUri({ ...base, note: 'x'.repeat(120) })!;
    expect(param(note, 'tn')!.length).toBe(50);
  });

  it('returns null when there is nothing chargeable — no VPA, or a zero/negative total', () => {
    expect(buildUpiPaymentUri({ ...base, vpa: '' })).toBeNull();
    expect(buildUpiPaymentUri({ ...base, vpa: '   ' })).toBeNull();
    expect(buildUpiPaymentUri({ ...base, amount: 0 })).toBeNull();
    expect(buildUpiPaymentUri({ ...base, amount: -10 })).toBeNull();
    expect(buildUpiPaymentUri({ ...base, amount: Number.NaN })).toBeNull();
  });
});
