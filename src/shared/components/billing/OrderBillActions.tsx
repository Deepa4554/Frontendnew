import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Platform, Switch, Modal } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useDispatch, useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';
import { ApiOrder } from '../../../core/api/ordersApi';
import { showToast } from '../../../core/store/uiSlice';
import { getApiErrorMessage } from '../../../core/network/api';
import { canApplyBillDiscount } from '../../../core/auth/permissions';
import { RADIUS, INPUT_BORDER_WIDTH } from '../../design/commonStyles';
import { LoadingOverlay } from '../atoms/LoadingOverlay';
import { useApplyBillDiscount, useBillCoupon, useBillGiftCard, useBillCharges, useBillLoyalty, useCloseOrder, useUpdateOrderGuest, useServeAll } from '../../../core/api/hooks/useOrders';
import { useSettings } from '../../../core/api/hooks/useSettings';
import { useKhata } from '../../../core/api/hooks/useKhatabook';
import { PaymentMethodPicker, PaymentMethodPickerResult, PaymentMethod, PaymentSplit } from './PaymentMethodPicker';
import { BillAdjustmentsPanel, AdjustmentTile, AdjustmentApplyValue } from './BillAdjustmentsPanel';
import { GuestPhonePrompt } from './GuestPhonePrompt';
import { buildUpiPaymentUri } from '../../../core/payments/upi';

// Re-exported so existing `import { OrderBillActions, PaymentSplit } from '.../OrderBillActions'`
// call sites (TokenDashboard, TableManagement, TakeawayDelivery, POSCheckoutScreen) keep working
// — PaymentMethodPicker is the canonical source now, this file just settles with what it reports.
export type { PaymentMethod, PaymentSplit };

type AdjustmentKey = 'discount' | 'coupon' | 'giftcard' | 'loyalty' | 'service' | 'packing' | 'delivery' | 'tip';

interface Props {
  order: ApiOrder;
  /** Label for the tax row, e.g. "Tax (5%)" — pass a plain "Tax" if the rate isn't handy. */
  taxLabel?: string;
  payingPending?: boolean;
  printingPending?: boolean;
  /** Skip the Subtotal/Tax/Total box — pass this when the caller already shows a
   *  full breakdown above (e.g. POS's printable slip), so the total isn't repeated. */
  hideBreakdown?: boolean;
  /** Offer the "Mark items as Served on Settlement" tick above the action row (see the
   *  serveOnSettle state below). Only for flows whose orders actually move through kitchen
   *  stages on this screen — Tables and Token Dashboard, which used to carry a separate
   *  "Mark All as Served" button. POS's receipt modal doesn't, and Takeaway/Delivery keeps
   *  its own dispatch-worded button ("Mark Ready for Pickup" / "Mark Out for Delivery")
   *  because that reads as a handover step rather than a serve. */
  offerServeOnSettle?: boolean;
  /** One entry for a single-method settle, 2+ for a split across tenders. allowPartial
   *  true = the entered amount(s) fall short of the balance on purpose — the caller's Pay
   *  call should pass it straight through to ordersApi.pay's allowPartial. `andThen` is the
   *  "Settle & …" combo pick — the caller settles first and, only once that actually
   *  succeeds, chains straight into printing or sending the bill (see the split-button menu
   *  below) instead of leaving that as a second separate tap. `phoneOverride` carries a
   *  number the cashier just typed into the missing-number prompt: the order on this screen
   *  is still the pre-update copy at that moment (the refetch hasn't landed), so the caller
   *  must send to this number rather than the blank one it can still see on the order.
   *  `guest` carries the name/mobile typed into the payment picker's khata fields when the
   *  settle includes a Due (udhaar) leg — the caller must pass these through to
   *  ordersApi.pay's guestName/guestPhone, which is what the server hangs the khata entry on
   *  (and which it rejects the settle without). Undefined for every ordinary settle. */
  onMarkPaid: (
    payments: PaymentSplit[],
    allowPartial?: boolean,
    andThen?: 'print' | 'whatsapp',
    phoneOverride?: string,
    guest?: { name: string; phone: string },
  ) => void;
  onPrintBill: () => void;
  /** phoneOverride: see onMarkPaid. Every implementation is already async (it mints a
   *  receipt token, then opens WhatsApp); returning the promise lets this component show a
   *  spinner and block a second tap while that's in flight, the way its sibling actions do. */
  onSendWhatsApp: (phoneOverride?: string) => void | Promise<void>;
}

const money = (n: number) => `₹${n.toFixed(2)}`;
// react-native-web renders both TextInput and TouchableOpacity as focusable web elements
// (an <input>, and a <div tabIndex="0">/<button> respectively) — left alone, the browser
// draws its own default focus ring on WHICHEVER of them last received focus, which can look
// like it's outlining an entire row instead of just the one control that's actually active.
// Spread onto every focusable element's style below; the deliberate, scoped replacement is
// `inputFocused` on the text input itself only.
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

// A pencil next to a Bill Summary row is a second, quicker way back into that adjustment's
// editor once it's already applied — mirrors how Discount/Service Charge/Packing Charge
// behave in most POS bill screens. Module-level (not nested in OrderBillActions) so it
// isn't recreated as a new component type on every render.
const EditRowIcon = ({ onPress, color }: { onPress: () => void; color: string }) => (
  <TouchableOpacity onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={webNoOutline}>
    <Icon name="pencil-outline" size={13} color={color} />
  </TouchableOpacity>
);

/**
 * The one payment/billing panel shared by POS, Tables, and Token Dashboard — bill
 * breakdown, billing-time adjustments (discount, coupon, gift card, loyalty points,
 * service/packing/delivery charge, tip — each removable except the one-shot
 * redemptions), payment (Cash covers the bill by default; ticking Card/UPI and typing an
 * amount there shrinks Cash's own share automatically, so a split or a deliberate partial
 * collection is just typing a number rather than a separate mode to switch into), Settle
 * Bill, Print Bill, and WhatsApp send. Every adjustment here is self-contained
 * (owns its own mutation) so every screen embedding this component gets the same billing
 * toolkit for free. Payment and every adjustment are intentionally NOT gated on serve
 * status — a QSR/Cash counter settles before anything's necessarily cooked (see
 * OrdersController.Pay and friends); the serve-on-settle tick (offerServeOnSettle) is how
 * the common "settling because the food already went out" case gets handled in one tap
 * without making that an assumption the cashier can't opt out of.
 */
