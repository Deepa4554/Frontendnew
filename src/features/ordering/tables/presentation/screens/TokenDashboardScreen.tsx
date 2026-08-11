import React, { useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Linking, Alert, TextInput } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
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
import { ItemQtyStepper } from '../../../../../shared/components/billing/ItemQtyStepper';
import { useItemQtyEditor, QtyReasonPrompt } from '../../../../../shared/components/billing/useItemQtyEditor';
import { WhatsAppTrackingQr } from '../../../../../shared/components/billing/WhatsAppTrackingQr';
import { SkeletonGrid } from '../../../../../shared/components/atoms/Skeleton';
import { Tooltip } from '../../../../../shared/components/atoms/Tooltip';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const ITEM_STATUS_COLOR: Record<string, 'dangerAccent' | 'warning' | 'success'> = {
  NEW: 'dangerAccent',
  PREPARING: 'warning',
  READY: 'success',
  SERVED: 'success',
};
// Token tile badge (grid view) — was hardcoded to only distinguish SERVED vs
// everything else, so New/Preparing/Ready all showed the same muted gray. Reuses the
// same color language as the per-item pills below so a token's stage reads at a glance.
const TOKEN_STATUS_COLOR: Record<string, 'dangerAccent' | 'warning' | 'success'> = {
  NEW: 'dangerAccent',
  PREPARING: 'warning',
  READY: 'success',
  SERVED: 'success',
};

