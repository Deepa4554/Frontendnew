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
  /** Veg/non-veg tag (see OrderItem.vegNonVegType). Not printed — kept on the payload for
   * callers/future use, but the bill and KOT text intentionally carry no veg/non-veg mark. */
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
  /** Cancelled line — kept on the order (never deleted, so the KOT/void history survives) but
   * NOT part of the bill. Filtered out here rather than at each caller: every screen that
   * prints hands over `order.items` wholesale, and one that forgets would print food the guest
   * is not being charged for. The money fields are already void-aware server-side
   * (RecomputeTotals sums live lines only), which is exactly why the lines had to be filtered
   * too — an unfiltered list itemises to more than the subtotal it sits above. */
  voided?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Halves a GST figure into the Central and State components a tax invoice must state
 * separately — one combined "GST 5%" line does not make a valid tax invoice. The halves are
 * always equal (every slab a restaurant bills at divides evenly), and IGST never applies
 * because a meal is consumed where it is sold, so this is purely a presentation split.
 *
 * An odd paise cannot be halved — ₹16.65 becomes 8.32/8.33 — so the remainder goes to SGST
 * rather than rounding both halves up and printing tax rows that out-total the tax.
 *
 * Works in whole paise rather than halving the rupee figure: halving forces a rounding
 * decision, and floating point resolves it differently from the server's decimal arithmetic —
 * the printed slip and the PDF of the same bill have to state identical tax. Mirrors
 * GstSplit.Split exactly. */
export const splitGst = (taxAmount: number): { cgst: number; sgst: number } => {
  const totalPaise = Math.round(taxAmount * 100);
  const cgstPaise = Math.floor(totalPaise / 2);
  return { cgst: cgstPaise / 100, sgst: (totalPaise - cgstPaise) / 100 };
};

/** The bill's tax summary, one row per rate. A GST invoice has to show taxable value and
 * tax per slab, so an order mixing a 5% item with a 12% one prints two rows instead of one
 * combined figure. Lines with no rate of their own (placed before tax groups existed, or an
 * item with no group and no cafe default) fold into `fallbackRatePct`.
 *
 * Each slab also carries its CGST/SGST halves and the half-rate to label them with. Those are
 * additional fields rather than a replacement for `taxAmount`, so callers that only want the
 * combined figure keep working untouched. */