export const OrderBillActions: React.FC<Props> = ({
  order,
  taxLabel = 'Tax',
  payingPending = false,
  printingPending = false,
  hideBreakdown = false,
  offerServeOnSettle = false,
  onMarkPaid,
  onPrintBill,
  onSendWhatsApp,
}) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const role = useSelector((s: any) => s.auth.user?.role);
  const { data: settings } = useSettings();

  const applyBillDiscount = useApplyBillDiscount();
  const billCoupon = useBillCoupon();
  const billGiftCard = useBillGiftCard();
  const billCharges = useBillCharges();
  const billLoyalty = useBillLoyalty();
  const closeOrder = useCloseOrder();
  const serveAll = useServeAll();
  const adjustmentPending = applyBillDiscount.isPending || billCoupon.isPending || billGiftCard.isPending || billCharges.isPending || billLoyalty.isPending;
  // Only the three charge switches. billCharges.isPending is shared with the pencil-edit
  // path, which already renders its own spinner inside BillAdjustmentsPanel — gating the
  // overlay on this instead keeps a single loader per action.
  const [chargeToggleBusy, setChargeToggleBusy] = useState(false);

  // Settling a bill nearly always happens after the food has actually reached the guest, so
  // finishing the bill marks every fired line Served in the same tap — this replaced the
  // separate "Mark All as Served" button that used to sit above the bill on Tables and Token
  // Dashboard. Unticking it is the pay-before-serve case (guest settles up front, kitchen
  // hasn't sent the food out yet): the bill is taken and the kitchen stages are left exactly
  // where they are.
  const [serveOnSettle, setServeOnSettle] = useState(true);
  // Mirrors exactly what serveAll touches server-side (fired, not voided, not already
  // Served — see OrdersController.ServeAll), so the tick disappears once there's genuinely
  // nothing left for it to do rather than sitting there as a no-op.
  const hasUnservedFiredItems = order.items.some((i) => i.fireBatch > 0 && !i.voided && i.status !== 'SERVED');
  const showServeOnSettle = offerServeOnSettle && !order.paid && hasUnservedFiredItems;
  const willServeOnSettle = showServeOnSettle && serveOnSettle;
  // The standalone serve action, back only when the tick ISN'T going to cover it: either the
  // cashier deliberately decoupled the two (unticked), or the bill is already settled so
  // there's no Settle button left to ride along with. Ticked-and-unpaid deliberately hides it
  // — Settle does both in that case, and a second button offering half of that is just noise.
  // Without this, unticking would strand the order with no bulk-serve at all, leaving the
  // per-item status pills as the only way through.
  const showServeAllNow = offerServeOnSettle && hasUnservedFiredItems && (order.paid || !serveOnSettle);
  // A settle button spins for the serve leg only when it's the one performing it. Keying
  // this off willServeOnSettle rather than serveAll.isPending alone is what stops the
  // standalone Mark All as Served button (only ever visible when the tick is OFF, so Settle
  // isn't serving) from putting a spinner on Settle at the same time as itself — the two
  // share one mutation, so the raw pending flag can't tell them apart.
  const serveLegOfSettlePending = willServeOnSettle && serveAll.isPending;
  // The ticked settle covers both halves of the tap, so the serve leg has to keep the button
  // spinning/disabled too — otherwise the gap before the payment call looks like a dead tap
  // and invites a second one.
  const settlePending = payingPending || serveLegOfSettlePending;

  // What PaymentMethodPicker currently has picked — see its onChange doc. Defaults to
  // nothing settleable; the picker reports its real starting value (Cash covering the
  // full owed amount) on mount, before any button press is possible.
  const [paymentResult, setPaymentResult] = useState<PaymentMethodPickerResult>({ splits: [], isPartial: false, canSettle: true, dueAmount: 0, guestName: '', guestPhone: '' });
  const [openAdjustment, setOpenAdjustment] = useState<AdjustmentKey | null>(null);
  // Lets the Service/Packing/Delivery Switches flip the instant they're tapped instead of
  // waiting on the bill-charges round trip + orders refetch — a Switch reads as "broken" if
  // its thumb doesn't move until a network response lands. Cleared once the real order
  // value catches up (see the effect below) or reverted immediately if the mutation fails.
  const [chargeOverride, setChargeOverride] = useState<Partial<Record<'service' | 'packing' | 'delivery', boolean>>>({});

  // Normalized fallbacks for the newer Order fields — a stale cached order fetched before
  // these existed on the API (old bundle mid-hot-reload, or a backend that hasn't picked
  // up the change yet) would otherwise have them `undefined` and crash the panel.
  const serviceChargeAmount = order.serviceChargeAmount ?? 0;
  const packingChargeAmount = order.packingChargeAmount ?? 0;
  const deliveryChargeAmount = order.deliveryChargeAmount ?? 0;
  const tipAmount = order.tipAmount ?? 0;
  const loyaltyDiscountAmount = order.loyaltyDiscountAmount ?? 0;
  const loyaltyPointsRedeemed = order.loyaltyPointsRedeemed ?? 0;
  const amountPaid = order.amountPaid ?? 0;
  const partiallyPaid = order.partiallyPaid ?? false;
  const customerAvailablePoints = order.customerAvailablePoints ?? null;
  // What's actually left to collect — order.total once nothing's been paid yet, but the
  // real remaining balance once a partial payment already chipped away at it. Every
  // "settle" calculation below targets this, not order.total.
  const owed = order.balanceDue ?? order.total;
  // A Pay First order (keepOpen — see ordersApi.pay) that's already collected enough to
  // cover every item on the bill so far, but was deliberately left open in case more items
  // get added. Nothing left to collect right now, so the normal payment-method picker makes
  // no sense here — offer Close instead (see the payBtnGroup / partialBadge branches below).
  const fullyPrepaid = partiallyPaid && owed <= 0.01;

  // Scan-to-pay link for what's still owed (not order.total — a half-paid bill must charge
  // the balance, same figure the payment picker works from). Null whenever the cafe hasn't
  // set a UPI ID or there's nothing left to collect, which is exactly when the button below
  // shouldn't be offered at all. Same builder the printed bill uses, so paper and screen can
  // never disagree about the amount.
  // Whether the credit this bill extended has since been collected. Fetched ONLY for a bill
  // that actually put something on a khata — an ordinary settle costs no extra round trip at
  // all, which is what makes reading this live affordable. Deliberately the customer's whole
  // outstanding rather than this bill's share: a khata is one running balance, not per-invoice
  // tracking (see KhataEntry), so "this bill's ₹250" stops being a separate thing the moment
  // it lands there.
  //
  // Null whenever the answer isn't known — no khata on this bill, no CRM link, still loading,
  // or the request was refused (Khatabook is Owner/Manager-only, and this panel is used by
  // cashiers too). Every one of those falls back to the plain wording rather than guessing.
  const khataCustomerId = (order.dueAmount ?? 0) > 0 ? order.customerId : null;
  const { data: khata } = useKhata(khataCustomerId);
  const khataOutstanding = khata?.customer.outstanding ?? null;
  const khataCleared = khataOutstanding !== null && khataOutstanding <= 0.005;

  const upiUri = settings?.upiVpa
    ? buildUpiPaymentUri({ vpa: settings.upiVpa, payeeName: settings.businessName, amount: owed, note: `Bill ${order.number}` })
    : null;

  // Once the real order value matches whatever a Switch was optimistically flipped to,
  // drop the override — the real value already reads the same, so this is a silent no-op
  // visually, it just stops shadowing the server truth once it's actually confirmed.
  useEffect(() => {
    setChargeOverride((cur) => {
      if (Object.keys(cur).length === 0) return cur;
      const next = { ...cur };
      let changed = false;
      if (next.service !== undefined && next.service === serviceChargeAmount > 0) { delete next.service; changed = true; }
      if (next.packing !== undefined && next.packing === packingChargeAmount > 0) { delete next.packing; changed = true; }
      if (next.delivery !== undefined && next.delivery === deliveryChargeAmount > 0) { delete next.delivery; changed = true; }
      return changed ? next : cur;
    });
  }, [serviceChargeAmount, packingChargeAmount, deliveryChargeAmount]);

  const serviceChargeOn = chargeOverride.service ?? serviceChargeAmount > 0;
  const packingChargeOn = chargeOverride.packing ?? packingChargeAmount > 0;
  const deliveryChargeOn = chargeOverride.delivery ?? deliveryChargeAmount > 0;

  // Runs before the money is taken, and a failure here aborts the settle: a bill that's been
  // paid while its lines silently stayed unserved is the worse of the two half-states, and
  // payment is much the harder step to walk back. The backend treats serve progress and
  // payment as independent (see OrdersController.ServeAll), so the sequencing is purely
  // about which failure the cashier is left holding.
  const serveAllForSettle = async () => {
    if (!willServeOnSettle) return true;
    try {
      await serveAll.mutateAsync({ id: order.id });
      return true;
    } catch (err) {
      fail(err, 'Could not mark items served — bill not settled');
      return false;
    }
  };

  // The serve half on its own, for when it isn't riding along with a settle (see
  // showServeAllNow) — the same one-tap "everything's gone out" the old standalone
  // "Mark All as Served" button did.
  const handleServeAllNow = async () => {
    try {
      await serveAll.mutateAsync({ id: order.id });
      dispatch(showToast({ message: 'All items marked served.', icon: 'check-all', tone: 'success' }));
    } catch (err) {
      fail(err, 'Could not mark items served');
    }
  };

  const handleSettle = async (andThen?: 'print' | 'whatsapp', phoneOverride?: string) => {
    if (paymentResult.splits.length === 0) return;
    if (!(await serveAllForSettle())) return;
    // Only forwarded when there's actually credit in play — see onMarkPaid's `guest`. The
    // picker won't report canSettle for a Due leg without both fields, so by here they're real.
    const guest = paymentResult.dueAmount > 0
      ? { name: paymentResult.guestName, phone: paymentResult.guestPhone }
      : undefined;
    onMarkPaid(paymentResult.splits, paymentResult.isPartial, andThen, phoneOverride, guest);
  };

  // Every WhatsApp action needs a number to send to. When one was never taken, the tap opens
  // the prompt instead of dead-ending on a warning toast — whichever action was being
  // attempted is remembered here and re-run once the number is saved.
  const updateGuest = useUpdateOrderGuest();
  const [phonePromptFor, setPhonePromptFor] = useState<'settle' | 'bill' | null>(null);

  const withGuestPhone = (action: 'settle' | 'bill', run: () => void) => {
    if (!order.guestPhone) {
      setPhonePromptFor(action);
      return;
    }
    run();
  };

  const handleSettleWhatsApp = () => withGuestPhone('settle', () => handleSettle('whatsapp'));

  // Alone among the actions on this bar, sending the guest bill had no in-flight guard —
  // so a double-tap on slow wifi fired two receipt-token requests and opened two WhatsApp
  // tabs for the same bill. Same shape as the mutations' isPending everywhere else here.
  const [sendingWhatsAppBill, setSendingWhatsAppBill] = useState(false);
  const [upiQrOpen, setUpiQrOpen] = useState(false);
  const sendWhatsAppBill = async (phoneOverride?: string) => {
    if (sendingWhatsAppBill) return;
    setSendingWhatsAppBill(true);
    try {
      await onSendWhatsApp(phoneOverride);
    } finally {
      setSendingWhatsAppBill(false);
    }
  };
  const handleGuestBillWhatsApp = () => withGuestPhone('bill', () => void sendWhatsAppBill());

  // Saved to the order first (so it sticks and reaches CRM — see ordersApi.updateGuest),
  // then the original action runs, with the number passed along: `order` here is still the
  // pre-update copy until the refetch lands, so the action can't read it back off the order
  // yet. Both 'bill' and 'receipt' just send the bill as it stands; only 'settle' also
  // takes the payment.
  const handlePhoneSubmit = async (phone: string) => {
    const action = phonePromptFor;
    try {
      await updateGuest.mutateAsync({ id: order.id, guestPhone: phone });
    } catch (err) {
      fail(err, 'Could not save the mobile number');
      throw err;
    }
    setPhonePromptFor(null);
    if (action === 'settle') handleSettle('whatsapp', phone);
    else void sendWhatsAppBill(phone);
  };

  // --- Billing-time adjustments — discount, coupon, gift card, loyalty points, and the
  // Service/Packing/Delivery/Tip charges, all applied against the live order
  // (see OrdersController's bill-* endpoints). One editor open at a time. ---
  const toggleAdjustment = (key: AdjustmentKey) => setOpenAdjustment((cur) => (cur === key ? null : key));

  const warn = (message: string) => dispatch(showToast({ message, icon: 'alert-circle-outline', tone: 'warning' }));
  const fail = (err: unknown, fallback: string) => dispatch(showToast({ message: getApiErrorMessage(err, fallback), icon: 'alert-circle-outline', tone: 'danger' }));

  // Close Bill is a prepaid order's version of settling (the money's already in), so it
  // honours the same tick — otherwise a Pay First table could never be bulk-served at all
  // now that the standalone "Mark All as Served" button is gone.
  const handleClose = async () => {
    if (!(await serveAllForSettle())) return;
    try {
      await closeOrder.mutateAsync(order.id);
      dispatch(showToast({ message: 'Bill closed.', icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      fail(err, 'Could not close the bill');
    }
  };

  const maxLoyaltyPoints = Math.min(customerAvailablePoints ?? 0, Math.floor(owed));

  const handleTileApply = async (key: string, value: AdjustmentApplyValue) => {
    try {
      switch (key as AdjustmentKey) {
        case 'discount': {
          const result = await applyBillDiscount.mutateAsync(value.pct !== undefined ? { id: order.id, pct: value.pct } : { id: order.id, amount: value.amount! });
          if ('pendingApproval' in result) {
            dispatch(showToast({ message: result.message, icon: 'clock-outline', tone: 'info' }));
          }
          break;
        }
        case 'service':
          await billCharges.mutateAsync(value.pct !== undefined ? { id: order.id, serviceChargePct: value.pct } : { id: order.id, serviceChargeAmount: value.amount! });
          break;
        case 'packing':
          await billCharges.mutateAsync({ id: order.id, packingChargeAmount: value.amount! });
          break;
        case 'delivery':
          await billCharges.mutateAsync({ id: order.id, deliveryChargeAmount: value.amount! });
          break;
        case 'tip':
          await billCharges.mutateAsync({ id: order.id, tipAmount: value.amount! });
          break;
        case 'coupon':
          await billCoupon.mutateAsync({ id: order.id, code: value.text! });
          break;
        case 'giftcard':
          await billGiftCard.mutateAsync({ id: order.id, code: value.text! });
          break;
        case 'loyalty':
          await billLoyalty.mutateAsync({ id: order.id, points: value.amount! });
          break;
      }
      setOpenAdjustment(null);
    } catch (err) {
      fail(err, 'Could not apply');
    }
  };

  // Resets a removable adjustment straight back to zero — no confirmation dialog, same
  // one-tap-to-undo feel as a food-delivery app's bill editor. Closes its editor if open.
  const handleRemoveAdjustment = async (key: AdjustmentKey) => {
    try {
      if (key === 'discount') await applyBillDiscount.mutateAsync({ id: order.id, amount: 0 });
      else if (key === 'service') await billCharges.mutateAsync({ id: order.id, serviceChargeAmount: 0 });
      else if (key === 'packing') await billCharges.mutateAsync({ id: order.id, packingChargeAmount: 0 });
      else if (key === 'delivery') await billCharges.mutateAsync({ id: order.id, deliveryChargeAmount: 0 });
      else if (key === 'tip') await billCharges.mutateAsync({ id: order.id, tipAmount: 0 });
      if (openAdjustment === key) setOpenAdjustment(null);
    } catch (err) {
      fail(err, 'Could not remove');
    }
  };

  // Bill Summary's Service/Packing/Delivery rows each carry their own Switch — flipping it
  // on applies that charge's Auto Charges default (Settings → Auto Charges) straight to this
  // bill, flipping it off zeroes it out. A biller who wants a one-off custom amount instead
  // still has the pencil-edit icon (opens the same %/₹ editor as before) right next to it.
  // The Switch's own `on` state is set optimistically before the request even fires (see
  // chargeOverride above) — this is what makes the thumb move on the first tap instead of
  // sitting still until the server round trip finishes.
  const handleToggleCharge = async (key: 'service' | 'packing' | 'delivery', currentlyOn: boolean) => {
    if (currentlyOn) {
      setChargeOverride((o) => ({ ...o, [key]: false }));
      try {
        setChargeToggleBusy(true);
        if (key === 'service') await billCharges.mutateAsync({ id: order.id, serviceChargeAmount: 0 });
        else if (key === 'packing') await billCharges.mutateAsync({ id: order.id, packingChargeAmount: 0 });
        else await billCharges.mutateAsync({ id: order.id, deliveryChargeAmount: 0 });
        if (openAdjustment === key) setOpenAdjustment(null);
      } catch (err) {
        setChargeOverride((o) => ({ ...o, [key]: true }));
        fail(err, 'Could not remove');
      } finally {
        setChargeToggleBusy(false);
      }
      return;
    }
    if (key === 'service' && settings?.serviceChargeDefaultPct == null) { warn('No default Service Charge is set — add one in Settings → Auto Charges, or use the pencil to enter one for this bill.'); return; }
    if (key === 'packing' && settings?.packingChargeDefaultAmount == null) { warn('No default Packing Charge is set — add one in Settings → Auto Charges, or use the pencil to enter one for this bill.'); return; }
    if (key === 'delivery' && settings?.deliveryChargeDefaultAmount == null) { warn('No default Delivery Charge is set — add one in Settings → Auto Charges, or use the pencil to enter one for this bill.'); return; }
    setChargeOverride((o) => ({ ...o, [key]: true }));
    try {
      setChargeToggleBusy(true);
      if (key === 'service') await billCharges.mutateAsync({ id: order.id, serviceChargePct: settings!.serviceChargeDefaultPct! });
      else if (key === 'packing') await billCharges.mutateAsync({ id: order.id, packingChargeAmount: settings!.packingChargeDefaultAmount! });
      else await billCharges.mutateAsync({ id: order.id, deliveryChargeAmount: settings!.deliveryChargeDefaultAmount! });
    } catch (err) {
      setChargeOverride((o) => ({ ...o, [key]: false }));
      fail(err, 'Could not apply');
    } finally {
      setChargeToggleBusy(false);
    }
  };

  const tiles: AdjustmentTile[] = [
    { key: 'discount', label: 'Discount', icon: 'tag-outline', amount: order.billDiscountAmount, hidden: !canApplyBillDiscount(role), applied: order.billDiscountAmount > 0, kind: 'percentOrFlat', removable: true },
    { key: 'coupon', label: order.couponCode ?? 'Coupon', icon: 'ticket-percent-outline', amount: order.couponDiscountAmount, hidden: !!order.couponCode, applied: !!order.couponCode, kind: 'text' },
    { key: 'giftcard', label: 'Gift Card', icon: 'wallet-giftcard', amount: order.giftCardAmountApplied, hidden: !!order.giftCardCode, applied: !!order.giftCardCode, kind: 'text' },
    {
      key: 'loyalty', label: 'Loyalty Points', icon: 'star-circle-outline', amount: loyaltyDiscountAmount,
      hidden: !order.guestPhone || loyaltyPointsRedeemed > 0, applied: loyaltyPointsRedeemed > 0, kind: 'points',
      hint: `${customerAvailablePoints ?? 0} pts available · redeems 1 pt = ₹1, capped at what's owed`,
      quickFill: maxLoyaltyPoints > 0 ? { label: 'Max', value: String(Math.max(0, maxLoyaltyPoints)) } : undefined,
    },
    // Service/Packing/Delivery no longer show as grid tiles (hidden: true) — Bill Summary's
    // own Switch rows below are now the primary on/off control for these three. They stay
    // in this array only so the pencil-edit icon next to each Bill Summary row can still
    // open the same %/₹ editor (BillAdjustmentsPanel looks up openTile by key regardless of
    // `hidden`) for a one-off custom amount instead of the configured default.
    { key: 'service', label: 'Service Charge', icon: 'room-service-outline', amount: serviceChargeAmount, applied: serviceChargeAmount > 0, kind: 'percentOrFlat', allowZero: true, removable: true, hidden: true },
    { key: 'packing', label: 'Packing Charge', icon: 'package-variant-closed', amount: packingChargeAmount, applied: packingChargeAmount > 0, kind: 'flat', allowZero: true, removable: true, hidden: true },
    { key: 'delivery', label: 'Delivery Charge', icon: 'moped-outline', amount: deliveryChargeAmount, applied: deliveryChargeAmount > 0, kind: 'flat', allowZero: true, removable: true, hidden: true },
    { key: 'tip', label: 'Tip', icon: 'hand-coin-outline', amount: tipAmount, applied: tipAmount > 0, kind: 'flat', allowZero: true, removable: true },
  ];

  // Service/Packing/Delivery Switch rows — a row only shows once there's something for its
  // Switch to toggle to (a configured Auto Charges default) or it's already applied (so it
  // stays visible, and removable, even if the default was cleared since). Shared between the
  // normal Bill Summary box below and the standalone box rendered when hideBreakdown is on
  // (POSCheckoutScreen's receipt slip already prints its own Subtotal/Tax/Total, but doesn't
  // print these charges as line items, so they still need a home here).
  const showServiceToggle = settings?.serviceChargeDefaultPct != null || serviceChargeAmount > 0;
  const showPackingToggle = settings?.packingChargeDefaultAmount != null || packingChargeAmount > 0;
  const showDeliveryToggle = settings?.deliveryChargeDefaultAmount != null || deliveryChargeAmount > 0;
  const chargeToggleRows = (
    <>
      {showServiceToggle && (
        <View style={styles.billRow}>
          <View style={styles.billLabelRow}>
            <Text style={styles.billLabel}>Service Charge</Text>
            {serviceChargeAmount > 0 && !order.paid && <EditRowIcon onPress={() => toggleAdjustment('service')} color={COLORS.muted} />}
          </View>
          <View style={styles.billLabelRow}>
            {serviceChargeAmount > 0 && <Text style={styles.billVal}>{money(serviceChargeAmount)}</Text>}
            <Switch
              value={serviceChargeOn}
              onValueChange={() => handleToggleCharge('service', serviceChargeOn)}
              disabled={order.paid || billCharges.isPending}
              trackColor={{ false: COLORS.divider, true: COLORS.accent }}
              thumbColor="#FFFFFF"
              style={webNoOutline}
            />
          </View>
        </View>
      )}
      {showPackingToggle && (
        <View style={styles.billRow}>
          <View style={styles.billLabelRow}>
            <Text style={styles.billLabel}>Packing Charge</Text>
            {packingChargeAmount > 0 && !order.paid && <EditRowIcon onPress={() => toggleAdjustment('packing')} color={COLORS.muted} />}
          </View>
          <View style={styles.billLabelRow}>
            {packingChargeAmount > 0 && <Text style={styles.billVal}>{money(packingChargeAmount)}</Text>}
            <Switch
              value={packingChargeOn}
              onValueChange={() => handleToggleCharge('packing', packingChargeOn)}
              disabled={order.paid || billCharges.isPending}
              trackColor={{ false: COLORS.divider, true: COLORS.accent }}
              thumbColor="#FFFFFF"
              style={webNoOutline}
            />
          </View>
        </View>
      )}
      {showDeliveryToggle && (
        <View style={styles.billRow}>
          <View style={styles.billLabelRow}>
            <Text style={styles.billLabel}>Delivery Charge</Text>
            {deliveryChargeAmount > 0 && !order.paid && <EditRowIcon onPress={() => toggleAdjustment('delivery')} color={COLORS.muted} />}
          </View>
          <View style={styles.billLabelRow}>
            {deliveryChargeAmount > 0 && <Text style={styles.billVal}>{money(deliveryChargeAmount)}</Text>}
            <Switch
              value={deliveryChargeOn}
              onValueChange={() => handleToggleCharge('delivery', deliveryChargeOn)}
              disabled={order.paid || billCharges.isPending}
              trackColor={{ false: COLORS.divider, true: COLORS.accent }}
              thumbColor="#FFFFFF"
              style={webNoOutline}
            />
          </View>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      {!hideBreakdown && (
        <View style={styles.billBox}>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Subtotal</Text>
            <Text style={styles.billVal}>{money(order.subtotal)}</Text>
          </View>
          {order.discountAmount > 0 && (
            <View style={styles.billRow}>
              <Text style={[styles.billLabel, styles.positive]}>Discount</Text>
              <Text style={[styles.billVal, styles.positive]}>−{money(order.discountAmount)}</Text>
            </View>
          )}
          {order.billDiscountAmount > 0 && (
            <View style={styles.billRow}>
              <View style={styles.billLabelRow}>
                <Text style={[styles.billLabel, styles.positive]}>Bill Discount</Text>
                {!order.paid && <EditRowIcon onPress={() => toggleAdjustment('discount')} color={COLORS.muted} />}
              </View>
              <Text style={[styles.billVal, styles.positive]}>−{money(order.billDiscountAmount)}</Text>
            </View>
          )}
          {order.couponDiscountAmount > 0 && (
            <View style={styles.billRow}>
              <Text style={[styles.billLabel, styles.positive]}>Coupon{order.couponCode ? ` (${order.couponCode})` : ''}</Text>
              <Text style={[styles.billVal, styles.positive]}>−{money(order.couponDiscountAmount)}</Text>
            </View>
          )}
          {order.giftCardAmountApplied > 0 && (
            <View style={styles.billRow}>
              <Text style={[styles.billLabel, styles.positive]}>Gift Card</Text>
              <Text style={[styles.billVal, styles.positive]}>−{money(order.giftCardAmountApplied)}</Text>
            </View>
          )}
          {loyaltyDiscountAmount > 0 && (
            <View style={styles.billRow}>
              <Text style={[styles.billLabel, styles.positive]}>Loyalty Points{loyaltyPointsRedeemed ? ` (${loyaltyPointsRedeemed})` : ''}</Text>
              <Text style={[styles.billVal, styles.positive]}>−{money(loyaltyDiscountAmount)}</Text>
            </View>
          )}
          {chargeToggleRows}
          {tipAmount > 0 && (
            <View style={styles.billRow}>
              <View style={styles.billLabelRow}>
                <Text style={styles.billLabel}>Tip</Text>
                {!order.paid && <EditRowIcon onPress={() => toggleAdjustment('tip')} color={COLORS.muted} />}
              </View>
              <Text style={styles.billVal}>{money(tipAmount)}</Text>
            </View>
          )}
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>{taxLabel}</Text>
            <Text style={styles.billVal}>{money(order.tax)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.billTotalLabel}>Grand Total</Text>
            <Text style={styles.billTotalVal}>{money(order.total)}</Text>
          </View>
        </View>
      )}

      {/* hideBreakdown callers (POSCheckoutScreen's receipt slip) already print their own
          Subtotal/Tax/Total, but not Service/Packing/Delivery as line items — these still
          need their Switch row somewhere, so they get their own small box instead. */}
      {hideBreakdown && (showServiceToggle || showPackingToggle || showDeliveryToggle) && (
        <View style={styles.billBox}>{chargeToggleRows}</View>
      )}

      {order.paid ? (
        <>
          <View style={styles.paidBadge}>
            <Icon name="check-circle" size={14} color={COLORS.success} />
            <Text style={styles.paidBadgeText}>
              Settled
              {order.payments.length > 1
                ? ` · ${order.payments.map((p) => `${p.method} ${money(p.amount)}`).join(' + ')}`
                : order.paymentMethod
                  ? ` · ${order.paymentMethod}`
                  : ''}
            </Text>
          </View>
          {/* The bill is closed, but part of it was never collected — spelling that out here
              stops "Settled" from reading as "the money came in" on a credit sale. What this
              bill put on the khata is history and never changes; whether it's since been
              collected is live, so the two are worded separately (see khataOutstanding). */}
          {(order.dueAmount ?? 0) > 0 && (
            <View style={[styles.partialBadge, khataCleared && styles.settledKhataBadge]}>
              <Icon name={khataCleared ? 'check-circle' : 'notebook-outline'} size={14} color={khataCleared ? COLORS.success : COLORS.warning} />
              <Text style={[styles.partialBadgeText, khataCleared && styles.settledKhataText]}>
                {money(order.dueAmount)} went on {order.guestName ?? 'the customer'}'s khata
                {khataCleared
                  ? ' · since cleared'
                  : khataOutstanding !== null
                    ? ` · ${money(khataOutstanding)} still outstanding — collect it from Khatabook`
                    : ' — collect it from Khatabook'}
              </Text>
            </View>
          )}
        </>
      ) : (
        <>
          {partiallyPaid && (
            <View style={styles.partialBadge}>
              <Icon name={fullyPrepaid ? 'cash-check' : 'clock-alert-outline'} size={14} color={COLORS.warning} />
              <Text style={styles.partialBadgeText}>
                {fullyPrepaid
                  ? `${money(amountPaid)} prepaid · add more items or close the bill`
                  : `${money(amountPaid)} collected · ${money(owed)} due`}
                {order.payments.length > 0 ? ` · ${order.payments.map((p) => `${p.method} ${money(p.amount)}`).join(' + ')}` : ''}
              </Text>
            </View>
          )}

          {/* Nothing left to collect right now (fullyPrepaid) — the payment-method picker
              has nothing to do, so skip straight to the Close Bill action in the footer
              below. It reappears on its own once BalanceDue goes positive again (more
              items added), same as the partialBadge above. */}
          {!fullyPrepaid && (
            <PaymentMethodPicker
              owed={owed}
              guestName={order.guestName}
              guestPhone={order.guestPhone}
              onChange={setPaymentResult}
            />
          )}
        </>
      )}

      {/* Below Payment Method, not above it — settling is what happens on every order,
          adjustments only sometimes, so the frequently-used control sits higher. */}
      {!order.paid && (
        <BillAdjustmentsPanel
          tiles={tiles}
          openKey={openAdjustment}
          onToggle={(key) => toggleAdjustment(key as AdjustmentKey)}
          pending={adjustmentPending}
          onApply={handleTileApply}
          onRemove={(key) => handleRemoveAdjustment(key as AdjustmentKey)}
          onWarn={warn}
        />
      )}

      {showServeAllNow && (
        <TouchableOpacity
          style={[styles.serveAllNowBtn, webNoOutline]}
          onPress={handleServeAllNow}
          disabled={serveAll.isPending}
        >
          {serveAll.isPending ? (
            <ActivityIndicator size="small" color={COLORS.success} />
          ) : (
            <Icon name="check-all" size={16} color={COLORS.success} />
          )}
          <Text style={styles.serveAllNowText}>Mark All as Served</Text>
        </TouchableOpacity>
      )}

      {/* Sits directly on top of the settle row because it modifies what that row's button
          does — ticked (the default) it's one tap for "served and paid", unticked it's a
          plain settle for a guest paying before the food goes out. */}
      {showServeOnSettle && (
        <TouchableOpacity
          style={[styles.serveOnSettleRow, webNoOutline]}
          onPress={() => setServeOnSettle((on) => !on)}
          disabled={serveAll.isPending || payingPending}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: serveOnSettle }}
        >
          <Icon
            name={serveOnSettle ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={19}
            color={serveOnSettle ? COLORS.accent : COLORS.muted}
          />
          <Text style={styles.serveOnSettleText}>Mark items as Served on Settlement</Text>
        </TouchableOpacity>
      )}

      <View style={styles.actionsRow}>
        <View style={styles.printBtnGroup}>
          <TouchableOpacity
            style={[styles.printBtn, webNoOutline]}
            onPress={onPrintBill}
            disabled={printingPending}
            accessibilityLabel="Guest Bill via Print"
          >
            {printingPending ? (
              <ActivityIndicator size="small" color={COLORS.heading} />
            ) : (
              <Icon name="printer-outline" size={16} color={COLORS.heading} />
            )}
            <Text style={styles.printBtnText}>Print Bill</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.printBtnSeg, webNoOutline]}
            onPress={handleGuestBillWhatsApp}
            disabled={sendingWhatsAppBill}
            accessibilityLabel="Guest Bill via WhatsApp"
          >
            {sendingWhatsAppBill ? (
              <ActivityIndicator size="small" color={COLORS.heading} />
            ) : (
              <Icon name="whatsapp" size={17} color={COLORS.heading} />
            )}
          </TouchableOpacity>
          {/* Third segment, present only once a UPI ID is configured (Cafe Settings →
              Receipt Builder) and there's a balance to collect — the cafe that pays in cash
              only never sees an extra button it can't use. */}
          {upiUri && (
            <TouchableOpacity
              style={[styles.printBtnSeg, webNoOutline]}
              onPress={() => setUpiQrOpen(true)}
              accessibilityLabel={`Pay by UPI, ${money(owed)}`}
            >
              <Icon name="qrcode-scan" size={17} color={COLORS.heading} />
            </TouchableOpacity>
          )}
        </View>

        {!order.paid && (
          <View style={styles.payBtnGroup}>
            {fullyPrepaid ? (
              // Prepaid and fully covered — nothing left to collect, so this is a plain
              // "I'm done, close it out" tap rather than a settle. Kept as a deliberate
              // separate action (not automatic) so a table that just got prepaid ahead of
              // more items doesn't get closed out from under the cashier.
              <TouchableOpacity
                style={[styles.payBtn, webNoOutline]}
                onPress={handleClose}
                disabled={closeOrder.isPending || serveLegOfSettlePending}
              >
                {closeOrder.isPending || serveLegOfSettlePending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Icon name="lock-check-outline" size={16} color="#FFFFFF" />
                )}
                <Text style={styles.payBtnText}>Close Bill</Text>
              </TouchableOpacity>
            ) : (
              // Segmented button — both "Settle & …" variants sit right on the button itself,
              // always visible (no tap-to-reveal menu to find them in first). Settle Bill's
              // own text/icon is the plain settle; the two icon segments after it settle AND
              // immediately print / send WhatsApp in the same tap. WhatsApp's icon always
              // shows (so it's never a mystery why it's "missing") — tapping it without a
              // guest phone on file just explains what's needed instead of silently no-op'ing.
              <>
                <TouchableOpacity
                  style={[styles.payBtn, !paymentResult.canSettle && styles.payBtnDisabled, webNoOutline]}
                  onPress={() => handleSettle()}
                  disabled={settlePending || !paymentResult.canSettle}
                >
                  {settlePending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Icon name="cash-check" size={16} color="#FFFFFF" />
                  )}
                  <Text style={styles.payBtnText}>
                    {paymentResult.dueAmount > 0
                      ? 'Settle on Khata'
                      : paymentResult.isPartial
                        ? 'Collect Partial Payment'
                        : 'Settle Bill'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.payBtnSeg, webNoOutline]}
                  onPress={() => handleSettle('print')}
                  disabled={settlePending || !paymentResult.canSettle}
                  accessibilityLabel="Settle & Print"
                >
                  <Icon name="printer-outline" size={17} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.payBtnSeg, webNoOutline]}
                  onPress={handleSettleWhatsApp}
                  disabled={settlePending || !paymentResult.canSettle}
                  accessibilityLabel="Settle & send via WhatsApp"
                >
                  <Icon name="whatsapp" size={17} color="#FFFFFF" />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>

      <GuestPhonePrompt
        visible={phonePromptFor !== null}
        onSubmit={handlePhoneSubmit}
        onCancel={() => setPhonePromptFor(null)}
        hint={
          phonePromptFor === 'settle'
            ? 'No number on file for this order. Add one to settle and send the bill on WhatsApp — it stays saved on the order.'
            : 'No number on file for this order. Add one to send the bill on WhatsApp — it stays saved on the order.'
        }
      />

      {/* Show-the-guest popup: the same QR the bill prints, for when there's no printer to
          hand or the guest would rather scan off the screen. Deliberately has no "Paid"
          button of its own — a UPI intent link tells the app nothing about whether the money
          arrived (see buildUpiPaymentUri), so settlement stays on the normal Settle flow
          where staff confirm it against their own UPI notification. */}
      <Modal visible={upiQrOpen} transparent animationType="fade" onRequestClose={() => setUpiQrOpen(false)}>
        <TouchableOpacity style={styles.upiBackdrop} activeOpacity={1} onPress={() => setUpiQrOpen(false)}>
          <TouchableOpacity style={styles.upiCard} activeOpacity={1}>
            <Text style={styles.upiTitle}>Scan to pay</Text>
            <Text style={styles.upiAmount}>{money(owed)}</Text>
            <View style={styles.upiQrBox}>
              {upiUri && <QRCode value={upiUri} size={200} color="#000000" backgroundColor="#FFFFFF" />}
            </View>
            <Text style={styles.upiVpaText}>{settings?.upiVpa}</Text>
            <Text style={styles.upiNote}>Any UPI app · amount is fixed. Mark the bill paid once you get the payment notification.</Text>
            <TouchableOpacity style={[styles.upiCloseBtn, webNoOutline]} onPress={() => setUpiQrOpen(false)}>
              <Text style={styles.upiCloseText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <LoadingOverlay visible={chargeToggleBusy} message="Updating bill…" />
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { gap: isDesktopWeb ? 10 : 6 },
  upiBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  upiCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.card, padding: 20, alignItems: 'center', gap: 8, maxWidth: 320, width: '100%' },
  upiTitle: { fontSize: 13, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.4, textTransform: 'uppercase' },
  upiAmount: { fontSize: 26, fontWeight: '800', color: COLORS.heading },
  // Always a white plate regardless of theme — a dark-mode card behind a QR wrecks the
  // contrast scanners rely on.
  upiQrBox: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: RADIUS.card, marginTop: 4 },
  upiVpaText: { fontSize: 13, fontWeight: '600', color: COLORS.heading, marginTop: 4 },
  upiNote: { fontSize: 11, lineHeight: 16, color: COLORS.muted, textAlign: 'center' },
  upiCloseBtn: { marginTop: 6, paddingVertical: 10, paddingHorizontal: 28, borderRadius: RADIUS.card, backgroundColor: COLORS.cardAlt },
  upiCloseText: { fontSize: 14, fontWeight: '700', color: COLORS.heading },
  billBox: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: RADIUS.card,
    padding: isDesktopWeb ? 14 : 9,
    gap: isDesktopWeb ? 7 : 4,
  },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  billLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  billLabel: { fontSize: isDesktopWeb ? 14 : 12.5, color: COLORS.muted },
  billVal: { fontSize: isDesktopWeb ? 14 : 12.5, color: COLORS.heading, fontWeight: '600' },
  positive: { color: COLORS.success },
  warning: { color: COLORS.warning },
  danger: { color: COLORS.dangerAccent },
  divider: { height: 1, backgroundColor: COLORS.divider, marginVertical: 4 },
  grandTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 4, marginHorizontal: isDesktopWeb ? -14 : -9, marginBottom: isDesktopWeb ? -14 : -9,
    paddingHorizontal: isDesktopWeb ? 14 : 9, paddingVertical: isDesktopWeb ? 12 : 8,
    borderBottomLeftRadius: RADIUS.card, borderBottomRightRadius: RADIUS.card,
    backgroundColor: COLORS.background,
  },
  billTotalLabel: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800', color: COLORS.heading },
  billTotalVal: { fontSize: isDesktopWeb ? 19 : 16, fontWeight: '800', color: COLORS.heading },
  // Tinted rather than solid-filled: it's a secondary path (the ticked Settle button is the
  // main one), so it shouldn't out-shout Settle Bill sitting right underneath it.
  serveAllNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.successBg,
    borderRadius: RADIUS.button,
    paddingVertical: isDesktopWeb ? 10 : 8,
  },
  serveAllNowText: { fontSize: 13.5, fontWeight: '700', color: COLORS.success },
  serveOnSettleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: isDesktopWeb ? 4 : 2,
  },
  serveOnSettleText: { flex: 1, fontSize: isDesktopWeb ? 13.5 : 12.5, fontWeight: '600', color: COLORS.heading },
  actionsRow: { flexDirection: 'row', gap: 6 },
  // Guest Bill + its WhatsApp icon segment, mirroring payBtnGroup's cluster pattern
  // but in the light/bordered theme since this is a pre-settlement action.
  printBtnGroup: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: RADIUS.button,
    overflow: 'hidden',
    borderWidth: INPUT_BORDER_WIDTH,
    borderColor: COLORS.divider,
  },
  printBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: isDesktopWeb ? 12 : 9,
    backgroundColor: COLORS.cardAlt,
  },
  printBtnText: { fontSize: 13.5, fontWeight: '700', color: COLORS.heading },
  printBtnSeg: {
    paddingHorizontal: isDesktopWeb ? 12 : 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cardAlt,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.divider,
  },
  // Settle Bill + its two "Settle & …" icon segments as one continuous button cluster —
  // takes over the flex the plain payBtn used to carry directly.
  payBtnGroup: { flex: 1.5, flexDirection: 'row', borderRadius: RADIUS.button, overflow: 'hidden' },
  payBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: isDesktopWeb ? 12 : 9,
    backgroundColor: COLORS.button,
  },
  payBtnDisabled: { opacity: 0.45 },
  payBtnText: { fontSize: 13.5, fontWeight: '700', color: '#FFFFFF' },
  // Settle & Print / Settle & WhatsApp — icon-only so they stay compact but are always
  // visible right on the button (not tucked behind a menu). Same fill as payBtn with a
  // faint divider so each still reads as "part of the same control".
  payBtnSeg: {
    paddingHorizontal: isDesktopWeb ? 12 : 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.button,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.28)',
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.successBg,
    borderRadius: RADIUS.button,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  paidBadgeText: { fontSize: 13, fontWeight: '700', color: COLORS.success },
  partialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.warningBg,
    borderRadius: RADIUS.button,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  partialBadgeText: { flex: 1, fontSize: 12, fontWeight: '700', color: COLORS.warning },
  // Same badge, recoloured once the khata behind it is square — the row still has to be
  // there (this bill did go on credit, and that's part of its record), it just stops reading
  // as something outstanding.
  settledKhataBadge: { backgroundColor: COLORS.successBg },
  settledKhataText: { color: COLORS.success },
});
