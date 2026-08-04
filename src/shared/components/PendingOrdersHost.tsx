import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { useDispatch } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePendingConfirmationOrders, useConfirmGuestOrder, useCancelOrder } from '../../core/api/hooks/useOrders';
import { showToast } from '../../core/store/uiSlice';
import { getApiErrorMessage } from '../../core/network/api';
import { WarmColors as COLORS } from '../design/warmTheme';
import { confirmAlert } from './ConfirmDialogHost';
import { NonBlockingOverlay } from './NonBlockingOverlay';
import { useResponsive } from '../../core/utils/useResponsive';

/**
 * Staff-Confirm Mode's floor-wide alert — mounted once at the AppNavigator level (not inside
 * any one screen) so "Table T5 — new order, confirm karein?" shows up no matter which tab a
 * staff member is on, POS/Tables/anywhere. Polls usePendingConfirmationOrders (5s — this
 * codebase has no WebSocket, see GuestSessionController) and toasts the instant a NEW pending
 * order shows up; unlike a plain toast (1.8s auto-dismiss), the floating pill below stays up
 * for as long as anything is actually waiting, so it can't be missed by someone glancing away.
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
    orders
      .filter((o) => !seenIds.current!.has(o.id))
      .forEach((o) => {
        dispatch(
          showToast({
            message: `${o.tableCode ? `Table ${o.tableCode}` : o.title} — new order, confirm karein?`,
            icon: 'bell-alert-outline',
            tone: 'warning',
          }),
        );
      });
    seenIds.current = currentIds;
  }, [orders, dispatch]);

  const handleConfirm = async (id: number) => {
    try {
      const result = await confirmOrder.mutateAsync(id);
      // The server auto-cancels a pending order whose cart came back empty (the guest
      // removed everything after placing) — tell staff what actually happened instead
      // of a false "sent to kitchen".
      if (result.cancelled) {
        dispatch(showToast({ message: 'Guest cart was empty — order removed.', icon: 'information-outline', tone: 'warning' }));
      } else {
        dispatch(showToast({ message: 'Order confirmed — sent to kitchen.', icon: 'check-circle', tone: 'success' }));
      }
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not confirm order'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleReject = (id: number, label: string) => {
    confirmAlert(`Reject ${label}?`, "This cancels the guest's cart — nothing reaches the kitchen.", [
      { text: 'Keep waiting', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelOrder.mutateAsync({ id, reason: 'Rejected by staff before confirmation' });
            dispatch(showToast({ message: 'Order rejected.', icon: 'close-circle-outline', tone: 'warning' }));
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not reject order'), icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  // The component stays mounted after the queue empties (it just renders null), so an
  // `open` left true from the last batch would make the NEXT pending order skip the pill
  // and pop the full sheet unprompted. Reset while empty.
  useEffect(() => {
    if (orders.length === 0 && open) setOpen(false);
  }, [orders.length, open]);

  if (orders.length === 0) return null;

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
              <Text style={styles.sheetTitle}>Confirm Guest Orders</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Icon name="close" size={18} color={COLORS.heading} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {orders.map((o) => (
                <View key={o.id} style={styles.orderCard}>
                  <Text style={styles.orderTitle}>{o.tableCode ? `Table ${o.tableCode}` : o.title}</Text>
                  <Text style={styles.orderSub}>
                    {o.items.filter((i) => i.fireBatch === 0).length} item(s) · ₹{o.total.toFixed(2)}
                  </Text>
                  <View style={styles.orderActions}>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => handleReject(o.id, o.tableCode ? `Table ${o.tableCode}` : o.title)}
                    >
                      <Text style={styles.rejectText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmBtn}
                      onPress={() => handleConfirm(o.id)}
                      disabled={confirmOrder.isPending}
                    >
                      {confirmOrder.isPending ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.confirmText}>Confirm</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
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
  sheetTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.heading,
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
});
