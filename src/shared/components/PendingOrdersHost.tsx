import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { useDispatch } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePendingConfirmationOrders, useConfirmGuestOrder, useCancelOrder } from '../../core/api/hooks/useOrders';
import { ApiOrder } from '../../core/api/ordersApi';
import { showToast } from '../../core/store/uiSlice';
import { getApiErrorMessage } from '../../core/network/api';
import { WarmColors as COLORS } from '../design/warmTheme';
import { confirmAlert } from './ConfirmDialogHost';
import { CloseButton } from './atoms/CloseButton';
import { NonBlockingOverlay } from './NonBlockingOverlay';
import { useResponsive } from '../../core/utils/useResponsive';
import { PrinterService } from '../../core/printing/PrinterService';
import { markKotPrinted } from '../../core/printing/printedKots';
import { alertChime } from '../../core/notifications/alertChime';

/**
 * How often the chime repeats while orders are still waiting to be confirmed.
 *
 * Long enough not to become background noise anyone learns to tune out, short enough that a
 * guest sitting at a table isn't waiting on a round nobody has noticed. Twenty seconds is
 * about three reminders in the minute it should take someone to walk to the till.
 */
const PENDING_REMINDER_MS = 20000;

/** How a pending order is named on screen — its table if it has one, else its own title. */
const orderLabel = (o: { tableCode?: string | null; title: string }) =>
  o.tableCode ? `Table ${o.tableCode}` : o.title;

/**
 * Staff-Confirm Mode's floor-wide alert — mounted once at the AppNavigator level (not inside
 * any one screen) so "Table T5 — new order, confirm karein?" shows up no matter which tab a
 * staff member is on, POS/Tables/anywhere. Fed by usePendingConfirmationOrders, which rides
 * OrdersHub's realtime push with a 30s poll behind it as a safety net, and toasts when NEW
 * pending orders show up; unlike a plain toast (1.8s auto-dismiss), the floating pill below
 * stays up for as long as anything is actually waiting, so it can't be missed by someone
 * glancing away.
 *
 * The sheet deals out ONE order at a time rather than listing them all. During a QR rush the
 * list meant scrolling a wall of near-identical cards and tapping the wrong table's Confirm;
 * a single card with the queue position ("Order 3 of 10") is the whole job at that moment.
 */
