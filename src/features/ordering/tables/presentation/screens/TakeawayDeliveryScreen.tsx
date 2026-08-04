import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Linking, Alert, TextInput } from 'react-native';
import { useDispatch } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { showToast } from '../../../../../core/store/uiSlice';
import { resumeOrder, setPendingOrderType } from '../../../../../core/store/tablesSlice';
import {
  useOrders,
  useOrder,
  useServeItem,
  useServeAll,
  usePayOrder,
  useCancelBatch,
  useRemoveOrderItem,
} from '../../../../../core/api/hooks/useOrders';
import { ApiOrder, OrderItem as ApiOrderItem, ordersApi } from '../../../../../core/api/ordersApi';
import { useSettings } from '../../../../../core/api/hooks/useSettings';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { buildWhatsAppBillUrl } from '../../../../../core/utils/whatsappShare';
import { getPublicApiBaseUrl } from '../../../../../core/config/env';
import { PrinterService } from '../../../../../core/printing/PrinterService';
import { OrderBillActions, PaymentSplit } from '../../../../../shared/components/billing/OrderBillActions';
import { SkeletonGrid } from '../../../../../shared/components/atoms/Skeleton';
import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

type OrderKind = 'TAKEAWAY' | 'DELIVERY';
type FilterKey = 'ALL' | OrderKind;

const ITEM_STATUS_COLOR: Record<string, 'dangerAccent' | 'warning' | 'success'> = {
  NEW: 'dangerAccent',
  PREPARING: 'warning',
  READY: 'success',
  SERVED: 'success',
};
// Same status→color language KDS/Token use, reused for both the tile badge and the
// per-item pills below so this screen reads consistently with the rest of the app.
const ORDER_STATUS_COLOR = ITEM_STATUS_COLOR;

const KIND_ICON: Record<OrderKind, string> = { TAKEAWAY: 'bag-personal-outline', DELIVERY: 'moped-outline' };
const KIND_LABEL: Record<OrderKind, string> = { TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };

