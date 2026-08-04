/**
 * A printer-agnostic model of a receipt as a list of lines, plus two renderers:
 * one to raw ESC/POS bytes (for the WiFi backend relay — see escpos.ts) and one to
 * the `<C>`/`<B>` tagged-text markup that react-native-thermal-receipt-printer's
 * BLEPrinter.printBill() expects (see BluetoothPrinter.ts). Both transports print
 * the exact same receipt content from this one shared source.
 */

import { buildUpiPaymentUri } from '../payments/upi';

/** Veg/non-veg tag as it travels to a printer. Mirrors the API's VegNonVegType enum. */
export type PrintableVegNonVegType = 'Veg' | 'NonVeg' | 'Jain' | 'Eggetarian';

export interface PrintableReceiptItem {
  name: string;
  qty: number;
  price: number;
  /** Veg/non-veg mark for this line (see OrderItem.vegNonVegType) — prints as a `[V]`/`[N]`
   * prefix, since a thermal printer's codepage can't render the green-circle/red-triangle
   * symbol the screens use (toPrinterAscii would turn it into "?"). */
  vegNonVegType?: PrintableVegNonVegType | null;
  /** Variant (Half/Full/...) billed instead of the base price — printed beside the name. */
  variantName?: string | null;
  modifier?: string | null;
  /** Toppings/add-ons on this line. Listed for transparency only — no amount is printed
   * beside them because `price` above already includes them (the backend folds every
   * selected option into the line price, see ResolveLinePricingAsync). */
  selectedModifiers?: PrintableAddOn[];
  /** Tax slab this line was billed at. Null/undefined falls back to the receipt's flat
   * `taxRatePct` — see buildTaxBreakdown. */
  taxRatePct?: number | null;
  /** Line value tax was charged on (gross minus its share of discounts). */
  taxableAmount?: number;
  /** Tax charged on this line. */
  taxAmount?: number;
}

/** The bill's tax summary, one row per rate. A GST invoice has to show taxable value and
 * tax per slab, so an order mixing a 5% item with a 12% one prints two rows instead of one
 * combined figure. Lines with no rate of their own (placed before tax groups existed, or an
 * item with no group and no cafe default) fold into `fallbackRatePct`. */
export const buildTaxBreakdown = (
  items: PrintableReceiptItem[],
  fallbackRatePct: number,
): { ratePct: number; taxableAmount: number; taxAmount: number }[] => {
  const byRate = new Map<number, { taxableAmount: number; taxAmount: number }>();
  for (const item of items) {
    // A caller that predates per-line tax (the printer-settings sample receipt) sends
    // neither field — it gets the single-rate path below rather than a bogus 0% row.
    if (item.taxAmount === undefined && item.taxableAmount === undefined) continue;
    const rate = item.taxRatePct ?? fallbackRatePct;
    const entry = byRate.get(rate) ?? { taxableAmount: 0, taxAmount: 0 };
    entry.taxableAmount += item.taxableAmount ?? 0;
    entry.taxAmount += item.taxAmount ?? 0;
    byRate.set(rate, entry);
  }
  return [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ratePct, sums]) => ({ ratePct, ...sums }));
};

export interface PrintableReceipt {
  businessName: string;
  addressLine?: string;
  orderNumber: string;
  time: string;
  title: string;
  orderTypeLabel: string;
  guestPhone?: string;
  waiterName?: string | null;
  /** GST/tax registration number — blank/undefined means don't print a line for it. */
  gstNumber?: string | null;
  items: PrintableReceiptItem[];
  subtotal: number;
  discountPct?: number;
  discountAmount?: number;
  taxRatePct: number;
  tax: number;
  total: number;
  footer: string;
  /** Receipt Builder toggles (see Cafe Settings → Receipt Builder) — every one defaults
   * to true so an existing caller that doesn't pass them keeps today's behavior. */
  showAddress?: boolean;
  showWaiterName?: boolean;
  showGuestPhone?: boolean;
  showItemNotes?: boolean;
  showFooter?: boolean;
  /** The cafe's UPI address (see CafeSettings.UpiVpa). Set it and the bill gets a
   * scan-to-pay QR addressed to this VPA; leave it blank/undefined (the cafe hasn't set one
   * up) and the bill prints exactly as it always did. */
  upiVpa?: string | null;
  /** What the scan-to-pay QR should charge — the order's outstanding balance, which is the
   * whole total only until something has been collected. Omit it and the QR falls back to
   * `total`, which is right for a fresh bill and wrong for every other case: reprinting a
   * settled bill would hand the guest a QR for the full amount a second time, and a
   * part-paid one would ask for money already taken. The bill screen and the WhatsApp PDF
   * both charge the balance (see OrderBillActions and ReceiptPdfBuilder) — this keeps the
   * printed copy saying the same thing. Zero means nothing is owed and no QR prints. */
  amountDue?: number;
}