export const PendingOrdersHost = () => {
  const { isDesktopWeb } = useResponsive();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const { data } = usePendingConfirmationOrders();
  const orders = data?.items ?? [];
  const confirmOrder = useConfirmGuestOrder();
  const cancelOrder = useCancelOrder();
  const [open, setOpen] = useState(false);
  // Which order id is mid-request. useConfirmGuestOrder/useCancelOrder are ONE mutation
  // object shared by every card, so their `isPending` reads true for the whole list at
  // once — confirming a single order put a spinner on all ten and disabled them, which is
  // exactly when staff are trying to work the queue down one by one. Tracked per id instead.
  const [busyId, setBusyId] = useState<number | null>(null);
  // How many of this batch have already left the queue, so the header can say "Order 3 of
  // 10" rather than "Order 1 of 8" — the total has to hold still while staff work down the
  // queue, otherwise the number reads like the backlog never shrinks. Maintained by the
  // id-diff effect below, and reset once the queue actually empties.
  const [handled, setHandled] = useState(0);
  // null on the very first render = "haven't established a baseline yet". Only orders that
  // appear AFTER that baseline trigger a toast — otherwise every app launch with something
  // already pending (e.g. from before this device was open) would toast for old news.
  const seenIds = useRef<Set<number> | null>(null);

  useEffect(() => {
    const currentIds = new Set(orders.map((o) => o.id));
    if (seenIds.current === null) {
      seenIds.current = currentIds;
      return;
    }
    const fresh = orders.filter((o) => !seenIds.current!.has(o.id));
    // Orders that LEFT the queue since the last tick — confirmed or rejected here, or dealt
    // with by someone on another device. Counted off the id diff rather than incremented at
    // the call site so that `handled` rises in exactly the same render `queue.length` falls;
    // that lockstep is what keeps the header's "of N" total from flickering (bumping it when
    // the mutation resolved showed "of 11" out of 10 until the refetch caught up), and it
    // keeps the count honest when an order is confirmed on another device entirely.
    let departed = 0;
    seenIds.current.forEach((id) => {
      if (!currentIds.has(id)) departed += 1;
    });
    seenIds.current = currentIds;
    if (departed > 0) setHandled((n) => n + departed);
    if (fresh.length === 0) return;
    // One chime for the batch, for the same reason the toast below is one toast: five orders
    // landing together are one event to the person at the counter, and five overlapping
    // chimes just sound like a fault.
    alertChime.play();
    // Collapsed into a single toast deliberately. A QR rush lands several orders in one
    // push, and uiSlice holds exactly one toast at a time — dispatching per order had each
    // overwrite the last, so only the final table's name was ever readable. The count is
    // what staff act on; the per-order detail is in the pill and the sheet below.
    dispatch(
      showToast({
        message:
          fresh.length === 1
            ? `${orderLabel(fresh[0])} — new order, confirm karein?`
            : `${fresh.length} new orders — confirm karein?`,
        icon: 'bell-alert-outline',
        tone: 'warning',
      }),
    );
  }, [orders, dispatch]);

  // Keyed on "is anything waiting", NOT on how many: the count changes every time an order is
  // confirmed, and keying on that would restart the timer — and re-chime — on the way DOWN,
  // beeping at staff for the work they are in the middle of doing.
  const hasPending = orders.length > 0;
  useEffect(() => {
    // Silent while the sheet is open. Whoever opened it is looking at the queue right now;
    // chiming at them is nagging someone already doing the thing being asked for. Closing it
    // with orders still waiting re-arms this, which is the case the reminder is actually for.
    if (!hasPending || open) return;
    // Deliberately a reminder, not a one-shot: a QR order sits unmade until someone confirms
    // it, and the single chime on arrival is easy to miss across a busy floor. It stops the
    // moment the queue empties — the cleanup below runs when `hasPending` goes false.
    const timer = setInterval(() => alertChime.play(), PENDING_REMINDER_MS);
    return () => clearInterval(timer);
  }, [hasPending, open]);

  // Confirming a guest QR order fires it server-side (OrdersController.ConfirmGuestOrder)
  // exactly like a staff Fire — but unlike every staff-facing screen (TableManagementScreen,
  // POSCheckoutScreen, ...), which each print the newly-fired batch themselves right after
  // firing, this global host never did. A guest's own phone has no printer attached, so
  // without this the kitchen never got a physical ticket for anything ordered by QR — the
  // order was genuinely in the kitchen's queue, just with no paper to show for it. Same
  // batch-filtering logic as TableManagementScreen.printCurrentKot.
  const autoPrintKot = async (order: ApiOrder) => {
    const batchItems = order.items.filter((i) => i.fireBatch === order.currentFireBatch && !i.voided);
    if (batchItems.length === 0) return;
    const batch = order.fireBatches.find((b) => b.batchNumber === order.currentFireBatch);
    // Claim it before printing, not after — AutoKotPrintHost's own poll can land while this
    // request is still in flight, and it must see this batch as already spoken for.
    if (batch) markKotPrinted(batch.kotNumber);
    const result = await PrinterService.printKot({
      title: order.tableCode ? `Table ${order.tableCode}` : order.title,
      kotNumber: batch?.kotNumber || `#${order.currentFireBatch}`,
      time: new Date(batch?.firedAt ?? order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      guestName: order.tableCode ? order.guestName : undefined,
      items: batchItems.map((i) => ({
        name: i.name, qty: i.qty, variantName: i.variantName, modifier: i.modifier, stationName: i.stationName, vegNonVegType: i.vegNonVegType,
        selectedModifiers: i.selectedModifiers, subtitle: i.subtitle,
      })),
    });
    dispatch(showToast({ message: result.ok ? 'KOT sent to kitchen printer.' : result.message, icon: result.ok ? 'printer-check' : 'alert-circle-outline', tone: result.ok ? 'success' : 'warning' }));
  };

  const handleConfirm = async (id: number) => {
    if (busyId !== null) return;
    setBusyId(id);
    try {
      const result = await confirmOrder.mutateAsync(id);
      // The server auto-cancels a pending order whose cart came back empty (the guest
      // removed everything after placing) — tell staff what actually happened instead
      // of a false "sent to kitchen".
      if (result.cancelled) {
        dispatch(showToast({ message: 'Guest cart was empty — order removed.', icon: 'information-outline', tone: 'warning' }));
      } else {
        dispatch(showToast({ message: 'Order confirmed — sent to kitchen.', icon: 'check-circle', tone: 'success' }));
        await autoPrintKot(result);
      }
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not confirm order'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = (id: number, label: string) => {
    if (busyId !== null) return;
    confirmAlert(`Reject ${label}?`, "This cancels the guest's cart — nothing reaches the kitchen.", [
      { text: 'Keep waiting', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setBusyId(id);
          try {
            await cancelOrder.mutateAsync({ id, reason: 'Rejected by staff before confirmation' });
            dispatch(showToast({ message: 'Order rejected.', icon: 'close-circle-outline', tone: 'warning' }));
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not reject order'), icon: 'alert-circle-outline', tone: 'danger' }));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  // The component stays mounted after the queue empties (it just renders null), so an
  // `open` left true from the last batch would make the NEXT pending order skip the pill
  // and pop the full sheet unprompted. Same for `handled`, which would otherwise start the
  // next batch at "Order 11 of 12". Reset both while empty.
  useEffect(() => {
    if (orders.length > 0) return;
    if (open) setOpen(false);
    if (handled !== 0) setHandled(0);
  }, [orders.length, open, handled]);

  if (orders.length === 0) return null;

  // FIFO. The API hands these back newest-first (OrdersController's
  // OrderByDescending(CreatedAt)), which is exactly backwards for a queue that shows one at
  // a time — it would serve the guest who just ordered and leave the one who has been
  // waiting longest for last. Re-sorted oldest-first, with id as the tiebreaker for orders
  // punched in the same instant (the server tiebreaks on it for the same reason).
  const queue = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  const current = queue[0];
  const upNext = queue.slice(1);

  return (
    <>
      {/* NonBlockingOverlay, not RN's own <Modal> — see its own comments for why: this pill
          can stay up indefinitely (as long as any guest order is unconfirmed), and unlike a
          toast it has to stay tappable while it's showing, but react-native-web's <Modal>
          has no way to stop its internal backdrop from blocking every click on the rest of
          the page underneath it for that whole time. */}
      <NonBlockingOverlay visible={!open} zIndex={99998}>
        <View style={[styles.pillWrapper, { bottom: insets.bottom + 24 }]}>
          <TouchableOpacity style={[styles.pill, { pointerEvents: 'auto' }]} onPress={() => setOpen(true)} activeOpacity={0.85}>
            <Icon name="bell-alert" size={18} color="#FFFFFF" />
            <Text style={styles.pillText}>
              {orders.length} order{orders.length === 1 ? '' : 's'} awaiting confirmation
            </Text>
          </TouchableOpacity>
        </View>
      </NonBlockingOverlay>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeading}>
                <Text style={styles.sheetTitle}>Confirm Guest Orders</Text>
                <Text style={styles.sheetCounter}>
                  Order {handled + 1} of {handled + queue.length}
                </Text>
              </View>
              <CloseButton onPress={() => setOpen(false)} size={18} color={COLORS.heading} />
            </View>
            <View style={styles.orderCard}>
              <Text style={styles.orderTitle}>{orderLabel(current)}</Text>
              <Text style={styles.orderSub}>
                {current.items.filter((i) => i.fireBatch === 0).length} item(s) · ₹{current.total.toFixed(2)}
              </Text>
              <View style={styles.orderActions}>
                <TouchableOpacity
                  style={[styles.rejectBtn, busyId !== null && styles.btnDisabled]}
                  onPress={() => handleReject(current.id, orderLabel(current))}
                  disabled={busyId !== null}
                >
                  <Text style={styles.rejectText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={() => handleConfirm(current.id)}
                  disabled={busyId !== null}
                >
                  {busyId !== null ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.confirmText}>Confirm</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            {upNext.length > 0 && (
              <Text style={styles.upNext} numberOfLines={1}>
                Aage: {upNext.slice(0, 3).map(orderLabel).join(', ')}
                {upNext.length > 3 ? `  +${upNext.length - 3} aur` : ''}
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  pillWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99998,
    elevation: 99998,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 8 : 6,
    backgroundColor: COLORS.dangerAccent,
    paddingHorizontal: isDesktopWeb ? 18 : 13.5,
    paddingVertical: isDesktopWeb ? 12 : 9,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: isDesktopWeb ? 20 : 15,
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 12,
    padding: isDesktopWeb ? 14 : 10.5,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: isDesktopWeb ? 8 : 6,
    gap: isDesktopWeb ? 8 : 6,
  },
  sheetHeading: {
    flex: 1,
    gap: 2,
  },
  sheetTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.heading,
  },
  sheetCounter: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
  },
  upNext: {
    fontSize: 12,
    color: COLORS.muted,
    paddingHorizontal: isDesktopWeb ? 10 : 7.5,
    paddingTop: isDesktopWeb ? 2 : 1.5,
  },
  orderCard: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 7.5,
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  orderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  orderSub: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 2 : 1.5,
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  orderActions: {
    flexDirection: 'row',
    gap: isDesktopWeb ? 8 : 6,
  },
  rejectBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: isDesktopWeb ? 10 : 7.5,
    borderRadius: 6,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.dangerAccent,
  },
  rejectText: {
    color: COLORS.dangerAccent,
    fontWeight: '700',
    fontSize: 12,
  },
  confirmBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7.5,
    borderRadius: 6,
    backgroundColor: COLORS.accent,
  },
  confirmText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  btnDisabled: {
    opacity: 0.45,
  },
});
