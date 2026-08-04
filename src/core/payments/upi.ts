/**
 * Builds the `upi://pay?...` deep link that every UPI app (GPay, PhonePe, Paytm, a bank app)
 * understands when it's scanned as a QR. One builder for both surfaces — the printed bill
 * (see receiptFormat.ts's buildReceiptLines) and the bill screen's Pay by UPI popup — so a
 * guest scanning paper and a guest scanning a screen are always sent to the identical intent.
 *
 * The amount is baked into the link (`am`), which is the whole point of generating this
 * per-bill instead of sticking one static QR on the counter: the guest's app opens with the
 * exact bill total already filled in and, on most apps, not editable.
 *
 * IMPORTANT — this is an intent link, not a payment gateway. Nothing reports back to
 * PrabandhOS when the guest actually pays: there's no webhook, no settlement callback, no way
 * for the app to know the money arrived. Staff still confirm the payment (the cafe's own UPI
 * app notification is the proof) and mark the order paid by hand, exactly as they do for cash.
 * Wiring up automatic settlement would mean a real PSP integration, which this is not.
 */

/** Longest `tn` (transaction note) worth sending — several UPI apps quietly truncate or
 * reject longer notes, and it only ever holds a short "Bill <order no>" string anyway. */
const MAX_NOTE_LENGTH = 50;

export interface UpiPaymentRequest {
  /** The cafe's UPI address, e.g. "cafe@okaxis" (see CafeSettings.UpiVpa). */
  vpa: string;
  /** Shown to the guest as who they're paying — the cafe's business name. */
  payeeName: string;
  /** Bill total in rupees. Sent with exactly 2 decimals, which is what the spec expects. */
  amount: number;
  /** Appears as the payment's note, e.g. "Bill T3-1042". Trimmed to MAX_NOTE_LENGTH. */
  note?: string;
}

/**
 * Returns null when there's nothing sensible to charge — no VPA configured, or a
 * zero/negative/non-finite total (a fully discounted or comped bill). Callers treat null as
 * "don't offer UPI here", which is why neither the print path nor the popup has to repeat
 * these checks.
 */
export const buildUpiPaymentUri = ({ vpa, payeeName, amount, note }: UpiPaymentRequest): string | null => {
  const trimmedVpa = vpa.trim();
  if (!trimmedVpa || !Number.isFinite(amount) || amount <= 0) return null;

  // encodeURIComponent on every value, not just the free-text ones: a business name with an
  // "&" ("Tea & Co") would otherwise terminate the query early and produce a link that pays
  // the right address with the wrong (or no) amount.
  const params = [
    `pa=${encodeURIComponent(trimmedVpa)}`,
    `pn=${encodeURIComponent(payeeName.trim() || 'Cafe')}`,
    `am=${amount.toFixed(2)}`,
    // Explicit currency — omitting it makes some apps prompt for one instead of going
    // straight to the confirm screen.
    'cu=INR',
  ];
  const trimmedNote = note?.trim().slice(0, MAX_NOTE_LENGTH);
  if (trimmedNote) params.push(`tn=${encodeURIComponent(trimmedNote)}`);

  return `upi://pay?${params.join('&')}`;
};