export type ReceiptLine =
  | { kind: 'text'; text: string; align?: 'left' | 'center'; bold?: boolean; big?: boolean }
  | { kind: 'dashes' }
  | { kind: 'feed' }
  // A scannable QR: the WhatsApp order-tracking link on a token slip (buildTokenSlipLines)
  // or the pay-by-UPI link on a bill (buildReceiptLines). `size` is the ESC/POS module size
  // (escpos.ts); the BLE transport has no confirmed QR command and prints `fallbackText`
  // instead (see blePrinterMarkup.ts), so every caller has to say what a printer that can't
  // draw the code should tell the person holding the paper.
  | { kind: 'qr'; data: string; size?: number; fallbackText: string };

const money = (n: number) => `Rs.${n.toFixed(2)}`;

/** "Chowmein (Half)" — the variant is what was actually ordered and billed, so it belongs
 * on both documents. Without it a Half and a Full print identically. */
const itemLabel = (item: { name: string; variantName?: string | null }): string =>
  item.variantName ? `${item.name} (${item.variantName})` : item.name;

/** "[N] " for a non-veg line, "" when the item carries no tag. Letters, not symbols: a
 * thermal printer's built-in codepage has no green circle / red triangle, and
 * toPrinterAscii would replace one with "?". Untagged stays blank rather than defaulting
 * to veg — printing "[V]" on an untagged item would be a claim nobody made. */
const vegMark = (type?: PrintableVegNonVegType | null): string => {
  if (!type) return '';
  const letter = type === 'NonVeg' ? 'N' : type === 'Jain' ? 'J' : type === 'Eggetarian' ? 'E' : 'V';
  return `[${letter}] `;
};

/** Strips anything a thermal printer's built-in codepage likely can't render — both
 * renderers (escpos.ts, blePrinterMarkup.ts) need this, since free-text fields (footer,
 * guest name, item names) aren't guaranteed ASCII-only the way the money lines are. */
export const toPrinterAscii = (s: string): string =>
  s
    .replace(/₹/g, 'Rs.')
    .replace(/[–—]/g, '-') // en/em dash — common in order titles ("Takeaway – Walk-in")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x00-\x7E\n]/g, '?');

/** Pads/truncates a left+right pair to fit exactly `width` columns, right-aligning the value. */
const twoCol = (left: string, right: string, width: number): string => {
  const truncatedLeft = left.length > width - right.length - 1 ? left.slice(0, Math.max(0, width - right.length - 1)) : left;
  const gap = Math.max(1, width - truncatedLeft.length - right.length);
  return truncatedLeft + ' '.repeat(gap) + right;
};

