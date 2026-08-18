import { apiClient } from '../network/api';
import { PagedResult } from './types';

export type OrderStatus = 'NEW' | 'READ' | 'PREPARING' | 'READY' | 'SERVED';
/** Mirrors the server's Domain.VoidReasonCode — why a line came off a bill. Sent by NAME (the
 * API registers JsonStringEnumConverter, and query-string binding takes names too). The list's
 * labels and the "kitchen never made it" defaults live with the UI, in
 * shared/components/billing/voidReasons. */
export type VoidReasonCode =
  | 'MisTappedServed'
  | 'WrongItemPunched'
  | 'GuestReturned'
  | 'KitchenError'
  | 'Other';
/** Kitchen stages in order — index gives progress; used for column layout and next-stage.
 * REMOVED READ: Workflow simplified to NEW → PREPARING → READY → SERVED (no READ) */
export const STAGE_FLOW: OrderStatus[] = ['NEW', 'PREPARING', 'READY', 'SERVED'];

export interface RushForecast {
  hasEnoughData: boolean;
  rushExpected: boolean;
  nextDaypartLabel: string | null;
  nextDaypartAvgOrders: number | null;
}

/** Returned instead of the order when a Manager's refund/discount lands above
 * ApprovalThresholds — held as a pending ApprovalRequest for the Owner instead of applying
 * immediately (see OrdersController.Refund/ApplyBillDiscount). */
export interface PendingApprovalResponse {
  pendingApproval: true;
  message: string;
}

/** One selected topping/add-on on an order line — snapshot of a ModifierOption's name/price
 * at the moment the item was ordered (see backend OrderItem.SelectedModifiers). */
export interface SelectedModifier {
  modifierOptionId: number;
  name: string;
  /** Per-unit price — this selection adds `price * qty` to its line. */
  price: number;
  /** How many were picked (e.g. 2x Extra Cheese). Only "Quantity"-type modifier groups
   * exceed 1; Radio/MultiSelect are capped at 1 by the backend. */
  qty: number;
}

export interface OrderItem {
  /** Server row id — needed to remove a specific line (DELETE /orders/{id}/items/{itemId}). */
  id: number;
  /** Menu item id — Production View groups identical dishes across KOTs by this. */
  menuItemId: number;
  name: string;
  qty: number;
  /** Effective per-unit price already including the selected variant + every selected
   * modifier's price delta — qty * price is always the line total. */
  price: number;
  modifier?: string;
  /** Half/Full/... picked for this line, if any — null means the item's own base price. */
  variantId: number | null;
  variantName: string | null;
  /** Toppings/add-ons picked for this line. */
  selectedModifiers: SelectedModifier[];
  /** Tax slab this line was billed at, snapshotted when it was placed. Null on lines from
   * before tax groups existed, and on items with no group and no cafe default — those bill
   * at Cafe Settings' flat `taxRatePct`, which is what to fall back to when displaying. */
  taxRatePct?: number | null;
  /** Line gross minus its proportional share of order-level discounts — the value tax was
   * charged on. Needed for the bill's per-rate breakdown. */
  taxableAmount: number;
  /** Tax charged on this line. The order's `tax` is the sum of these. */
  taxAmount: number;
  /** Which fire-round this line was sent to the kitchen in. 0 = not yet fired (still
   * editable, invisible on KDS). === order.currentFireBatch means it's the newest batch. */
  fireBatch: number;
  /** Derived overall stage = least-progressed stage with ≥1 unit (SERVED once all served). */
  status: OrderStatus;
  /** Per-UNIT distribution across stages (partial-quantity production) — these sum to qty.
   * A "Chowmein ×6" line can have preparingQty:3 and newQty:3 at once. */
  newQty: number;
  readQty: number;
  preparingQty: number;
  readyQty: number;
  servedQty: number;
  /** Voided via RemoveItem (once fired) or a whole-order Cancel — kept in the list (not
   * deleted) so KOT history survives; excluded from totals server-side. */
  voided: boolean;
  voidedAt: string | null;
  /** Which kitchen station preps this line — snapshotted from the menu item's station at
   * order time (see backend OrderItem.StationName). Drives KDS station filtering and
   * per-station KOT print routing. */
  stationName: string;
  /** Veg/non-veg mark, snapshotted from the menu item when this line was placed — see
   * backend OrderItem.VegNonVegType. Null for untagged items and for lines placed before
   * this field existed. */
  vegNonVegType?: 'Veg' | 'NonVeg' | 'Jain' | 'Eggetarian' | null;
  /** Menu item's Subtitle, snapshotted when this line was placed — see backend
   * OrderItem.Subtitle. Mainly populated on Combo items, where it's the only record of
   * what the combo actually contains (e.g. "Aloo Tikki Burger + Fries + Cold Drink");
   * printed on the KOT under the item name so the kitchen isn't just told "Combo 1". Null
   * for items with no subtitle and for lines placed before this field existed. */
  subtitle?: string | null;
}