export const TokenDashboardScreen = ({ navigation }: any) => {
  const dispatch = useDispatch();
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const { data: settings } = useSettings();

  const { data: tokensPage, isLoading } = useOrders({ orderType: 'QSR', activeOnly: true });
  const tokens = tokensPage?.items ?? [];

  const [selected, setSelected] = useState<ApiOrder | null>(null);
  const { data: liveOrder } = useOrder(selected?.id ?? null);
  const order = liveOrder ?? selected;

  const serveItem = useServeItem();
  const payOrder = usePayOrder();
  const cancelBatch = useCancelBatch();
  const removeOrderItem = useRemoveOrderItem();
  // Quantity corrections on every line below — see useItemQtyEditor for the fired-line rules.
  const qtyEditor = useItemQtyEditor(order?.id ?? null);
  // Separate flags — Print Bill and Print KOT used to share one `printing` boolean, so
  // tapping either button lit up BOTH spinners even though only one print job ran.
  const [printingBill, setPrintingBill] = useState(false);
  const [printingKot, setPrintingKot] = useState(false);
  // Prompt for a reason once an item is already Preparing/Ready — matches the server's
  // "void before cooking (free) vs void with wastage (needs a reason)" rule, same as Tables.
  const [voidPromptItem, setVoidPromptItem] = useState<{ id: number; name: string } | null>(null);
  const [voidReasonText, setVoidReasonText] = useState('');

  const closeModal = () => {
    setSelected(null);
  };

  const navigateToPOS = () => {
    // Tells POS to open with the Token pill already active instead of defaulting to
    // Dine In — see tablesSlice.pendingOrderType.
    dispatch(setPendingOrderType('QSR'));
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
    navigateToPOS();
  };

  // Single tap, no confirmation — jumps this one line straight to Served regardless of
  // its current kitchen stage (the QSR counter flow has no use for KDS's stage-by-stage
  // stepping, see backend OrdersController.ServeItem).
  const handleTapServe = async (item: ApiOrderItem) => {
    if (!order || item.status === 'SERVED' || item.fireBatch === 0) return;
    try {
      await serveItem.mutateAsync({ id: order.id, itemId: item.id });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not mark served'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  // Cancels one whole KOT (fire batch) — every other round on this token is untouched.
  // Voiding the order's last remaining line this way also cancels the token itself
  // (see backend OrdersController.CancelBatch), so the modal is closed either way.
  const handleCancelKot = (batchNumber: number) => {
    if (!order) return;
    Alert.alert(
      'Cancel this KOT?',
      'Every not-yet-served item in this round is voided (stock is put back if prep hadn\'t started). Already-served items elsewhere on this token are untouched.',
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

  // Removes a single line — same rule as Tables: unfired or still-New reverses stock
  // and needs no reason; Preparing/Ready needs a reason and is counted as wastage;
  // already-Served is rejected by the server (surfaced as a toast, button stays visible
  // for simplicity — same as Tables' occupied-modal item rows).
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

  const handleMarkPaid = async (payments: PaymentSplit[], allowPartial?: boolean, andThen?: 'print' | 'whatsapp', phoneOverride?: string, guest?: { name: string; phone: string }) => {
    if (!order) return;
    try {
      // guestName/guestPhone are only present on a settle carrying a Due (udhaar) leg — the
      // server needs them to open the customer's khata and rejects the settle without.
      await payOrder.mutateAsync({ id: order.id, splits: payments, allowPartial, guestName: guest?.name, guestPhone: guest?.phone });
      // Chained straight off the settle tap (see OrderBillActions' split-button menu) —
      // neither of these depends on order.paid/payments having refreshed yet, they just
      // read the bill's items/prices, which settling never changes.
      if (andThen === 'print') await printBill();
      else if (andThen === 'whatsapp') await sendViaWhatsApp(phoneOverride);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not settle bill'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  // Customer-facing bill — items + prices + total. Generate this once the order's
  // ready to be paid: the cafe hands/scans this to the customer, they pay against it,
  // then staff taps Settle Bill. Distinct from Print KOT, which has no prices.
  const printBill = async () => {
    if (!order) return;
    setPrintingBill(true);
    const result = await PrinterService.printReceipt({
      businessName: settings?.businessName ?? 'PrabandhOS',
      addressLine: settings?.address?.trim() || undefined,
      orderNumber: order.number,
      time: new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      title: order.title,
      orderTypeLabel: 'Token',
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

  // Kitchen ticket for the current (latest) KOT — no prices, just what to make. Lets
  // staff manually re-print if the auto-fire print failed or a physical copy is needed
  // beyond what's on the KDS screen.
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
      title: `Token #${order.tokenNumber}`,
      kotNumber: currentBatch?.kotNumber || `#${order.currentFireBatch}`,
      time: new Date(currentBatch?.firedAt ?? order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      guestName: order.guestName,
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
          <Icon name="ticket-confirmation-outline" size={22} color={COLORS.accent} />
          <Text style={styles.brandTitle} numberOfLines={1}>Token Orders</Text>
        </View>
      )}
      <DesktopPageHeader icon="ticket-confirmation-outline" title="Token Orders" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isLoading && <SkeletonGrid items={6} columns={2} />}

        {!isLoading && tokens.length === 0 && (
          <View style={styles.emptyState}>
            <Icon name="ticket-confirmation-outline" size={28} color={COLORS.muted} />
            <Text style={styles.emptyStateText}>No active tokens right now. Create one from the POS's "Token" order type.</Text>
          </View>
        )}

        <View style={styles.grid}>
          {tokens.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.tile, isDesktopWeb && styles.tileDesktop]}
              activeOpacity={0.85}
              onPress={() => setSelected(t)}
            >
              {(() => {
                const tileColor = COLORS[TOKEN_STATUS_COLOR[t.status] ?? 'muted'];
                return (
                  <View style={[styles.tileStatusBadge, { backgroundColor: `${tileColor}22` }]}>
                    <Text style={[styles.tileStatusBadgeText, { color: tileColor }]}>{t.status}</Text>
                  </View>
                );
              })()}
              <Text style={styles.tileId}>#{t.tokenNumber}</Text>
              <Text style={styles.tileMeta} numberOfLines={1}>{t.guestName || 'Walk-in'} · {t.items.filter((i) => !i.voided).length} items</Text>
              <Text style={styles.tileBill}>₹{t.total.toFixed(2)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Tooltip label="New token order" placement="left">
        <TouchableOpacity style={styles.fab} onPress={navigateToPOS}>
          <Icon name="plus" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      </Tooltip>

      {/* Payment is available at any point (not gated on Served) — full page on mobile,
          centered card on desktop web. */}
      <Modal visible={!!selected} transparent={isDesktopWeb} animationType={isDesktopWeb ? 'fade' : 'slide'} onRequestClose={closeModal}>
        <View style={isDesktopWeb ? styles.modalOverlay : styles.fullPage}>
          <View style={isDesktopWeb ? styles.modalSheet : [styles.fullPageInner, { paddingTop: insets.top + 12 }]}>
            <View style={styles.modalHeaderRow}>
              {/* Mobile: back arrow belongs top-left like every other screen's header (see
                  the list screen's own header above) — it used to sit at the tail end of
                  headerActions, on the right, which reads backwards for a "go back" affordance.
                  Desktop web keeps its centered-sheet convention: an X in the top-right closes it,
                  nothing to the left of the title. */}
              {!isDesktopWeb && (
                <TouchableOpacity style={styles.headerIconBtn} onPress={closeModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Icon name="arrow-left" size={22} color={COLORS.muted} />
                </TouchableOpacity>
              )}
              {/* No modalHeadingOverride here — that helper's marginTop:12 is meant for a
                  title sitting alone at the top of a modal. In this row it shares
                  alignItems:'center' with the back button and header pills, so the extra
                  top margin pushed the title down out of line with both. */}
              <Text style={styles.modalTitle} numberOfLines={1}>
                Token #{order?.tokenNumber} — {order?.status}
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
                  <CloseButton onPress={closeModal} size={22} />
                )}
              </View>
            </View>
            <Text style={styles.modalLine}>{order?.guestName || 'Walk-in'}{order?.guestPhone ? ` · ${order.guestPhone}` : ''}</Text>

            {!order ? (
              <ActivityIndicator size="small" color={COLORS.accent} style={{ marginVertical: 24 }} />
            ) : (
              <>
                {/* flex:1 alone doesn't reliably get a determinate height to shrink into
                    inside the desktop modal's maxHeight-capped (not height-capped) card, so
                    it wouldn't actually scroll — a fixed maxHeight there is what works
                    (matches the pattern already used by POS's own bill modal). Mobile's
                    fullPageInner is a true flex-stretched full screen, so flex:1 is fine there. */}
                <ScrollView style={[styles.itemsScroll, isDesktopWeb && styles.itemsScrollDesktop]} showsVerticalScrollIndicator={isDesktopWeb} persistentScrollbar={isDesktopWeb}>
                  {/* Grouped by KOT/fire-batch — each round can be cancelled independently
                      of every other round already on this token (see Cancel KOT below). */}
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
                              {/* No served-units floor: the counts on a bill get settled at the
                                  till, by which point everything is served — a floor there would
                                  block the one correction this exists for ("was it 3 lassis or
                                  4?"). The server asks for a reason and audits it instead (see
                                  OrdersController.UpdateItemQty). */}
                              <ItemQtyStepper
                                qty={item.qty}
                                disabled={order.paid}
                                pending={qtyEditor.pendingItemId === item.id}
                                onChange={(next) => qtyEditor.request(item, next)}
                              />
                              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                              {/* The status label IS the tap target — one tap jumps straight to
                                  Served, no confirmation, no stage-by-stage stepping. */}
                              <TouchableOpacity
                                disabled={!servable || serveItem.isPending}
                                onPress={() => handleTapServe(item)}
                                style={[styles.itemStatusPill, { backgroundColor: `${dotColor}22` }]}
                              >
                                <Text style={[styles.itemStatusPillText, { color: dotColor }]}>{item.status}</Text>
                              </TouchableOpacity>
                              {!order.paid && (
                                <Tooltip label="Remove item" placement="left">
                                  <TouchableOpacity onPress={() => handleRemoveItem(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Icon name="close" size={16} color={COLORS.dangerAccent} />
                                  </TouchableOpacity>
                                </Tooltip>
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
                      <ItemQtyStepper
                        qty={item.qty}
                        disabled={order.paid}
                        pending={qtyEditor.pendingItemId === item.id}
                        onChange={(next) => qtyEditor.request(item, next)}
                      />
                      <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                      <View style={styles.unfiredTag}><Text style={styles.unfiredTagText}>NEW</Text></View>
                      {!order.paid && (
                        <Tooltip label="Remove item" placement="left">
                          <TouchableOpacity onPress={() => handleRemoveItem(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Icon name="close" size={16} color={COLORS.dangerAccent} />
                          </TouchableOpacity>
                        </Tooltip>
                      )}
                    </View>
                  ))}

                  {/* Bill + payment now scrolls with the item list rather than staying
                      pinned below it — with discount/charges/loyalty adjustments added,
                      this panel can grow taller than the screen, and a fixed pin made the
                      Settle button unreachable. Not gated on Served (a QSR counter may
                      collect payment well before anything's cooked). */}
                  <View style={{ marginTop: 8 }}>
                    <OrderBillActions
                      key={order.id}
                      order={order}
                      payingPending={payOrder.isPending}
                      printingPending={printingBill}
                      offerServeOnSettle
                      onMarkPaid={handleMarkPaid}
                      onPrintBill={printBill}
                      onSendWhatsApp={sendViaWhatsApp}
                    />
                  </View>

                  <WhatsAppTrackingQr orderId={order.id} />
                </ScrollView>

                {/* Mobile already has the back-arrow in the header above — a second
                    Close button here would just be a duplicate tap target. Desktop's
                    header only shows an X, so keep an explicit primary action there. */}
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

      {/* Same wastage bargain as the void prompt below, for a quantity cut rather than a
          whole line. */}
      <QtyReasonPrompt editor={qtyEditor} />

      {/* Reason prompt — item is already Preparing/Ready, so removing it won't reverse
          stock (food's genuinely spent); the server requires a reason for the record. */}
      <Modal visible={!!voidPromptItem} transparent animationType="fade" onRequestClose={() => setVoidPromptItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Remove {voidPromptItem?.name}?</Text>
            <Text style={styles.modalLine}>Already in prep — stock won't be put back. This is logged as wastage.</Text>
            <View style={{ borderRadius: 8 }}>
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

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 10 : 7.5, paddingHorizontal: isDesktopWeb ? 16 : 12, paddingBottom: isDesktopWeb ? 12 : 9 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  brandTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.heading },
  scrollContent: { paddingHorizontal: isDesktopWeb ? 13 : 12, paddingBottom: isDesktopWeb ? 80 : 75 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 32 : 30, gap: isDesktopWeb ? 8 : 7.5 },
  emptyStateText: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, textAlign: 'center', paddingHorizontal: isDesktopWeb ? 16 : 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 8 : 9 },
  tile: {
    width: '46.5%',
    minHeight: 120,
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 10.5,
    backgroundColor: COLORS.cardAlt,
    justifyContent: 'flex-end',
  },
  tileDesktop: { width: '18%', minHeight: 105 },
  tileStatusBadge: { position: 'absolute', top: 12, right: 12, paddingHorizontal: isDesktopWeb ? 6 : 6, paddingVertical: isDesktopWeb ? 3 : 2.25, borderRadius: 999 },
  tileStatusBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  tileId: { fontSize: isDesktopWeb ? 24 : 22, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 5 : 4.5 },
  tileMeta: { fontSize: 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 2 : 1.5 },
  tileBill: { fontSize: isDesktopWeb ? 16 : 17, fontWeight: '800', color: COLORS.heading },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 20 : 18 },
  // maxHeight caps the card so itemsScroll's flex:1 below has a bounded height to work
  // with — without it, a tall order (more items, more billing adjustments) just grows the
  // card past the viewport with nothing scrollable to reach the Settle button.
  modalSheet: { width: '100%', maxWidth: 760, maxHeight: '94%', backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 12 : 16.5 },
  // Order-detail modal on mobile: full page, not a centered popup.
  fullPage: { flex: 1, backgroundColor: COLORS.background },
  fullPageInner: { flex: 1, paddingHorizontal: isDesktopWeb ? 16 : 12, paddingBottom: isDesktopWeb ? 16 : 12 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: isDesktopWeb ? 5 : 4.5, marginBottom: isDesktopWeb ? 2 : 3 },
  modalTitle: { flex: 1, minWidth: 0, fontSize: isDesktopWeb ? 18 : 14, fontWeight: '800', color: COLORS.heading },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 5 : 4.5 },
  headerPill: {
    flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 3 : 2.25,
    backgroundColor: COLORS.cardAlt, borderRadius: 14, paddingHorizontal: isDesktopWeb ? 7 : 6.75, paddingVertical: isDesktopWeb ? 5 : 3.75,
  },
  headerPillText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  headerPillTextAccent: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
  modalLine: { fontSize: isDesktopWeb ? 12 : 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 6 },
  reasonInput: { borderWidth: 1, borderColor: COLORS.divider, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 11 : 10.5, paddingVertical: isDesktopWeb ? 10 : 9, fontSize: isDesktopWeb ? 14 : 16, color: COLORS.heading, marginBottom: isDesktopWeb ? 13 : 12 },
  // minHeight: 0 overrides a flex item's default min-height:auto — without it, a ScrollView
  // refuses to shrink below its content's natural height and instead pushes the modal (and
  // whatever's pinned below it) taller than the card's own maxHeight, rather than clipping
  // and actually scrolling.
  itemsScroll: { flex: 1, minHeight: 0, marginBottom: isDesktopWeb ? 3 : 6 },
  itemsScrollDesktop: { flex: undefined, maxHeight: 560 },
  kotGroup: { marginBottom: isDesktopWeb ? 3 : 7.5 },
  kotHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: isDesktopWeb ? 1.5 : 4.5 },
  kotLabel: { fontSize: isDesktopWeb ? 10 : 12, fontWeight: '700', color: COLORS.muted },
  cancelKotText: { fontSize: isDesktopWeb ? 11 : 12, fontWeight: '700', color: COLORS.dangerAccent },
  unfiredTag: { alignSelf: 'flex-start', backgroundColor: COLORS.warningBg, borderRadius: 999, paddingHorizontal: isDesktopWeb ? 5 : 6, paddingVertical: isDesktopWeb ? 1 : 1.5, marginLeft: 'auto' },
  unfiredTagText: { fontSize: isDesktopWeb ? 8.5 : 10, fontWeight: '800', color: COLORS.warning },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 8 : 7.5, paddingVertical: isDesktopWeb ? 1.5 : 6, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  itemName: { flex: 1, minWidth: 0, fontSize: isDesktopWeb ? 12 : 12, color: COLORS.heading },
  itemStatusPill: { paddingHorizontal: isDesktopWeb ? 4.5 : 7.5, paddingVertical: isDesktopWeb ? 1 : 3.75, borderRadius: 999 },
  itemStatusPillText: { fontSize: isDesktopWeb ? 8.5 : 11, fontWeight: '800' },
  modalActions: { flexDirection: 'row', gap: 6, marginTop: 6 },
  modalCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 7.5, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalPayBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10.5, borderRadius: 6, backgroundColor: COLORS.heading },
  modalPayText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
