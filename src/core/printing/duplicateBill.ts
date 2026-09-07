import { ApiOrder } from '../api/ordersApi';
import { ApiSettings } from '../api/settingsApi';
import { formatIstReceiptTime } from '../utils/istDate';
import { PrintableReceipt, billAdjustmentsOf, inferTaxRatePct } from './receiptFormat';

/** How each order type prints on the slip's header row. A bill states the service ("Dine In"),
 *  which is not always how the app labels the same type elsewhere ("Dine-in" on a filter chip,
 *  "Token" for QSR). Anything unrecognised prints its own code rather than a blank. */
const SLIP_TYPE_LABEL: Record<string, string> = {
  DINE_IN: 'Dine In',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
  QSR: 'Token',
  CASH: 'Counter',
};

export const slipTypeLabel = (orderType: string): string => SLIP_TYPE_LABEL[orderType] ?? orderType;

/**
 * Rebuilds the slip for a bill that has already left the till — what Order Detail Report's
 * "Print Duplicate Bill" hands the printer. Kept out of the screen so the mapping can be tested
 * against real orders rather than only ever exercised by tapping a button.
 *
 * The bill's OWN stored money is printed verbatim: `tax` and `total` are never re-derived
 * through taxFiguresOf, and the rate is inferred from the order's own lines rather than read off
 * today's tax settings. A settled bill was charged what it was charged; a reprint that quietly
 * re-priced it against a rate the cafe changed last week would state a figure nobody ever paid.
 *
 * The cafe's IDENTITY, by contrast, can only come from live settings — business name, address,
 * GSTIN, licence, logo and footer are not snapshotted onto the order, so an old bill reprints
 * under the cafe's present-day header. That is the same thing the WhatsApp PDF has always done
 * (see backend ReceiptPdfBuilder, which reads live settings too), so both copies of one bill
 * still agree with each other — but it does mean a reprint is not a byte-for-byte facsimile of
 * the paper that was handed over, and after a GSTIN or a rename it will not be.
 */
export const buildDuplicateReceipt = (order: ApiOrder, settings?: ApiSettings): PrintableReceipt => ({
  businessName: settings?.businessName ?? 'Business',
  addressLine: settings?.address?.trim() || undefined,
  orderNumber: order.number,
  time: formatIstReceiptTime(new Date(order.createdAt)),
  title: order.title,
  orderTypeLabel: slipTypeLabel(order.orderType),
  guestPhone: order.guestPhone ?? undefined,
  waiterName: order.servedByName ?? order.createdByName,
  gstNumber: settings?.gstNumber,
  licenceNumber: settings?.licenceNumber,
  isCompositionScheme: settings?.isCompositionScheme,
  logoUrl: settings?.logoUrl,
  items: order.items,
  subtotal: order.subtotal,
  discountPct: order.discountPct || undefined,
  discountAmount: order.discountAmount || undefined,
  ...billAdjustmentsOf(order),
  taxRatePct: inferTaxRatePct(order),
  tax: order.tax,
  total: order.total,
  refunded: order.refunded,
  refundedAmount: order.refundedAmount,
  // A cancelled bill was never a bill. It still reaches this screen (the report deliberately
  // lists cancelled and unpaid orders so a day can be audited in full), so it has to say what it
  // is on the paper too — otherwise a reprint of a voided order is indistinguishable from a
  // live one, which is exactly the banner `refunded` exists to prevent.
  cancelled: order.cancelled,
  duplicate: true,
  footer: settings?.receiptFooter ?? 'Thank you for your visit!',
  showAddress: settings?.receiptShowAddress,
  showWaiterName: settings?.receiptShowWaiterName,
  showGuestPhone: settings?.receiptShowGuestPhone,
  showItemNotes: settings?.receiptShowItemNotes,
  showFooter: settings?.receiptShowFooter,
  // Deliberately omitted: the "Rate us on Google" QR. It asks a guest to review a visit as they
  // leave, and a duplicate is printed days later for a record or a lost bill — nobody is walking
  // out. See PrintableReceipt.reviewQrUrl.
});
