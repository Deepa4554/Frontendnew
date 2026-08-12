export interface BillLineForShare {
  name: string;
  qty: number;
  price: number;
  modifier?: string | null;
  /** Cancelled line — on the order, off the bill. Callers pass `order.items` straight through,
   * so it is filtered here for the same reason the printed slip filters it (see
   * PrintableReceiptItem.voided in core/printing/receiptFormat). */
  voided?: boolean;
}

export interface ShareBillParams {
  businessName: string;
  orderNumber: string;
  items: BillLineForShare[];
  subtotal: number;
  discountAmount?: number;
  tax: number;
  total: number;
  /** 10-digit Indian mobile number, with or without spaces/dashes/+91. */
  guestPhone: string;
  /** Full URL to the on-demand PDF receipt (see ordersApi.getReceiptToken) — appended as
   * a tappable link so the guest can view/download the actual bill, not just this text
   * summary. Omit to send the text-only summary as before (e.g. if the token fetch failed). */
  receiptUrl?: string;
}

const formatBillText = (p: ShareBillParams): string => {
  // The PDF (now a short link — see ReceiptTokenService) already has the full
  // itemized breakdown, so the WhatsApp message itself stays short and readable
  // instead of repeating every line item as raw text. Only when there's no PDF
  // link to fall back on (token fetch failed) does the text need to be
  // self-sufficient, so it keeps the full itemized breakdown in that case.
  if (p.receiptUrl) {
    return [
      `Hi! Thanks for visiting *${p.businessName}* 🙏`,
      '',
      `Order ${p.orderNumber} — Total: *₹${p.total.toFixed(2)}*`,
      '',
      `📄 View/download your bill: ${p.receiptUrl}`,
      '',
      'See you again soon!',
    ].join('\n');
  }

  const lines = [
    `*${p.businessName}*`,
    `Order ${p.orderNumber}`,
    '',
    ...p.items.filter((i) => !i.voided).map((i) => `${i.qty}x ${i.name}${i.modifier ? ` (${i.modifier})` : ''} - ₹${(i.price * i.qty).toFixed(2)}`),
    '',
    `Subtotal: ₹${p.subtotal.toFixed(2)}`,
  ];
  if (p.discountAmount) lines.push(`Discount: -₹${p.discountAmount.toFixed(2)}`);
  lines.push(`Tax: ₹${p.tax.toFixed(2)}`);
  lines.push(`*Total: ₹${p.total.toFixed(2)}*`, '', 'Thank you for visiting!');
  return lines.join('\n');
};

/**
 * Builds a wa.me "click to chat" link with the bill pre-filled as the message —
 * opening it hands off to WhatsApp (native app on mobile, WhatsApp Desktop or
 * web.whatsapp.com on desktop/web) with Send still requiring a manual tap. No
 * API keys or business account needed; that's the tradeoff for not needing them.
 *
 * Returns null if the phone number isn't a valid 10-digit Indian mobile.
 */
export const buildWhatsAppBillUrl = (p: ShareBillParams): string | null => {
  const digitsOnly = p.guestPhone.replace(/\D/g, '');
  if (digitsOnly.length !== 10) return null;
  const text = formatBillText(p);
  return `https://wa.me/91${digitsOnly}?text=${encodeURIComponent(text)}`;
};

export interface PurchaseOrderLineForShare {
  name: string;
  quantity: number;
  unit: string;
  /** Omitted when the order was placed without an expected cost — price is confirmed later, at receiving. */
  unitCost?: number;
}

export interface SharePurchaseOrderParams {
  businessName: string;
  poId: number;
  vendorName: string;
  /** 10-digit Indian mobile number, with or without spaces/dashes/+91. */
  vendorPhone: string;
  items: PurchaseOrderLineForShare[];
  note?: string | null;
}

/**
 * Same click-to-chat pattern as buildWhatsAppBillUrl, aimed at a vendor instead of a
 * customer — pre-fills the PO's line items as a WhatsApp message so staff can review and
 * tap Send. No WhatsApp Business API involved, so there's no auto-send or read receipt;
 * that's the tradeoff for needing no API keys or per-message cost.
 *
 * Returns null if vendorPhone isn't a valid 10-digit Indian mobile.
 */
export const buildWhatsAppPurchaseOrderUrl = (p: SharePurchaseOrderParams): string | null => {
  const digitsOnly = p.vendorPhone.replace(/\D/g, '');
  if (digitsOnly.length !== 10) return null;
  // Price is optional at order time (confirmed later, at receiving) — only sum/show it
  // for lines that actually have one, instead of printing a misleading ₹0.00.
  const total = p.items.reduce((sum, i) => sum + (i.unitCost ? i.quantity * i.unitCost : 0), 0);
  const lines = [
    `Purchase Order #${p.poId} — *${p.businessName}*`,
    `To: ${p.vendorName}`,
    '',
    ...p.items.map((i) => `${i.quantity}${i.unit} x ${i.name}${i.unitCost ? ` - ₹${(i.quantity * i.unitCost).toFixed(2)}` : ''}`),
  ];
  if (total > 0) lines.push('', `*Estimated Total: ₹${total.toFixed(2)}*`);
  if (p.note) lines.push('', `Note: ${p.note}`);
  lines.push('', 'Please confirm pricing, availability, and the expected delivery date. Thank you!');
  return `https://wa.me/91${digitsOnly}?text=${encodeURIComponent(lines.join('\n'))}`;
};