/** 32 columns fits most 58mm thermal printers (the common size for small cafes); pass 48 for 80mm. */
export function buildReceiptLines(receipt: PrintableReceipt, columns = 32): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  // Sanitizes every line's text here, once, so neither renderer (escpos.ts,
  // blePrinterMarkup.ts) has to remember to do it — free-text fields like the footer
  // or a guest/item name aren't guaranteed ASCII-safe the way the money helper above is.
  const push = (l: ReceiptLine) => lines.push(l.kind === 'text' ? { ...l, text: toPrinterAscii(l.text) } : l);

  push({ kind: 'text', text: receipt.businessName, align: 'center', bold: true, big: true });
  if (receipt.addressLine && receipt.showAddress !== false) push({ kind: 'text', text: receipt.addressLine, align: 'center' });
  if (receipt.gstNumber) push({ kind: 'text', text: `GSTIN: ${receipt.gstNumber}`, align: 'center' });
  push({ kind: 'feed' });

  push({ kind: 'dashes' });
  push({ kind: 'text', text: twoCol(`Order ${receipt.orderNumber}`, receipt.time, columns) });
  push({ kind: 'text', text: twoCol(receipt.title, receipt.orderTypeLabel, columns) });
  if (receipt.waiterName && receipt.showWaiterName !== false) push({ kind: 'text', text: twoCol('Waiter', receipt.waiterName, columns) });
  if (receipt.guestPhone && receipt.showGuestPhone !== false) push({ kind: 'text', text: twoCol('Mobile', receipt.guestPhone, columns) });
  push({ kind: 'dashes' });

  for (const item of receipt.items) {
    push({ kind: 'text', text: twoCol(`${vegMark(item.vegNonVegType)}${item.qty}x ${itemLabel(item)}`, money(item.price * item.qty), columns) });
    for (const addOn of item.selectedModifiers ?? []) {
      push({ kind: 'text', text: `  + ${addOn.qty > 1 ? `${addOn.qty}x ` : ''}${addOn.name}` });
    }
    if (item.modifier && receipt.showItemNotes !== false) push({ kind: 'text', text: `  ${item.modifier}` });
  }
  push({ kind: 'dashes' });

  push({ kind: 'text', text: twoCol('Subtotal', money(receipt.subtotal), columns) });
  if (receipt.discountPct && receipt.discountAmount) {
    push({ kind: 'text', text: twoCol(`Discount (${receipt.discountPct}%)`, `-${money(receipt.discountAmount)}`, columns) });
  }
  // One row per slab when the bill mixes rates; otherwise the original single Tax line.
  const taxBreakdown = buildTaxBreakdown(receipt.items, receipt.taxRatePct);
  if (taxBreakdown.length > 1) {
    for (const slab of taxBreakdown) {
      push({ kind: 'text', text: twoCol(`Tax ${slab.ratePct}% on ${money(slab.taxableAmount)}`, money(slab.taxAmount), columns) });
    }
  } else {
    push({ kind: 'text', text: twoCol(`Tax (${taxBreakdown[0]?.ratePct ?? receipt.taxRatePct}%)`, money(receipt.tax), columns) });
  }
  push({ kind: 'text', text: twoCol('TOTAL', money(receipt.total), columns), bold: true });
  push({ kind: 'dashes' });

  // Scan-to-pay block, printed only once the cafe has a UPI address configured. Sits
  // directly under the total and above the footer, so the amount a guest just read is the
  // last thing on the slip before the code that charges it. buildUpiPaymentUri returns null
  // for a zero/comped bill, which drops the whole block rather than printing a QR that every
  // UPI app would reject. Nothing here confirms payment — see buildUpiPaymentUri's note.
  const amountDue = receipt.amountDue ?? receipt.total;
  const upiUri = receipt.upiVpa
    ? buildUpiPaymentUri({
        vpa: receipt.upiVpa,
        payeeName: receipt.businessName,
        amount: amountDue,
        note: `Bill ${receipt.orderNumber}`,
      })
    : null;
  if (upiUri) {
    push({ kind: 'text', text: 'SCAN TO PAY', align: 'center', bold: true });
    push({ kind: 'text', text: money(amountDue), align: 'center' });
    push({ kind: 'qr', data: upiUri, size: 6, fallbackText: `Pay by UPI to ${receipt.upiVpa}` });
    push({ kind: 'text', text: receipt.upiVpa ?? '', align: 'center' });
    push({ kind: 'dashes' });
  }

  if (receipt.showFooter !== false) push({ kind: 'text', text: receipt.footer, align: 'center' });
  push({ kind: 'feed' });

  return lines;
}

/** One selected topping/add-on as it prints under its item — `qty` > 1 renders as "2x".
 * Mirrors ordersApi's SelectedModifier, minus the price (a kitchen ticket carries none,
 * and on the bill the amount is already inside the line price). */
export interface PrintableAddOn {
  name: string;
  qty: number;
}

export interface PrintableKotItem {
  name: string;
  qty: number;
  /** Veg/non-veg mark (see PrintableReceiptItem.vegNonVegType) — arguably matters more here
   * than on the bill, since it's what tells the kitchen which prep area/utensils to use. */
  vegNonVegType?: PrintableVegNonVegType | null;
  /** Variant (Half/Full/...) that was ordered — the kitchen makes the wrong portion without it. */
  variantName?: string | null;
  /** Free-text kitchen instruction for this line, e.g. "No onion" — no prices belong
   * on a kitchen ticket, only what to make and how. */
  modifier?: string | null;
  /** Structured toppings/add-ons chosen for this line (see OrderItem.selectedModifiers).
   * Distinct from `modifier` above, which is only the typed note — without these the
   * kitchen never saw what was actually ordered, and made the plain item. */
  selectedModifiers?: PrintableAddOn[];
  /** Which prep station this line belongs to (see OrderItem.stationName) — used by
   * PrinterService.printKot to split a multi-station order into one sub-ticket per
   * station, each routed to its own configured printer. */
  stationName?: string;
}