export const TakeawayDeliveryScreen = ({ navigation }: any) => {
  const dispatch = useDispatch();
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS);
  const insets = useSafeAreaInsets();
  const { data: settings } = useSettings();

  const [filter, setFilter] = useState<FilterKey>('ALL');

  // No server-side "orderType in [...]" filter exists (see ordersApi.list's single
  // `orderType?: string` param) — two calls, one per type, merged client-side.
  const { data: takeawayPage, isLoading: takeawayLoading } = useOrders({ orderType: 'TAKEAWAY', activeOnly: true });
  const { data: deliveryPage, isLoading: deliveryLoading } = useOrders({ orderType: 'DELIVERY', activeOnly: true });
  const isLoading = takeawayLoading || deliveryLoading;

  const orders = useMemo(() => {
    const combined = [...(takeawayPage?.items ?? []), ...(deliveryPage?.items ?? [])];
    combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return filter === 'ALL' ? combined : combined.filter((o) => o.orderType === filter);
  }, [takeawayPage, deliveryPage, filter]);

  const [selected, setSelected] = useState<ApiOrder | null>(null);
  const { data: liveOrder } = useOrder(selected?.id ?? null);
  const order = liveOrder ?? selected;

  const serveItem = useServeItem();
  const serveAll = useServeAll();
  const payOrder = usePayOrder();
  const cancelBatch = useCancelBatch();
  const removeOrderItem = useRemoveOrderItem();
  const [printingBill, setPrintingBill] = useState(false);
  const [printingKot, setPrintingKot] = useState(false);
  // Prompt for a reason once an item is already Preparing/Ready — matches the server's
  // "void before cooking (free) vs void with wastage (needs a reason)" rule, same as Tables/Token.
  const [voidPromptItem, setVoidPromptItem] = useState<{ id: number; name: string } | null>(null);
  const [voidReasonText, setVoidReasonText] = useState('');

  const closeModal = () => {
    setSelected(null);
  };

  const navigateToPOS = (kind: OrderKind) => {
    // Tells POS to open with the Takeaway/Delivery pill already active instead of
    // defaulting to Dine In — see tablesSlice.pendingOrderType.
    dispatch(setPendingOrderType(kind));
    try {
      navigation.navigate('MainTabs', { screen: 'POS' });
    } catch {
      navigation.navigate('POS');
    }
  };

  const handleAddItem = () => {
    if (!order) return;
    dispatch(resumeOrder({ orderId: order.id }));
    closeModal();
    navigateToPOS(order.orderType === 'DELIVERY' ? 'DELIVERY' : 'TAKEAWAY');
  };

  // Single tap, no confirmation — jumps this one line straight to Served regardless of
  // its current kitchen stage (same one-tap pattern as Token's counter flow).
  const handleTapServe = async (item: ApiOrderItem) => {
    if (!order || item.status === 'SERVED' || item.fireBatch === 0) return;
    try {
      await serveItem.mutateAsync({ id: order.id, itemId: item.id });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not mark served'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleMarkAllServed = async () => {
    if (!order) return;
    try {
      await serveAll.mutateAsync({ id: order.id });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not mark all served'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  // Cancels one whole KOT (fire batch) — every other round on this order is untouched.
  const handleCancelKot = (batchNumber: number) => {
    if (!order) return;
    Alert.alert(
      'Cancel this KOT?',
      'Every not-yet-served item in this round is voided (stock is put back if prep hadn\'t started). Already-served items elsewhere on this order are untouched.',
      [
        { text: 'Keep KOT', style: 'cancel' },
        {
          text: 'Cancel KOT',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = await cancelBatch.mutateAsync({ id: order.id, batchNumber });
              if (updated.cancelled) closeModal();
              dispatch(showToast({ message: 'KOT cancelled.', icon: 'close-circle-outline', tone: 'warning' }));
            } catch (err) {
              dispatch(showToast({ message: getApiErrorMessage(err, 'Could not cancel KOT'), icon: 'alert-circle-outline', tone: 'danger' }));
            }
          },
        },
      ],
    );
  };

  // Removes a single line — same rule as Tables/Token: unfired or still-New reverses
  // stock and needs no reason; Preparing/Ready needs a reason and is counted as wastage.
  const handleRemoveItem = (item: ApiOrderItem) => {
    if (!order) return;
    if (item.fireBatch > 0 && (item.status === 'PREPARING' || item.status === 'READY')) {
      setVoidPromptItem({ id: item.id, name: item.name });
      setVoidReasonText('');
      return;
    }
    removeOrderItem.mutate(
      { id: order.id, itemId: item.id },
      { onError: (err) => dispatch(showToast({ message: getApiErrorMessage(err, 'Could not remove item'), icon: 'alert-circle-outline', tone: 'danger' })) },
    );
  };

  const confirmVoidWithReason = async () => {
    if (!order || !voidPromptItem) return;
    if (!voidReasonText.trim()) {
      dispatch(showToast({ message: 'A reason is required to remove an item already in preparation.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await removeOrderItem.mutateAsync({ id: order.id, itemId: voidPromptItem.id, reason: voidReasonText.trim() });
      dispatch(showToast({ message: `Removed ${voidPromptItem.name} — no stock reversal (already in prep).`, icon: 'delete-outline', tone: 'warning' }));
      setVoidPromptItem(null);
      setVoidReasonText('');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not remove item'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleMarkPaid = async (payments: PaymentSplit[], allowPartial?: boolean, andThen?: 'print' | 'whatsapp', phoneOverride?: string) => {
    if (!order) return;
    try {
      await payOrder.mutateAsync({ id: order.id, splits: payments, allowPartial });
      if (andThen === 'print') await printBill();
      else if (andThen === 'whatsapp') await sendViaWhatsApp(phoneOverride);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not settle bill'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  // Customer-facing bill — items + prices + total. Distinct from Print KOT, which has
  // no prices.
  const printBill = async () => {
    if (!order) return;
    setPrintingBill(true);
    const result = await PrinterService.printReceipt({
      businessName: settings?.businessName ?? 'PrabandhOS',
      addressLine: settings?.address?.trim() || undefined,
      orderNumber: order.number,
      time: new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      title: order.title,
      orderTypeLabel: KIND_LABEL[order.orderType === 'DELIVERY' ? 'DELIVERY' : 'TAKEAWAY'],
      guestPhone: order.guestPhone ?? undefined,
      waiterName: order.servedByName ?? order.createdByName,
      gstNumber: settings?.gstNumber,
      upiVpa: settings?.upiVpa,
      amountDue: order.balanceDue ?? order.total,
      items: order.items,
      subtotal: order.subtotal,
      discountPct: order.discountPct || undefined,
      discountAmount: order.discountAmount || undefined,
      taxRatePct: settings?.taxRatePct ?? 8,
      tax: order.tax,
      total: order.total,
      footer: settings?.receiptFooter ?? 'Thank you for your visit!',
      showAddress: settings?.receiptShowAddress,
      showWaiterName: settings?.receiptShowWaiterName,
      showGuestPhone: settings?.receiptShowGuestPhone,
      showItemNotes: settings?.receiptShowItemNotes,
      showFooter: settings?.receiptShowFooter,
    });
    setPrintingBill(false);
    dispatch(showToast({ message: result.message, icon: result.ok ? 'printer-check' : 'alert-circle-outline', tone: result.ok ? 'success' : 'danger' }));
  };

  // Kitchen ticket for the current (latest) KOT — no prices, just what to make.
  const handlePrintKot = async () => {
    if (!order) return;
    const currentBatchItems = order.items.filter((i) => i.fireBatch === order.currentFireBatch && !i.voided);
    if (currentBatchItems.length === 0) {
      dispatch(showToast({ message: 'Nothing fired to the kitchen yet.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const currentBatch = order.fireBatches.find((b) => b.batchNumber === order.currentFireBatch);
    setPrintingKot(true);
    const result = await PrinterService.printKot({
      // order.title already reads "Takeaway – <guest>" for this order type, so no
      // separate guestName line here — that would just repeat the same name twice.
      title: order.title,
      kotNumber: currentBatch?.kotNumber || `#${order.currentFireBatch}`,
      time: new Date(currentBatch?.firedAt ?? order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      items: currentBatchItems.map((i) => ({
        name: i.name, qty: i.qty, variantName: i.variantName, modifier: i.modifier, stationName: i.stationName, vegNonVegType: i.vegNonVegType,
        selectedModifiers: i.selectedModifiers,
      })),
    });
    setPrintingKot(false);
    dispatch(showToast({ message: result.message, icon: result.ok ? 'printer-check' : 'alert-circle-outline', tone: result.ok ? 'success' : 'danger' }));
  };

  // phoneOverride: a number the cashier just added through OrderBillActions' missing-number
  // prompt — `order` is still the pre-update copy here, so it can't be read back off the
  // order yet (see OrderBillActions' onSendWhatsApp doc).
  const sendViaWhatsApp = async (phoneOverride?: string) => {
    const guestPhone = phoneOverride ?? order?.guestPhone;
    if (!order || !guestPhone) return;
    let receiptUrl: string | undefined;
    try {
      const token = await ordersApi.getReceiptToken(order.id);
      receiptUrl = `${getPublicApiBaseUrl()}/public/receipt/${token}`;
    } catch {
      receiptUrl = undefined;
    }
    const url = buildWhatsAppBillUrl({
      businessName: settings?.businessName ?? 'PrabandhOS',
      orderNumber: order.number,
      items: order.items,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount || undefined,
      tax: order.tax,
      total: order.total,
      guestPhone,
      receiptUrl,
    });
    if (!url) {
      dispatch(showToast({ message: 'Need a valid 10-digit mobile number to send via WhatsApp.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="moped-outline" size={22} color={COLORS.accent} />
          <Text style={styles.brandTitle} numberOfLines={1}>Takeaway & Delivery</Text>
        </View>
      )}
      <DesktopPageHeader icon="moped-outline" title="Takeaway & Delivery" />

      <View style={styles.filterRow}>
        {(['ALL', 'TAKEAWAY', 'DELIVERY'] as FilterKey[]).map((key) => {
          const active = filter === key;
          return (
            <TouchableOpacity key={key} style={[styles.filterPill, active && styles.filterPillActive]} onPress={() => setFilter(key)}>
              <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                {key === 'ALL' ? 'All' : KIND_LABEL[key]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isLoading && <SkeletonGrid items={6} columns={2} />}

        {!isLoading && orders.length === 0 && (
          <View style={styles.emptyState}>
            <Icon name="moped-outline" size={28} color={COLORS.muted} />
            <Text style={styles.emptyStateText}>No active takeaway or delivery orders right now. Create one from the POS's Takeaway or Delivery order type.</Text>
          </View>
        )}

        <View style={styles.grid}>
          {orders.map((o) => {
            const kind: OrderKind = o.orderType === 'DELIVERY' ? 'DELIVERY' : 'TAKEAWAY';
            const tileColor = COLORS[ORDER_STATUS_COLOR[o.status] ?? 'muted'];
            return (
              <TouchableOpacity
                key={o.id}
                style={[styles.tile, isDesktopWeb && styles.tileDesktop]}
                activeOpacity={0.85}
                onPress={() => setSelected(o)}
              >
                <View style={styles.tileKindRow}>
                  <Icon name={KIND_ICON[kind]} size={13} color={COLORS.muted} />
                  <Text style={styles.tileKindText}>{KIND_LABEL[kind]}</Text>
                </View>
                <View style={[styles.tileStatusBadge, { backgroundColor: `${tileColor}22` }]}>
                  <Text style={[styles.tileStatusBadgeText, { color: tileColor }]}>{o.status}</Text>
                </View>
                <Text style={styles.tileId} numberOfLines={1}>{o.number}</Text>
                <Text style={styles.tileMeta} numberOfLines={1}>{o.guestName || 'Walk-in'} · {o.items.filter((i) => !i.voided).length} items</Text>
                <Text style={styles.tileBill}>₹{o.total.toFixed(2)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.fabGroup}>
        <TouchableOpacity style={styles.fabRow} onPress={() => navigateToPOS('DELIVERY')}>
          <Text style={styles.fabLabel}>Delivery</Text>
          <View style={styles.fabCircle}>
            <Icon name="moped-outline" size={22} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fabRow} onPress={() => navigateToPOS('TAKEAWAY')}>
          <Text style={styles.fabLabel}>Takeaway</Text>
          <View style={styles.fabCircle}>
            <Icon name="bag-personal-outline" size={22} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Payment is available at any point (not gated on Served) — full page on mobile,
          centered card on desktop web, same convention as Token's own modal. */}
      <Modal visible={!!selected} transparent={isDesktopWeb} animationType={isDesktopWeb ? 'fade' : 'slide'} onRequestClose={closeModal}>
        <View style={isDesktopWeb ? styles.modalOverlay : styles.fullPage}>
          <View style={isDesktopWeb ? styles.modalSheet : [styles.fullPageInner, { paddingTop: insets.top + 12 }]}>
            <View style={styles.modalHeaderRow}>
              {!isDesktopWeb && (
                <TouchableOpacity style={styles.headerIconBtn} onPress={closeModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Icon name="arrow-left" size={22} color={COLORS.muted} />
                </TouchableOpacity>
              )}
              {/* No modalHeadingOverride here — same reasoning as Token's own modal header:
                  its marginTop:12 is meant for a title alone at the top of a modal, and
                  would push this title out of line with the back button/header pills
                  sharing this alignItems:'center' row. */}
              <Text style={styles.modalTitle} numberOfLines={1}>
                {order ? `${KIND_LABEL[order.orderType === 'DELIVERY' ? 'DELIVERY' : 'TAKEAWAY']} ${order.number} — ${order.status}` : ''}
              </Text>
              <View style={styles.headerActions}>
                {order && !order.paid && (
                  <TouchableOpacity style={styles.headerPill} onPress={handleAddItem}>
                    <Icon name="plus" size={14} color={COLORS.accent} />
                    <Text style={styles.headerPillTextAccent}>Add Item</Text>
                  </TouchableOpacity>
                )}
                {order && (
                  <TouchableOpacity style={styles.headerPill} onPress={handlePrintKot} disabled={printingKot}>
                    {printingKot ? (
                      <ActivityIndicator size="small" color={COLORS.heading} />
                    ) : (
                      <Icon name="receipt" size={14} color={COLORS.heading} />
                    )}
                    <Text style={styles.headerPillText}>Print KOT</Text>
                  </TouchableOpacity>
                )}
                {isDesktopWeb && (
                  <TouchableOpacity onPress={closeModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Icon name="close" size={22} color={COLORS.muted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <Text style={styles.modalLine}>{order?.guestName || 'Walk-in'}{order?.guestPhone ? ` · ${order.guestPhone}` : ''}</Text>

            {!order ? (
              <ActivityIndicator size="small" color={COLORS.accent} style={{ marginVertical: 24 }} />
            ) : (
              <>
                <ScrollView style={[styles.itemsScroll, isDesktopWeb && styles.itemsScrollDesktop]} showsVerticalScrollIndicator={false}>
                  {/* Grouped by KOT/fire-batch — each round can be cancelled independently
                      of every other round already on this order. */}
                  {order.fireBatches.map((batch) => {
                    const batchItems = order.items.filter((i) => i.fireBatch === batch.batchNumber && !i.voided);
                    if (batchItems.length === 0) return null;
                    const batchCancellable = batch.status !== 'SERVED';
                    return (
                      <View key={batch.batchNumber} style={styles.kotGroup}>
                        <View style={styles.kotHeaderRow}>
                          <Text style={styles.kotLabel}>KOT {batch.kotNumber || `#${batch.batchNumber}`} · {batch.status}</Text>
                          {batchCancellable && (
                            <TouchableOpacity onPress={() => handleCancelKot(batch.batchNumber)} disabled={cancelBatch.isPending} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Text style={styles.cancelKotText}>Cancel KOT</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        {batchItems.map((item) => {
                          const dotColor = COLORS[ITEM_STATUS_COLOR[item.status] ?? 'muted'];
                          const servable = item.status !== 'SERVED';
                          return (
                            <View key={item.id} style={styles.itemRow}>
                              <Text style={styles.itemQty}>{item.qty}×</Text>
                              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                              <TouchableOpacity
                                disabled={!servable || serveItem.isPending}
                                onPress={() => handleTapServe(item)}
                                style={[styles.itemStatusPill, { backgroundColor: `${dotColor}22` }]}
                              >
                                <Text style={[styles.itemStatusPillText, { color: dotColor }]}>{item.status}</Text>
                              </TouchableOpacity>
                              {!order.paid && (
                                <TouchableOpacity onPress={() => handleRemoveItem(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                  <Icon name="close" size={16} color={COLORS.dangerAccent} />
                                </TouchableOpacity>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                  {/* Unfired lines (just-added via "Add Item", not yet part of any KOT) */}
                  {order.items.filter((i) => i.fireBatch === 0 && !i.voided).map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <Text style={styles.itemQty}>{item.qty}×</Text>
                      <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                      <View style={styles.unfiredTag}><Text style={styles.unfiredTagText}>NEW</Text></View>
                      {!order.paid && (
                        <TouchableOpacity onPress={() => handleRemoveItem(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Icon name="close" size={16} color={COLORS.dangerAccent} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}

                  {order.status !== 'SERVED' && (
                    <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAllServed} disabled={serveAll.isPending}>
                      {serveAll.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="check-all" size={16} color="#FFFFFF" />}
                      <Text style={styles.markAllBtnText}>
                        {order.orderType === 'DELIVERY' ? 'Mark Out for Delivery' : 'Mark Ready for Pickup'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Bill + payment scrolls with the item list — not gated on Served (a
                      takeaway/delivery counter may collect payment well before anything's
                      cooked), same convention as Token's own modal. */}
                  <View style={{ marginTop: 8 }}>
                    <OrderBillActions
                      key={order.id}
                      order={order}
                      payingPending={payOrder.isPending}
                      printingPending={printingBill}
                      onMarkPaid={handleMarkPaid}
                      onPrintBill={printBill}
                      onSendWhatsApp={sendViaWhatsApp}
                    />
                  </View>
                </ScrollView>

                {isDesktopWeb && (
                  <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.modalCancelBtn} onPress={closeModal}>
                      <Text style={styles.modalCancelText}>{order.paid ? 'Done' : 'Close'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Reason prompt — item is already Preparing/Ready, so removing it won't reverse
          stock (food's genuinely spent); the server requires a reason for the record. */}
      <Modal visible={!!voidPromptItem} transparent animationType="fade" onRequestClose={() => setVoidPromptItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Remove {voidPromptItem?.name}?</Text>
            <Text style={styles.modalLine}>Already in prep — stock won't be put back. This is logged as wastage.</Text>
            <View style={styles.reasonInputWrap}>
              <TextInput
                style={styles.reasonInput}
                placeholder="Reason (required)"
                placeholderTextColor={COLORS.muted}
                value={voidReasonText}
                onChangeText={setVoidReasonText}
                autoFocus
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setVoidPromptItem(null)}>
                <Text style={styles.modalCancelText}>Keep Item</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalPayBtn} onPress={confirmVoidWithReason} disabled={removeOrderItem.isPending}>
                {removeOrderItem.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalPayText}>Remove Item</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  brandTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.heading },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: COLORS.cardAlt },
  filterPillActive: { backgroundColor: COLORS.heading },
  filterPillText: { fontSize: 13, fontWeight: '700', color: COLORS.muted },
  filterPillTextActive: { color: '#FFFFFF' },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 100 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
  emptyStateText: { fontSize: 13, color: COLORS.muted, textAlign: 'center', paddingHorizontal: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '46.5%',
    minHeight: 120,
    borderRadius: 8,
    padding: 14,
    backgroundColor: COLORS.cardAlt,
    justifyContent: 'flex-end',
  },
  tileDesktop: { width: '18%', minHeight: 105 },
  tileKindRow: { flexDirection: 'row', alignItems: 'center', gap: 4, position: 'absolute', top: 12, left: 12 },
  tileKindText: { fontSize: 10, fontWeight: '700', color: COLORS.muted },
  tileStatusBadge: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tileStatusBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  tileId: { fontSize: 18, fontWeight: 'bold', color: COLORS.heading, marginBottom: 6 },
  tileMeta: { fontSize: 12, color: COLORS.muted, marginBottom: 2 },
  tileBill: { fontSize: 16, fontWeight: '800', color: COLORS.heading },
  fabGroup: { position: 'absolute', right: 20, bottom: 24, gap: 12, alignItems: 'flex-end' },
  fabRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
    backgroundColor: COLORS.cardAlt,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  fabCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalSheet: { width: '100%', maxWidth: 760, maxHeight: '94%', backgroundColor: COLORS.background, borderRadius: 12, padding: 22 },
  fullPage: { flex: 1, backgroundColor: COLORS.background },
  fullPageInner: { flex: 1, paddingHorizontal: 16, paddingBottom: 16 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 },
  modalTitle: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '800', color: COLORS.heading },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.cardAlt, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5,
  },
  headerPillText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  headerPillTextAccent: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
  modalLine: { fontSize: 13, color: COLORS.muted, marginBottom: 8 },
  reasonInputWrap: { borderRadius: 8 },
  reasonInput: { borderWidth: 1, borderColor: COLORS.divider, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.heading, marginBottom: 16 },
  itemsScroll: { flex: 1, minHeight: 0, marginBottom: 8 },
  itemsScrollDesktop: { flex: undefined, maxHeight: 560 },
  kotGroup: { marginBottom: 10 },
  kotHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  kotLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  cancelKotText: { fontSize: 12, fontWeight: '700', color: COLORS.dangerAccent },
  unfiredTag: { alignSelf: 'flex-start', backgroundColor: COLORS.warningBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 'auto' },
  unfiredTagText: { fontSize: 10, fontWeight: '800', color: COLORS.warning },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  itemQty: { fontSize: 13, fontWeight: '700', color: COLORS.heading, width: 30 },
  itemName: { flex: 1, minWidth: 0, fontSize: 13, color: COLORS.heading },
  itemStatusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  itemStatusPillText: { fontSize: 11, fontWeight: '800' },
  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.accent, borderRadius: 6, paddingVertical: 9, marginBottom: 6,
  },
  markAllBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  modalCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: COLORS.heading },
  modalPayBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 6, backgroundColor: COLORS.heading },
  modalPayText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
