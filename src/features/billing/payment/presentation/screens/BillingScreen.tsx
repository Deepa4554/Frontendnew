import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Linking } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useOrders } from '../../../../../core/api/hooks/useOrders';
import { useSettings } from '../../../../../core/api/hooks/useSettings';
import { ApiOrder, OrderStatus } from '../../../../../core/api/ordersApi';
import { PrinterService } from '../../../../../core/printing/PrinterService';
import { splitGst } from '../../../../../core/printing/receiptFormat';
import { showToast } from '../../../../../core/store/uiSlice';
import { buildWhatsAppBillUrl } from '../../../../../core/utils/whatsappShare';
import { ordersApi } from '../../../../../core/api/ordersApi';
import { getPublicApiBaseUrl } from '../../../../../core/config/env';
import { SkeletonList, SkeletonBox } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { istToday } from '../../../../../core/utils/istDate';
import { CategoryFilterModal, CategoryFilterTrigger } from '../../../../../shared/components/molecules/CategoryFilterModal';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

export const BillingScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const STATUS_STYLES: Record<OrderStatus, { bg: string; text: string; label: string }> = {
    NEW: { bg: COLORS.dangerBg, text: COLORS.dangerAccent, label: 'New' },
    READ: { bg: COLORS.chipBg, text: COLORS.accent, label: 'Read' },
    PREPARING: { bg: COLORS.warningBg, text: COLORS.warning, label: 'Preparing' },
    READY: { bg: COLORS.successBg, text: COLORS.success, label: 'Ready' },
    SERVED: { bg: COLORS.chipBg, text: COLORS.muted, label: 'Served' },
  };
  const dispatch = useDispatch();
  // from/to both pinned to today at the CAFE (IST), matching how the API reads these params
  // — a plain toISOString() here would send the UTC day, which before 5:30 AM IST is still
  // yesterday, hiding every order taken after midnight until the morning. Generous pageSize
  // alongside it: a busy day's order count must never be silently cut off by the default
  // 20-per-page cap, since this screen's revenue/transaction totals need to be exactly
  // today's real numbers.
  const todayIso = istToday();
  // Polling deliberately slowed and stopped in the background (see useOrders' OrdersPolling
  // doc): this is the one call site that combines "every order today, full graph" with the
  // 10s live-service cadence, and it was by far the largest reader of the database — the whole
  // day's order history, six times a minute, all day, including while the tab was backgrounded.
  // A settle/void anywhere still lands here immediately via OrdersHub's ordersChanged push, so
  // this interval is only the safety net it always was on the other screens, and pull-to-refresh
  // (refetch, below) covers a cashier who wants the totals recounted right now.
  const { data, isLoading, isError, refetch } = useOrders(
    { from: todayIso, to: todayIso, pageSize: 500 },
    { refetchInterval: 60000, refetchIntervalInBackground: false },
  );
  const { data: settings } = useSettings();
  const [openOrder, setOpenOrder] = useState<ApiOrder | null>(null);
  const [printing, setPrinting] = useState(false);
  // Payment-method filter — client-side only (the backend has no such query param, and
  // this screen already pulls every one of today's paid orders in one shot). Answers
  // "how much came in via Cash today" directly instead of making someone add it up.
  const [methodFilter, setMethodFilter] = useState<'All' | 'Cash' | 'Card' | 'UPI' | 'Multiple'>('All');
  const METHOD_FILTERS: Array<'All' | 'Cash' | 'Card' | 'UPI' | 'Multiple'> = ['All', 'Cash', 'Card', 'UPI', 'Multiple'];
  const [methodPickerVisible, setMethodPickerVisible] = useState(false);

  const businessName = settings?.businessName ?? 'PrabandhOS';
  const businessAddress = settings?.address?.trim() || null;
  const receiptFooter = settings?.receiptFooter ?? 'Thank you for your visit!';

  const printOpenOrder = async () => {
    if (!openOrder) return;
    setPrinting(true);
    const result = await PrinterService.printReceipt({
      businessName,
      addressLine: businessAddress ?? undefined,
      orderNumber: openOrder.number,
      time: new Date(openOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      title: openOrder.title,
      orderTypeLabel: STATUS_STYLES[openOrder.status].label,
      guestPhone: openOrder.guestPhone ?? undefined,
      waiterName: openOrder.servedByName ?? openOrder.createdByName,
      gstNumber: settings?.gstNumber,
      licenceNumber: settings?.licenceNumber,
      logoUrl: settings?.logoUrl,
      upiVpa: settings?.upiVpa,
      amountDue: openOrder.balanceDue ?? openOrder.total,
      items: openOrder.items,
      subtotal: openOrder.subtotal,
      discountPct: openOrder.discountPct || undefined,
      discountAmount: openOrder.discountAmount || undefined,
      offerDiscountAmount: openOrder.offerDiscountAmount || undefined,
      appliedOfferTitle: openOrder.appliedOfferTitle,
      // Order doesn't store the tax rate directly — back-derive it from the taxable
      // base (subtotal minus discount) for an accurate "Tax (n%)" label on the print.
      taxRatePct: (() => {
        const taxable = openOrder.subtotal - openOrder.discountAmount;
        return taxable > 0 ? Math.round((openOrder.tax / taxable) * 1000) / 10 : 0;
      })(),
      tax: openOrder.tax,
      total: openOrder.total,
      footer: receiptFooter,
      showAddress: settings?.receiptShowAddress,
      showWaiterName: settings?.receiptShowWaiterName,
      showGuestPhone: settings?.receiptShowGuestPhone,
      showItemNotes: settings?.receiptShowItemNotes,
      showFooter: settings?.receiptShowFooter,
    });
    setPrinting(false);
    dispatch(showToast({
      message: result.message,
      icon: result.ok ? 'printer-check' : 'alert-circle-outline',
      tone: result.ok ? 'success' : 'danger',
    }));
  };

  const sendOpenOrderViaWhatsApp = async () => {
    if (!openOrder?.guestPhone) return;
    let receiptUrl: string | undefined;
    try {
      const token = await ordersApi.getReceiptToken(openOrder.id);
      receiptUrl = `${getPublicApiBaseUrl()}/public/receipt/${token}`;
    } catch {
      receiptUrl = undefined;
    }
    const url = buildWhatsAppBillUrl({
      businessName,
      orderNumber: openOrder.number,
      items: openOrder.items,
      subtotal: openOrder.subtotal,
      discountAmount: openOrder.discountAmount || undefined,
      tax: openOrder.tax,
      total: openOrder.total,
      guestPhone: openOrder.guestPhone,
      receiptUrl,
    });
    if (!url) {
      dispatch(showToast({ message: 'Need a valid 10-digit mobile number to send via WhatsApp.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    Linking.openURL(url);
  };

  // Already scoped to today by the from/to params above — no client-side date
  // filtering needed, and nothing here can be silently short of a busy day's real count.
  // Billing is a record of completed sales, not a live order-status feed (that's
  // KDS/Tables) — unpaid/in-progress orders don't belong here at all, so the whole
  // screen (list included) is paid-only, not just the revenue/count stat cards.
  const paidOrders = (data?.items ?? [])
    .filter((o) => o.paid)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // A single-tender order's paymentMethod is "Cash"/"Card"/"UPI" straight from the backend;
  // a split payment is stamped "Multiple" there too (see OrdersController.Pay) — so this is
  // a direct match, not a derived guess.
  const orders = methodFilter === 'All' ? paidOrders : paidOrders.filter((o) => (o.paymentMethod ?? 'Multiple') === methodFilter);

  const methodFilterCounts = METHOD_FILTERS.reduce<Record<string, number>>((acc, m) => {
    acc[m] = m === 'All' ? paidOrders.length : paidOrders.filter((o) => (o.paymentMethod ?? 'Multiple') === m).length;
    return acc;
  }, {});

  const todayRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const txnCount = orders.length;

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="credit-card-outline" title="Billing" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.headerBackBtn}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="credit-card-outline" size={22} color={COLORS.accent} />
          <Text style={styles.headerTitle}>Billing</Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{methodFilter === 'All' ? "TODAY'S REVENUE" : `REVENUE · ${methodFilter.toUpperCase()}`}</Text>
            {isLoading ? (
              <SkeletonBox width="70%" height={22} style={{ marginTop: 4 }} />
            ) : (
              <Text style={styles.summaryValue}>₹{todayRevenue.toFixed(2)}</Text>
            )}
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>TRANSACTIONS</Text>
            {isLoading ? (
              <SkeletonBox width="40%" height={22} style={{ marginTop: 4 }} />
            ) : (
              <Text style={styles.summaryValue}>{txnCount}</Text>
            )}
          </View>
        </View>

        <CategoryFilterTrigger
          label={`${methodFilter} · ${methodFilterCounts[methodFilter]}`}
          onPress={() => setMethodPickerVisible(true)}
        />
        <CategoryFilterModal
          visible={methodPickerVisible}
          onClose={() => setMethodPickerVisible(false)}
          title="Filter by Payment Method"
          categories={METHOD_FILTERS}
          activeCategory={methodFilter}
          counts={methodFilterCounts}
          onSelect={(label) => setMethodFilter(label as 'All' | 'Cash' | 'Card' | 'UPI' | 'Multiple')}
        />

        <Text style={styles.sectionTitle}>Recent Transactions</Text>

        {isError && orders.length === 0 ? (
          <ErrorState
            title="Couldn't load transactions"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : (
          <>
            {isLoading && <SkeletonList rows={6} style={{ marginTop: 8 }} />}

            {!isLoading && orders.length === 0 && (
              <View style={styles.emptyBox}>
                <Icon name="receipt" size={32} color={COLORS.muted} />
                <Text style={styles.emptyText}>No transactions yet. Fire an order from POS to see it here.</Text>
              </View>
            )}

            {orders.map((order) => {
              // Every row here is already a settled sale (the list is paid-only — see
              // `paidOrders` above), so the kitchen-stage `order.status` ("Served") is
              // redundant/misleading as the headline badge; what's actually useful at a
              // glance in Billing is HOW it was paid.
              const method = order.paymentMethod ?? 'Multiple';
              const methodIcon = method === 'Cash' ? 'cash' : method === 'Card' ? 'credit-card-outline' : method === 'UPI' ? 'qrcode-scan' : 'call-split';
              return (
                <TouchableOpacity key={order.id} style={styles.txnCard} activeOpacity={0.85} onPress={() => setOpenOrder(order)}>
                  <View style={styles.txnIcon}>
                    <Icon name="receipt" size={18} color={COLORS.heading} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txnTitle}>
                      {order.number} · {order.title}
                    </Text>
                    <Text style={styles.txnMeta}>
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
                      {/* Cancelled lines are off the bill, so they're off this count too —
                          otherwise the card promises more items than the slip behind it
                          itemises (and than the total charged). Same rule as the slip below. */}
                      {order.items.reduce((n, i) => (i.voided ? n : n + i.qty), 0)} items
                      {!!(order.servedByName ?? order.createdByName) && ` · ${order.servedByName ?? order.createdByName}`}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={styles.txnTotal}>₹{order.total.toFixed(2)}</Text>
                    <View style={[styles.statusPill, styles.paymentPill]}>
                      <Icon name={methodIcon} size={11} color={COLORS.success} />
                      <Text style={[styles.statusPillText, { color: COLORS.success }]}>{method}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* ---------- Reopened receipt modal ---------- */}
      <Modal visible={!!openOrder} transparent animationType="fade" onRequestClose={() => setOpenOrder(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {openOrder && (
              <>
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
                  <View style={styles.slip}>
                    <Text style={styles.slipBrand}>{businessName}</Text>
                    {!!businessAddress && <Text style={styles.slipAddr}>{businessAddress}</Text>}
                    <View style={styles.slipDash} />

                    <View style={styles.slipMetaRow}>
                      <Text style={styles.slipMeta}>Order {openOrder.number}</Text>
                      <Text style={styles.slipMeta}>
                        {new Date(openOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={styles.slipMetaRow}>
                      <Text style={styles.slipMeta}>{openOrder.title}</Text>
                      {/* Every order reachable from Billing is already paid (see `paidOrders`
                          above) — the kitchen-stage status ("Served") is redundant/misleading
                          here; "Paid" reflects what this screen actually records. */}
                      <Text style={styles.slipMeta}>{openOrder.paid ? 'Paid' : STATUS_STYLES[openOrder.status].label}</Text>
                    </View>
                    {!!(openOrder.servedByName ?? openOrder.createdByName) && (
                      <View style={styles.slipMetaRow}>
                        <Text style={styles.slipMeta}>Waiter</Text>
                        <Text style={styles.slipMeta}>{openOrder.servedByName ?? openOrder.createdByName}</Text>
                      </View>
                    )}
                    <View style={styles.slipDash} />

                    {/* Cancelled lines are off the bill — the totals below already exclude them
                        (the server sums live lines only), so listing them makes this slip
                        itemise to more than the Subtotal printed under it. Same rule the
                        printed/PDF/WhatsApp bills follow, see PrintableReceiptItem.voided. */}
                    {openOrder.items.filter((i) => !i.voided).map((item, idx) => (
                      <View key={idx} style={styles.slipItemBlock}>
                        <View style={styles.slipItemRow}>
                          <Text style={styles.slipItemName}>
                            {item.qty}× {item.name}
                          </Text>
                          <Text style={styles.slipItemPrice}>₹{(item.price * item.qty).toFixed(2)}</Text>
                        </View>
                        {!!item.modifier && <Text style={styles.slipItemMod}>{item.modifier}</Text>}
                      </View>
                    ))}

                    <View style={styles.slipDash} />
                    <View style={styles.slipTotalRow}>
                      <Text style={styles.slipTotalLabel}>Subtotal</Text>
                      <Text style={styles.slipTotalVal}>₹{openOrder.subtotal.toFixed(2)}</Text>
                    </View>
                    {openOrder.discountAmount > 0 && (
                      <View style={styles.slipTotalRow}>
                        <Text style={[styles.slipTotalLabel, styles.slipPositive]}>Discount{openOrder.discountPct > 0 ? ` (${openOrder.discountPct}%)` : ''}</Text>
                        <Text style={[styles.slipTotalVal, styles.slipPositive]}>−₹{openOrder.discountAmount.toFixed(2)}</Text>
                      </View>
                    )}
                    {openOrder.billDiscountAmount > 0 && (
                      <View style={styles.slipTotalRow}>
                        <Text style={[styles.slipTotalLabel, styles.slipPositive]}>Bill Discount</Text>
                        <Text style={[styles.slipTotalVal, styles.slipPositive]}>−₹{openOrder.billDiscountAmount.toFixed(2)}</Text>
                      </View>
                    )}
                    {openOrder.couponDiscountAmount > 0 && (
                      <View style={styles.slipTotalRow}>
                        <Text style={[styles.slipTotalLabel, styles.slipPositive]}>Coupon{openOrder.couponCode ? ` (${openOrder.couponCode})` : ''}</Text>
                        <Text style={[styles.slipTotalVal, styles.slipPositive]}>−₹{openOrder.couponDiscountAmount.toFixed(2)}</Text>
                      </View>
                    )}
                    {(openOrder.offerDiscountAmount ?? 0) > 0 && (
                      <View style={styles.slipTotalRow}>
                        <Text style={[styles.slipTotalLabel, styles.slipPositive]} numberOfLines={1}>{openOrder.appliedOfferTitle?.trim() || 'Offer'}</Text>
                        <Text style={[styles.slipTotalVal, styles.slipPositive]}>−₹{(openOrder.offerDiscountAmount ?? 0).toFixed(2)}</Text>
                      </View>
                    )}
                    {openOrder.giftCardAmountApplied > 0 && (
                      <View style={styles.slipTotalRow}>
                        <Text style={[styles.slipTotalLabel, styles.slipPositive]}>Gift Card{openOrder.giftCardCode ? ` (${openOrder.giftCardCode})` : ''}</Text>
                        <Text style={[styles.slipTotalVal, styles.slipPositive]}>−₹{openOrder.giftCardAmountApplied.toFixed(2)}</Text>
                      </View>
                    )}
                    {(openOrder.loyaltyDiscountAmount ?? 0) > 0 && (
                      <View style={styles.slipTotalRow}>
                        <Text style={[styles.slipTotalLabel, styles.slipPositive]}>Loyalty Points{openOrder.loyaltyPointsRedeemed ? ` (${openOrder.loyaltyPointsRedeemed})` : ''}</Text>
                        <Text style={[styles.slipTotalVal, styles.slipPositive]}>−₹{(openOrder.loyaltyDiscountAmount ?? 0).toFixed(2)}</Text>
                      </View>
                    )}
                    {/* Shown as the two halves the printed invoice states separately, so what
                        the cashier reads back matches the slip the customer is handed. Falls
                        back to a single row when no GST is charged at all. */}
                    {openOrder.tax > 0 ? (
                      <>
                        <View style={styles.slipTotalRow}>
                          <Text style={styles.slipTotalLabel}>CGST</Text>
                          <Text style={styles.slipTotalVal}>₹{splitGst(openOrder.tax).cgst.toFixed(2)}</Text>
                        </View>
                        <View style={styles.slipTotalRow}>
                          <Text style={styles.slipTotalLabel}>SGST</Text>
                          <Text style={styles.slipTotalVal}>₹{splitGst(openOrder.tax).sgst.toFixed(2)}</Text>
                        </View>
                      </>
                    ) : (
                      <View style={styles.slipTotalRow}>
                        <Text style={styles.slipTotalLabel}>Tax</Text>
                        <Text style={styles.slipTotalVal}>₹{openOrder.tax.toFixed(2)}</Text>
                      </View>
                    )}
                    {(openOrder.serviceChargeAmount ?? 0) > 0 && (
                      <View style={styles.slipTotalRow}>
                        <Text style={styles.slipTotalLabel}>Service Charge</Text>
                        <Text style={styles.slipTotalVal}>₹{(openOrder.serviceChargeAmount ?? 0).toFixed(2)}</Text>
                      </View>
                    )}
                    {(openOrder.packingChargeAmount ?? 0) > 0 && (
                      <View style={styles.slipTotalRow}>
                        <Text style={styles.slipTotalLabel}>Packing Charge</Text>
                        <Text style={styles.slipTotalVal}>₹{(openOrder.packingChargeAmount ?? 0).toFixed(2)}</Text>
                      </View>
                    )}
                    {(openOrder.deliveryChargeAmount ?? 0) > 0 && (
                      <View style={styles.slipTotalRow}>
                        <Text style={styles.slipTotalLabel}>Delivery Charge</Text>
                        <Text style={styles.slipTotalVal}>₹{(openOrder.deliveryChargeAmount ?? 0).toFixed(2)}</Text>
                      </View>
                    )}
                    {(openOrder.tipAmount ?? 0) > 0 && (
                      <View style={styles.slipTotalRow}>
                        <Text style={styles.slipTotalLabel}>Tip</Text>
                        <Text style={styles.slipTotalVal}>₹{(openOrder.tipAmount ?? 0).toFixed(2)}</Text>
                      </View>
                    )}
                    {(openOrder.roundOffAmount ?? 0) !== 0 && (
                      <View style={styles.slipTotalRow}>
                        <Text style={styles.slipTotalLabel}>Round Off</Text>
                        <Text style={styles.slipTotalVal}>{(openOrder.roundOffAmount ?? 0) > 0 ? '+' : '−'}₹{Math.abs(openOrder.roundOffAmount ?? 0).toFixed(2)}</Text>
                      </View>
                    )}
                    <View style={styles.slipTotalRow}>
                      <Text style={styles.slipGrandLabel}>TOTAL</Text>
                      <Text style={styles.slipGrandVal}>₹{openOrder.total.toFixed(2)}</Text>
                    </View>

                    <View style={styles.slipDash} />
                    <View style={styles.slipTotalRow}>
                      <Text style={styles.slipTotalLabel}>Paid Via</Text>
                      <Text style={styles.slipTotalVal}>
                        {openOrder.payments.length > 1
                          ? openOrder.payments.map((p) => `${p.method} ₹${p.amount.toFixed(2)}`).join(' + ')
                          : openOrder.paymentMethod ?? '—'}
                      </Text>
                    </View>

                    <View style={styles.slipDash} />
                    <Text style={styles.slipThanks}>{receiptFooter}</Text>
                  </View>
                </ScrollView>

                {/* Only once actually paid — same rule as the Tables "Mark Bill Paid" flow: the bill goes out after payment, not as an alternative to it. */}
                {openOrder.paid && !!openOrder.guestPhone && (
                  <TouchableOpacity style={styles.whatsappBtn} onPress={sendOpenOrderViaWhatsApp} activeOpacity={0.85}>
                    <Icon name="whatsapp" size={18} color="#FFFFFF" />
                    <Text style={styles.whatsappBtnText}>Send via WhatsApp</Text>
                  </TouchableOpacity>
                )}

                <View style={styles.receiptActions}>
                  <TouchableOpacity style={styles.receiptSecondary} onPress={printOpenOrder} disabled={printing}>
                    {printing ? (
                      <ActivityIndicator size="small" color={COLORS.heading} />
                    ) : (
                      <Icon name="printer-outline" size={18} color={COLORS.heading} />
                    )}
                    <Text style={styles.receiptSecondaryText}>{printing ? 'Printing…' : 'Print'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.receiptPrimary} onPress={() => setOpenOrder(null)}>
                    <Icon name="close" size={18} color="#FFFFFF" />
                    <Text style={styles.receiptPrimaryText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7 : 7.5, paddingHorizontal: isDesktopWeb ? 12 : 12, paddingTop: isDesktopWeb ? 9 : 9, paddingBottom: isDesktopWeb ? 9 : 9 },
  headerBackBtn: {},
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  summaryRow: { flexDirection: 'row', gap: isDesktopWeb ? 8 : 9, paddingHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 14 : 15 },
  summaryCard: { flex: 1, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 12 : 12 },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginBottom: isDesktopWeb ? 6 : 6 },
  summaryValue: { fontSize: isDesktopWeb ? 22 : 12, fontWeight: '800', color: COLORS.heading },
  sectionTitle: { fontSize: isDesktopWeb ? 18 : 14, fontWeight: 'bold', color: COLORS.heading, paddingHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 8 : 9 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 42 : 45, gap: isDesktopWeb ? 7 : 7.5, paddingHorizontal: isDesktopWeb ? 28 : 30 },
  emptyText: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, textAlign: 'center' },
  txnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 8 : 9,
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 16 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 10.5,
    marginBottom: isDesktopWeb ? 8 : 9,
  },
  txnIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.aiCardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnTitle: { fontSize: 14, fontWeight: '700', color: COLORS.heading },
  txnMeta: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  txnTotal: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '800', color: COLORS.heading },
  statusPill: { paddingHorizontal: isDesktopWeb ? 7 : 6.75, paddingVertical: isDesktopWeb ? 2 : 2.25, borderRadius: 8 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  paymentPill: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 3 : 3, backgroundColor: COLORS.successBg },
  // --- Receipt modal (shared visual language with POS receipt) ---
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isDesktopWeb ? 18 : 18,
  },
  modalSheet: {
    width: '100%',
    // Cap the width so on desktop web the card floats centered instead of stretching
    // edge-to-edge (hugging left/right), and cap the height so a long receipt scrolls
    // inside the card rather than growing down to touch the bottom — matches the POS
    // receipt modal (receiptSheet) exactly.
    maxWidth: 760,
    maxHeight: '94%',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: isDesktopWeb ? 10 : 10.5,
    overflow: 'hidden',
  },
  slip: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 13 : 13.5 },
  slipBrand: { fontSize: 22, fontWeight: '800', color: COLORS.heading, textAlign: 'center', letterSpacing: 1 },
  slipAddr: { fontSize: 11, color: COLORS.muted, textAlign: 'center', marginTop: isDesktopWeb ? 2 : 1.5 },
  slipDash: { borderBottomWidth: 1, borderStyle: 'dashed', borderColor: COLORS.divider, marginVertical: isDesktopWeb ? 8 : 9 },
  slipMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: isDesktopWeb ? 3 : 3 },
  slipMeta: { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
  slipItemBlock: { marginBottom: isDesktopWeb ? 6 : 6 },
  slipItemRow: { flexDirection: 'row', justifyContent: 'space-between' },
  slipItemName: { fontSize: 12, fontWeight: '600', color: COLORS.heading, flex: 1 },
  slipItemPrice: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  slipItemMod: { fontSize: 12, fontStyle: 'italic', color: COLORS.muted, marginTop: isDesktopWeb ? 1 : 0.75 },
  slipTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: isDesktopWeb ? 2 : 1.5 },
  slipTotalLabel: { fontSize: 12, color: COLORS.muted },
  slipTotalVal: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  slipPositive: { color: COLORS.success },
  slipGrandLabel: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: '800', color: COLORS.heading, marginTop: isDesktopWeb ? 3 : 3 },
  slipGrandVal: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: '800', color: COLORS.accent, marginTop: isDesktopWeb ? 3 : 3 },
  slipThanks: { fontSize: isDesktopWeb ? 13 : 12, fontStyle: 'italic', color: COLORS.muted, textAlign: 'center' },
  whatsappBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 6,
    backgroundColor: '#25D366',
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 10 : 10.5,
    marginTop: isDesktopWeb ? 12 : 12,
  },
  whatsappBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  receiptActions: { flexDirection: 'row', gap: 9, marginTop: 9 },
  receiptSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingVertical: 10.5,
  },
  receiptSecondaryText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  receiptPrimary: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.button,
    borderRadius: 8,
    paddingVertical: 10.5,
  },
  receiptPrimaryText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