/** A small customer-facing slip — just the token number, big enough to read from across
 * the counter, so a walk-in Token order customer has something physical to hold up when
 * their order's called. Printed once, at the moment the token number is first generated
 * (see POSCheckoutScreen's submitOrder) — a re-fire of the same token doesn't get a new
 * one, since the number hasn't changed. */
export interface PrintableTokenSlip {
  businessName: string;
  tokenNumber: number;
  time: string;
  /** wa.me deep link ("TRACK <code>" pre-filled) for the WhatsApp order-tracking QR —
   * omitted (no QR prints) whenever the tenant hasn't connected a WhatsApp Business number
   * yet, so a cafe that never sets it up gets exactly today's plain slip. See
   * OrdersController.GetOrCreateWhatsAppTracking, called right before this is built. */
  whatsAppDeepLink?: string | null;
}

export function buildTokenSlipLines(slip: PrintableTokenSlip, columns = 32): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  const push = (l: ReceiptLine) => lines.push(l.kind === 'text' ? { ...l, text: toPrinterAscii(l.text) } : l);

  push({ kind: 'text', text: slip.businessName, align: 'center', bold: true });
  push({ kind: 'feed' });
  push({ kind: 'dashes' });
  push({ kind: 'text', text: 'YOUR TOKEN NUMBER', align: 'center' });
  push({ kind: 'feed' });
  push({ kind: 'text', text: `${slip.tokenNumber}`, align: 'center', bold: true, big: true });
  push({ kind: 'feed' });
  push({ kind: 'dashes' });
  push({ kind: 'text', text: slip.time, align: 'center' });

  if (slip.whatsAppDeepLink) {
    push({ kind: 'feed' });
    push({ kind: 'dashes' });
    push({ kind: 'text', text: 'Track your order on WhatsApp', align: 'center', bold: true });
    push({ kind: 'text', text: 'Scan & tap Send', align: 'center' });
    push({ kind: 'qr', data: slip.whatsAppDeepLink, size: 6, fallbackText: 'Ask staff for your WhatsApp tracking link' });
  }

  push({ kind: 'feed' });

  return lines;
}

/** A kitchen ticket — no prices, no totals, no payment info. Print this at order time
 * (or manually re-print from Token Dashboard/Tables) so the kitchen has a physical copy
 * to work from; the customer-facing bill (buildReceiptLines) is a separate document,
 * generated only once the order's ready to be paid. */
export interface PrintableKot {
  /** e.g. "Token #5" or "Table T3". */
  title: string;
  /** e.g. "KOT #1073". */
  kotNumber: string;
  time: string;
  /** Guest/customer name, when one was captured for this order — printed as its own
   * line so the kitchen (or whoever's calling out orders) knows whose ticket it is.
   * Blank for anonymous walk-in/token orders. */
  guestName?: string | null;
  items: PrintableKotItem[];
}

export function buildKotLines(kot: PrintableKot, columns = 32): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  const push = (l: ReceiptLine) => lines.push(l.kind === 'text' ? { ...l, text: toPrinterAscii(l.text) } : l);

  push({ kind: 'text', text: 'KITCHEN ORDER TICKET', align: 'center', bold: true });
  push({ kind: 'feed' });
  push({ kind: 'dashes' });
  push({ kind: 'text', text: twoCol(kot.kotNumber, kot.time, columns), bold: true });
  push({ kind: 'text', text: kot.title, bold: true, big: true });
  if (kot.guestName) push({ kind: 'text', text: kot.guestName, bold: true });
  push({ kind: 'dashes' });

  for (const item of kot.items) {
    push({ kind: 'text', text: `${vegMark(item.vegNonVegType)}${item.qty}x ${itemLabel(item)}`, big: true });
    for (const addOn of item.selectedModifiers ?? []) {
      push({ kind: 'text', text: `  + ${addOn.qty > 1 ? `${addOn.qty}x ` : ''}${addOn.name}` });
    }
    if (item.modifier) push({ kind: 'text', text: `  >> ${item.modifier}` });
  }
  push({ kind: 'dashes' });
  push({ kind: 'feed' });

  return lines;
}