/** Units of one line currently at each stage — keyed by OrderStatus. */
export const unitsAtStage = (item: OrderItem, stage: OrderStatus): number => {
  switch (stage) {
    case 'NEW': return item.newQty;
    case 'READ': return item.readQty;
    case 'PREPARING': return item.preparingQty;
    case 'READY': return item.readyQty;
    case 'SERVED': return item.servedQty;
  }
};

/** One fire round's own kitchen status, independent of every other round on the same
 * order — a round already Preparing/Ready/Served is never disturbed by a later round
 * firing. KDS flattens these into separate ticket cards instead of using order.status. */
export interface FireBatch {
  batchNumber: number;
  status: OrderStatus;
  firedAt: string;
  /** Sequential kitchen-ticket id, derived server-side from a sequence shared across all
   * tenants — so unlike ApiOrder.number (per-cafe) this is NOT the cafe's own KOT count.
   * It only needs to be stable and ordered for the KOT-wise KDS view to sort/label by. */
  kotNumber: string;
}

/** One settled tender against a bill — see ApiOrder.payments. */
export interface OrderPayment {
  method: string;
  amount: number;
}

/** One tender in a split payment request — e.g. part Cash, part Card.
 *
 *  'Due' is a tender here too, but a special one: it settles the bill without any money
 *  changing hands and parks the amount on the customer's khata instead (see
 *  khatabookApi). It's what makes "₹200 cash now, ₹250 udhaar" a single settle. Sending it
 *  requires a customer name + 10-digit mobile (see PayOptions) and is rejected alongside
 *  allowPartial/keepOpen, both of which would leave the order open with the same rupees
 *  owed in two places. */
export interface PaymentSplit {
  method: 'Cash' | 'Card' | 'UPI' | 'Due';
  amount: number;
}

/** The extras `pay` takes beyond the tenders themselves. guestName/guestPhone are only read
 *  when a 'Due' tender is in play, where they're compulsory — the credit has to land on an
 *  identifiable customer's khata, and the number is what that khata is looked up by. Both
 *  are stamped onto the order as a side effect, so a bill rung up as a walk-in ends up
 *  naming whoever actually took the credit. */
export interface PayOptions {
  allowPartial?: boolean;
  keepOpen?: boolean;
  guestName?: string;
  guestPhone?: string;
  /** An explicit "yes, bill the lines that never went to the kitchen (fireBatch === 0)". The
   *  server REQUIRES it whenever such a line exists and the call would close the bill, refusing
   *  the settle with a 409 otherwise (see backend EnsureUnfiredItemsResolved) — the bill charges
   *  an unfired line like any other, so settling with one silently bills food nobody made.
   *  The two answers that change the total are separate calls made BEFORE settling, with the new
   *  total on screen: `fire` to send them to the kitchen, `removeItem` to take them off. Either
   *  leaves nothing unfired, and the settle then needs nothing here. Omit on the ordinary bill. */
  unfiredItems?: 'keep';
}