export const buildTaxBreakdown = (
  items: PrintableReceiptItem[],
  fallbackRatePct: number,
): {
  ratePct: number;
  taxableAmount: number;
  taxAmount: number;
  halfRatePct: number;
  cgstAmount: number;
  sgstAmount: number;
}[] => {
  const byRate = new Map<number, { taxableAmount: number; taxAmount: number }>();
  for (const item of items) {
    // Cancelled lines are not billed, so they owe no tax — and they keep whatever
    // taxableAmount/taxAmount they last held (the server recomputes live lines only), so
    // counting one would overstate its slab's taxable value on the invoice. Filtered inside
    // this function rather than by each caller: the POS checkout's on-screen GST preview
    // calls it directly with the raw line list too.
    if (item.voided) continue;
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
    .map(([ratePct, sums]) => {
      const { cgst, sgst } = splitGst(sums.taxAmount);
      return { ratePct, ...sums, halfRatePct: ratePct / 2, cgstAmount: cgst, sgstAmount: sgst };
    });
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
  /** Total taken off by auto-applied offers (BOGO, happy hour, category/item). */
  offerDiscountAmount?: number;
  /** Names of the offers that fired — the offer line's label. */
  appliedOfferTitle?: string | null;
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

/**
 * Splits text that's wider than the paper into pieces that each fit `width` columns,
 * breaking at a space wherever possible. A printer given an over-long line wraps it itself,
 * but only ever mid-character-count — a real 58mm KOT printed "1x Chicken Birya" / "ni".
 * A single word longer than the whole line still has to be cut hard; there's nowhere else to
 * break it. Leading indentation is repeated on continuation lines so a wrapped add-on stays
 * visually attached to the item it belongs to.
 */
export const wrapToWidth = (text: string, width: number): string[] => {
  if (width <= 0 || text.length <= width) return [text];
  const indent = /^ */.exec(text)![0];
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > width) {
    // lastIndexOf from `width` finds the last space that still fits. Landing inside the
    // indent means the first word alone overflows the line — cut at the margin instead.
    let cut = rest.lastIndexOf(' ', width);
    if (cut <= indent.length) cut = width;
    pieces.push(rest.slice(0, cut).trimEnd());
    const remainder = rest.slice(cut).trimStart();
    // Re-indenting can't be allowed to eat the whole line, or this would never terminate.
    rest = indent.length < width ? indent + remainder : remainder;
  }
  if (rest.length) pieces.push(rest);
  return pieces;
};

/**
 * Every build*Lines below funnels its lines through one of these. It sanitizes the text
 * once, here, so neither renderer (escpos.ts, blePrinterMarkup.ts) has to remember to —
 * free-text fields like the footer or a guest/item name aren't guaranteed ASCII-safe the way
 * the money helper is — and wraps anything wider than the paper at a space (see wrapToWidth).
 * Lines built by twoCol are already exactly `columns` wide, so they pass through untouched.
 */
const makePush = (lines: ReceiptLine[], columns: number) => (line: ReceiptLine) => {
  if (line.kind !== 'text') {
    lines.push(line);
    return;
  }
  for (const text of wrapToWidth(toPrinterAscii(line.text), columns)) lines.push({ ...line, text });
};

/**
 * A money row — a label on the left, an amount right-aligned against the margin.
 *
 * When both fit on one line this is just twoCol. When they don't, twoCol would keep the
 * amount and truncate the label to whatever's left, which on a 58mm bill turns
 * "2x Paneer Butter Masala (Full)" into "2x Paneer Butter Masala (Fu" — the guest can't tell
 * which item they're being charged for. So the label instead gets the full width to itself
 * (makePush wraps it at a space) and the amount drops to its own line beneath, still against
 * the right margin so the column of figures stays readable down the bill.
 */
const pushAmountRow = (
  push: (line: ReceiptLine) => void,
  label: string,
  amount: string,
  columns: number,
  bold = false,
) => {
  if (label.length + amount.length + 1 <= columns) {
    push({ kind: 'text', text: twoCol(label, amount, columns), bold });
    return;
  }
  push({ kind: 'text', text: label, bold });
  push({ kind: 'text', text: twoCol('', amount, columns), bold });
};

/** Pads/truncates a left+right pair to fit exactly `width` columns, right-aligning the value. */
const twoCol = (left: string, right: string, width: number): string => {
  const truncatedLeft = left.length > width - right.length - 1 ? left.slice(0, Math.max(0, width - right.length - 1)) : left;
  const gap = Math.max(1, width - truncatedLeft.length - right.length);
  return truncatedLeft + ' '.repeat(gap) + right;
};

/** 32 columns fits most 58mm thermal printers (the common size for small cafes); pass 48 for 80mm. */
export function buildReceiptLines(receipt: PrintableReceipt, columns = 32): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  const push = makePush(lines, columns);

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

  // Cancelled lines are off the bill entirely — see PrintableReceiptItem.voided.
  const billedItems = receipt.items.filter((i) => !i.voided);

  for (const item of billedItems) {
    pushAmountRow(push, `${item.qty}x ${itemLabel(item)}`, money(item.price * item.qty), columns);
    for (const addOn of item.selectedModifiers ?? []) {
      push({ kind: 'text', text: `  + ${addOn.qty > 1 ? `${addOn.qty}x ` : ''}${addOn.name}` });
    }
    if (item.modifier && receipt.showItemNotes !== false) push({ kind: 'text', text: `  ${item.modifier}` });
  }
  push({ kind: 'dashes' });

  pushAmountRow(push, 'Subtotal', money(receipt.subtotal), columns);
  if (receipt.discountAmount && receipt.discountAmount > 0) {
    // Gated on the amount, not the percentage, so a flat "₹50 off" (which carries no pct) still
    // prints. Label keeps the rate when there is one.
    const label = receipt.discountPct ? `Discount (${receipt.discountPct}%)` : 'Discount';
    pushAmountRow(push, label, `-${money(receipt.discountAmount)}`, columns);
  }
  if (receipt.offerDiscountAmount && receipt.offerDiscountAmount > 0) {
    // Name the offer so the drop is explained on the slip, not a bare "Offer".
    const label = receipt.appliedOfferTitle?.trim() || 'Offer';
    pushAmountRow(push, label, `-${money(receipt.offerDiscountAmount)}`, columns);
  }
  // One pair of rows per slab when the bill mixes rates, each slab shown as its CGST and
  // SGST halves — a tax invoice has to state the two components separately (see splitGst).
  const taxBreakdown = buildTaxBreakdown(billedItems, receipt.taxRatePct);
  if (receipt.tax <= 0) {
    // Nothing charged (unregistered or composition scheme) — a single plain row reads better
    // than a CGST and an SGST line that both say 0.00.
    pushAmountRow(push, 'Tax', money(receipt.tax), columns);
  } else if (taxBreakdown.length > 1) {
    for (const slab of taxBreakdown) {
      pushAmountRow(push, `CGST ${slab.halfRatePct}% on ${money(slab.taxableAmount)}`, money(slab.cgstAmount), columns);
      pushAmountRow(push, `SGST ${slab.halfRatePct}% on ${money(slab.taxableAmount)}`, money(slab.sgstAmount), columns);
    }
  } else {
    // Halve the receipt's own total rather than the slab's figure, so the printed rows always
    // reconcile against the amount being charged.
    const ratePct = taxBreakdown[0]?.ratePct ?? receipt.taxRatePct;
    const { cgst, sgst } = splitGst(receipt.tax);
    pushAmountRow(push, `CGST (${ratePct / 2}%)`, money(cgst), columns);
    pushAmountRow(push, `SGST (${ratePct / 2}%)`, money(sgst), columns);
  }
  pushAmountRow(push, 'TOTAL', money(receipt.total), columns, true);
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
  /** Veg/non-veg tag (see PrintableReceiptItem.vegNonVegType). Not printed on the ticket. */
  vegNonVegType?: PrintableVegNonVegType | null;
  /** Variant (Half/Full/...) that was ordered — the kitchen makes the wrong portion without it. */
  variantName?: string | null;
  /** Menu item's Subtitle, snapshotted at order time (see OrderItem.subtitle). Mainly
   * populated on Combo items, where it's the only record of what the combo contains — a
   * bare "Combo 1" line tells the kitchen nothing to actually make. Printed under the item
   * name, plain (no `+`/`>>` marker), so it reads as "what this is" rather than as an
   * add-on or a customer instruction. */
  subtitle?: string | null;
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
  const push = makePush(lines, columns);

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
  const push = makePush(lines, columns);

  push({ kind: 'text', text: 'KITCHEN ORDER TICKET', align: 'center', bold: true });
  push({ kind: 'feed' });
  push({ kind: 'dashes' });
  push({ kind: 'text', text: twoCol(kot.kotNumber, kot.time, columns), bold: true });
  push({ kind: 'text', text: kot.title, bold: true, big: true });
  if (kot.guestName) push({ kind: 'text', text: kot.guestName, bold: true });
  push({ kind: 'dashes' });

  // "1." through "9." are 2 chars, "10." is 3 — padding the number keeps every item name
  // starting in the same column instead of the list stepping right at the tenth line.
  const seqWidth = String(kot.items.length).length;

  kot.items.forEach((item, i) => {
    // A serial number the kitchen can call back ("number 3 ready") and tick off as each
    // dish leaves the pass. It counts within this ticket only — printKot splits a
    // multi-station order into one sub-ticket per station, and each of those is a separate
    // piece of paper in a different hand, so each restarts at 1.
    const seq = `${String(i + 1).padStart(seqWidth, ' ')}. `;
    // Bold, not `big`: a double-height line eats ~7mm of paper against a normal line's ~4mm,
    // and an item list is the one part of this ticket that grows without limit — a ten-item
    // order ran to 12cm. The title above stays big so the ticket is still identifiable at a
    // glance on the rail; the items only have to be readable, and bold does that.
    push({ kind: 'text', text: `${seq}${item.qty}x ${itemLabel(item)}`, bold: true });
    // Add-ons and notes indent past the serial number so they hang under their item's text
    // rather than under its number, which would read as another numbered line.
    const indent = ' '.repeat(seq.length);
    if (item.subtitle) push({ kind: 'text', text: `${indent}${item.subtitle}` });
    for (const addOn of item.selectedModifiers ?? []) {
      push({ kind: 'text', text: `${indent}+ ${addOn.qty > 1 ? `${addOn.qty}x ` : ''}${addOn.name}` });
    }
    if (item.modifier) push({ kind: 'text', text: `${indent}>> ${item.modifier}` });
  });
  push({ kind: 'dashes' });
  push({ kind: 'feed' });

  return lines;
}