export interface ApiOrder {
  id: number;
  /** The cafe's own running bill number, pre-formatted ("#7") — starts at 1 for each cafe
   * and never resets. Display this; never derive a number from `id`, which is a sequence
   * shared by every tenant on the platform. See backend OrderNumberFormat / BillCounter. */
  number: string;
  title: string;
  orderType: string;
  tableCode: string | null;
  /** QSR counter orders only — daily-resetting ticket number, null for every other type. */
  tokenNumber: number | null;
  guestName: string | null;
  guestPhone: string | null;
  customerId: number | null;
  items: OrderItem[];
  subtotal: number;
  discountPct: number;
  /** Order-time manual discount only (coupon/gift card are separate, billing-time). */
  discountAmount: number;
  /** Manager markdown applied at billing time. */
  billDiscountAmount: number;
  /** Coupon reduction applied at billing time. Paired with couponCode. */
  couponDiscountAmount: number;
  /** Total taken off by auto-applied rule-driven offers (BOGO, happy hour, category/item). */
  offerDiscountAmount: number;
  /** Names of the offers that fired, comma-joined — for the bill's offer line. Null if none. */
  appliedOfferTitle?: string | null;
  /** Loyalty points redeemed as a bill-time discount (1 point = ₹1). Paired with
   * loyaltyPointsRedeemed. */
  loyaltyDiscountAmount: number;
  loyaltyPointsRedeemed: number;
  /** Billing-time charges — added on top of tax, not themselves taxed. */
  serviceChargeAmount: number;
  packingChargeAmount: number;
  deliveryChargeAmount: number;
  tipAmount: number;
  /** Final rounding nudge so the total lands on a whole figure — either sign. */
  roundOffAmount: number;
  tax: number;
  total: number;
  status: OrderStatus;
  paid: boolean;
  refunded: boolean;
  refundedAmount: number | null;
  /** Whole-order cancel — distinct from refunded, which only applies to a paid order. */
  cancelled: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  branchId: number | null;
  /** Whoever was logged in when this order was rung up — the till operator, not
   * necessarily the waiter (see servedByName). Null for guest QR self-orders. */
  createdByName: string | null;
  /** The staff member who actually took/served this order — prefer this over
   * createdByName when showing "who handled this order" in the UI. */
  servedByName: string | null;
  /** Coupon redeemed against this order at billing time, if any. */
  couponCode: string | null;
  /** Gift card redeemed against this order at billing time, if any. */
  giftCardCode: string | null;
  giftCardAmountApplied: number;
  /** How the bill was settled (Cash/Card/UPI/Multiple). Null until paid. */
  paymentMethod: string | null;
  /** One row per tender used to settle the bill — a single-method payment is still one
   * row; a split payment (part Cash, part Card, ...) is one row per method. Also carries
   * partial tenders collected before the bill is fully settled (see partiallyPaid). */
  payments: OrderPayment[];
  /** Sum of `payments` — non-zero before `paid` flips true only once a deliberate partial
   * payment (Pay's `allowPartial`) has been collected. Counts the 'Due' tender too, so
   * `balanceDue` stays 0 on a settled credit bill: from the ORDER's point of view that bill
   * is closed and there is nothing further to collect against it. What's still owed lives on
   * the customer's khata instead — see `dueAmount`. */
  amountPaid: number;
  balanceDue: number;
  /** How much of `amountPaid` was credit rather than money in the till (the 'Due' tender).
   * Zero on an ordinary bill; non-zero means this much moved onto the customer's khatabook
   * at settle time and is collected there, not here. */
  dueAmount: number;
  /** True once at least one tender has been collected but the bill isn't fully settled yet.
   * Never true at the same time as `paid`. */
  partiallyPaid: boolean;
  /** The linked customer's redeemable loyalty balance — null unless this came from `get(id)`
   * (the list endpoint doesn't load it). Only meaningful once `guestPhone` is set: an
   * anonymous walk-in's customer row is a shared bucket, not a real individual's points. */
  customerAvailablePoints: number | null;
  /** Highest fire-round so far. An item with fireBatch === this is in the newest batch. */
  currentFireBatch: number;
  /** Staff-Confirm Mode: true while a guest QR order's first submission is sitting unfired
   * (currentFireBatch still 0), waiting on OrdersController.ConfirmGuestOrder. Never true for
   * staff-created POS orders. */
  pendingStaffConfirmation: boolean;
  /** status above is a rollup (least-progressed active batch, or SERVED once every batch
   * is) — this is the real per-round detail KDS renders as separate ticket cards. */
  fireBatches: FireBatch[];
}

export interface CreateOrderItemRequest {
  menuItemId: number;
  qty: number;
  modifier?: string;
  /** Which Variant (Half/Full/...) to bill instead of the item's base price. */
  variantId?: number;
  /** Selected topping/add-on ModifierOption ids — each adds its own price. Repeat an id
   * to order more than one of it (2x Extra Cheese = the same id twice); only a
   * "Quantity"-type modifier group honours that, others collapse repeats to a single unit. */
  modifierOptionIds?: number[];
  /** The rate the biller typed for an MRP item (see MenuItem.isOpenPrice) — required for
   * one, and ignored by the server for every other item, so an ordinary line can never be
   * re-priced from the client. */
  openPrice?: number;
}

export interface CreateOrderRequest {
  /** QSR = counter/token order — no table, guest phone optional, auto-fires to the
   * kitchen immediately. CASH = cash sale — no table, no kitchen involved at all,
   * auto-fires AND auto-serves immediately so it's payable on the spot (see backend
   * OrdersController.Create). */
  orderType: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'QSR' | 'CASH';
  tableCode?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  items: CreateOrderItemRequest[];
  discountPct?: number;
  /** A flat ₹ order-time discount, as an alternative to discountPct. Stored as-is by the
   * backend so it never drifts; when both are sent the flat amount wins. */
  discountAmount?: number;
  branchId?: number | null;
  /** Which staff member actually took/served this order — omit to default to the
   * logged-in user's own StaffMember record (self-service waiter). */
  servedByStaffId?: number | null;
  /** Saved onto the guest's Customer record, not the order itself — useful for
   * delivery, and remembered for their next visit. */
  guestAddress?: string | null;
}

export const ordersApi = {
  /** from/to are yyyy-MM-dd calendar days, inclusive — matches dashboardApi.analytics'
   * from/to shape, and DateOnly's default ASP.NET Core query-string binding.
   * kdsReady=true excludes never-fired "Open" orders (KDS only). */
  list: (params?: { activeOnly?: boolean; page?: number; pageSize?: number; branchId?: number | null; from?: string; to?: string; kdsReady?: boolean; orderType?: string; pendingConfirmation?: boolean }) =>
    apiClient.get<PagedResult<ApiOrder>>('/orders', { params }).then((r) => r.data),
  get: (id: number) => apiClient.get<ApiOrder>(`/orders/${id}`).then((r) => r.data),
  create: (req: CreateOrderRequest) => apiClient.post<ApiOrder>('/orders', req).then((r) => r.data),
  /** Sends all not-yet-fired items to the kitchen (first fire or a re-fire of new items). */
  fire: (id: number) => apiClient.post<ApiOrder>(`/orders/${id}/fire`).then((r) => r.data),
  /** Staff-Confirm Mode: fires a guest QR order's pending first submission to the kitchen for
   * real. Rejecting a pending order is just the existing `cancel` below — no separate call. */
  confirmGuestOrder: (id: number) => apiClient.post<ApiOrder>(`/orders/${id}/confirm`).then((r) => r.data),
  addItem: (id: number, req: CreateOrderItemRequest) =>
    apiClient.post<ApiOrder>(`/orders/${id}/items`, req).then((r) => r.data),
  /** Corrects an existing line's quantity — `qty` is the line's FINAL quantity, not a delta,
   * and must be >= 1 (use `removeItem` to drop the line entirely).
   *
   * Unfired lines are simply rewritten. On a FIRED line (see backend
   * OrdersController.UpdateItemQty): a decrease is Owner/Manager-only and can reach units the
   * system already recorded as served — that's the till reconciling a bill ("was it 3 lassis or
   * 4?") — needing a `reason` once it goes past the not-yet-cooked units. An increase raises the
   * same line in place, no extra line and no extra KOT; on a line that's still cooking the added
   * units enter at New, and on a fully-served one they join the served units so nothing is sent
   * back to the kitchen. Staff wanting a genuinely separate round use Add Item instead.
   *
   * `reasonCode` is the picked one of the fixed reasons and `reason` the free-text note beside
   * it (the note is what's required when the code is Other). `unprepared` asserts those units
   * were never actually made, which is the only thing that puts their stock back — honoured for
   * already-SERVED units only. */
  updateItemQty: (id: number, itemId: number, qty: number, reason?: string, reasonCode?: VoidReasonCode, unprepared?: boolean) =>
    apiClient.patch<ApiOrder>(`/orders/${id}/items/${itemId}/qty`, { qty, reason, reasonCode, unprepared }).then((r) => r.data),
  /** Overrides one line's per-unit rate on THIS order only — the menu's own price is untouched,
   * so no other order (past or future) moves. `price` is the line's FINAL effective rate,
   * replacing the variant + add-on total that `OrderItem.price` already represents, so what's
   * typed here is exactly what the bill charges per unit.
   *
   * Owner/Manager only at every stage, fired or not (see backend OrdersController.UpdateItemPrice)
   * — this is money off a bill, not food off a ticket. A REDUCTION requires a `reason` (server
   * 400s without one) and is audited as a discount; an increase doesn't. */
  updateItemPrice: (id: number, itemId: number, price: number, reason?: string) =>
    apiClient.patch<ApiOrder>(`/orders/${id}/items/${itemId}/price`, { price, reason }).then((r) => r.data),
  /** A reason is required once the item is Preparing/Ready or Served — either a `reasonCode` off
   * the fixed list, or free-text `reason` when the code is Other (the server 400s with neither).
   * Nothing is required while still New/Read/unfired.
   *
   * Voiding a served line is allowed. By default it's the till correcting a bill, not wastage:
   * the line comes off, stock stays deducted, audited at High. `unprepared` flips that — it
   * asserts the kitchen never actually made the food (a mis-tap on the one-tap Serve button),
   * so the fire-time deduction was for food that doesn't exist and is credited back in full.
   * Only meaningful on a SERVED line; the server ignores it at every other stage, where the
   * unit counts already say whether anything was cooked. */
  removeItem: (id: number, itemId: number, reason?: string, reasonCode?: VoidReasonCode, unprepared?: boolean) =>
    apiClient.delete<ApiOrder>(`/orders/${id}/items/${itemId}`, { params: { reason, reasonCode, unprepared } }).then((r) => r.data),
  /** Cancels the whole order — voids every not-yet-served line (reversing stock if prep
   * hadn't started). Already-served items are left untouched; use Refund for those. */
  cancel: (id: number, reason?: string) =>
    apiClient.post<ApiOrder>(`/orders/${id}/cancel`, { reason }).then((r) => r.data),
  /** Moves an in-progress dine-in order to a different, currently-empty table — a party
   * asking to move seats. Only relabels TableCode/Title; items/totals are untouched. */
  shiftTable: (id: number, newTableCode: string) =>
    apiClient.post<ApiOrder>(`/orders/${id}/shift-table`, { newTableCode }).then((r) => r.data),
  /** Fills in the guest's phone (and optionally name) on an order that already exists — what
   * the "no number on file" prompt behind every Send-on-WhatsApp action saves through. Works
   * on a paid order too, since that's when a bill usually gets sent. Setting a phone also
   * re-links the order's CRM customer (see OrdersController.UpdateGuest). */
  updateGuest: (id: number, req: { guestName?: string; guestPhone?: string }) =>
    apiClient.patch<ApiOrder>(`/orders/${id}/guest`, req).then((r) => r.data),
  /** Moves some units of ONE line one stage forward (partial quantity). fromStage omitted =
   * the line's current least-progressed stage; qty omitted = all units at that stage. */
  advanceUnits: (id: number, itemId: number, req: { fromStage?: OrderStatus; qty?: number }) =>
    apiClient.patch<ApiOrder>(`/orders/${id}/items/${itemId}/advance-units`, req).then((r) => r.data),
  /** Advance-all: moves every not-yet-served unit in ONE fire batch (KOT) forward one stage. */
  advance: (id: number, batchNumber: number) => apiClient.patch<ApiOrder>(`/orders/${id}/advance/${batchNumber}`).then((r) => r.data),
  /** Cancels one whole KOT/fire-batch — voids every not-yet-served line in that round only,
   * leaving every other round untouched. See backend OrdersController.CancelBatch. */
  cancelBatch: (id: number, batchNumber: number, reason?: string) =>
    apiClient.post<ApiOrder>(`/orders/${id}/batches/${batchNumber}/cancel`, { reason }).then((r) => r.data),
  /** QSR token flow: jump one line straight to Served in a single tap (no stage-by-stage
   * stepping) — see backend OrdersController.ServeItem. */
  serveItem: (id: number, itemId: number) => apiClient.patch<ApiOrder>(`/orders/${id}/items/${itemId}/serve`).then((r) => r.data),
  /** QSR token flow: "Mark All as Served" — jumps every fired line on the order to Served
   * in one tap. See backend OrdersController.ServeAll. */
  serveAll: (id: number) => apiClient.patch<ApiOrder>(`/orders/${id}/serve-all`).then((r) => r.data),
  /** Production View bulk: advance `qty` units of a dish across many KOTs (FIFO), or the
   * exact `allocations` given. Returns just the affected orders. */
  bulkAdvance: (req: { menuItemId: number; fromStage: OrderStatus; qty?: number; allocations?: { orderId: number; itemId: number; qty: number }[] }) =>
    apiClient.post<ApiOrder[]>('/orders/kds/bulk-advance', req).then((r) => r.data),
  setStatus: (id: number, status: OrderStatus) => apiClient.patch<ApiOrder>(`/orders/${id}/status`, { status }).then((r) => r.data),
  /** Manager-only markdown at billing time — supply exactly one of pct / amount. */
  billDiscount: (id: number, req: { pct?: number; amount?: number }) =>
    apiClient.patch<ApiOrder | PendingApprovalResponse>(`/orders/${id}/bill-discount`, req).then((r) => r.data),
  billCoupon: (id: number, code: string) =>
    apiClient.patch<ApiOrder>(`/orders/${id}/bill-coupon`, { code }).then((r) => r.data),
  billGiftCard: (id: number, code: string) =>
    apiClient.patch<ApiOrder>(`/orders/${id}/bill-giftcard`, { code }).then((r) => r.data),
  /** Redeems the order's linked customer's loyalty points as a bill-time discount (1 point =
   * ₹1) — only meaningful once guestPhone is set (see ApiOrder.customerAvailablePoints). */
  billLoyalty: (id: number, points: number) =>
    apiClient.patch<ApiOrder>(`/orders/${id}/bill-loyalty`, { points }).then((r) => r.data),
  /** Service Charge / Packing Charge / Delivery Charge / Tip / Round Off, applied together —
   * every field optional, only the ones supplied change (send 0 to clear one). ServiceCharge
   * accepts either a percentage of subtotal OR a flat amount, not both. */
  billCharges: (id: number, req: { serviceChargePct?: number; serviceChargeAmount?: number; packingChargeAmount?: number; deliveryChargeAmount?: number; tipAmount?: number; roundOffAmount?: number }) =>
    apiClient.patch<ApiOrder>(`/orders/${id}/bill-charges`, req).then((r) => r.data),
  /** Single-method quick pay, or supply splits (2+ tenders) to settle across multiple payment
   * methods in one go. By default the splits must add up to the remaining balance —
   * allowPartial relaxes that so a cashier can deliberately collect less and leave the rest
   * owing (order becomes partiallyPaid instead of paid; call pay again later for the rest).
   * keepOpen is the opposite case: the payment fully covers the balance but the order should
   * stay open anyway (Pay First, more items still expected) — order stays partiallyPaid
   * instead of paid even at 100% covered; call close() later once nothing more will be added.
   * A 'Due' split settles the bill on credit instead — see PaymentSplit and PayOptions. */
  pay: (id: number, paymentMethod?: string, splits?: PaymentSplit[], opts?: PayOptions) =>
    apiClient.patch<ApiOrder>(`/orders/${id}/pay`, { paymentMethod, splits, ...opts }).then((r) => r.data),
  /** Finalizes a keepOpen (Pay First) order once no more items are going to be added — the
   * balance is already fully covered, so this just flips it to paid with no new payment.
   * unfiredItems: see PayOptions — this closes the bill too, so it asks the same question. */
  close: (id: number, unfiredItems?: 'keep') =>
    apiClient.patch<ApiOrder>(`/orders/${id}/close`, { unfiredItems }).then((r) => r.data),
  refund: (id: number, amount?: number, reason?: string) =>
    apiClient.post<ApiOrder | PendingApprovalResponse>(`/orders/${id}/refund`, { amount, reason }).then((r) => r.data),
  getReceiptToken: (id: number) => apiClient.get<{ token: string }>(`/orders/${id}/receipt-token`).then((r) => r.data.token),
  rushForecast: () => apiClient.get<RushForecast>('/orders/rush-forecast').then((r) => r.data),
  /** Idempotent — creates the order's WhatsApp tracking row on first call, just reads it
   * back on any later one. whatsAppDeepLink is null whenever no WhatsApp Business number is
   * connected for this tenant yet, in which case the caller just prints the plain slip. See
   * OrdersController.GetOrCreateWhatsAppTracking. */
  getOrCreateWhatsAppTracking: (id: number) =>
    apiClient.post<{ trackingId: string; whatsAppDeepLink: string | null }>(`/orders/${id}/whatsapp-tracking`).then((r) => r.data),
};
