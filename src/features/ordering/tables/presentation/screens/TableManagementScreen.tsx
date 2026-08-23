import React, { useMemo, useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Linking, TextInput, Alert, Dimensions } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { showToast } from '../../../../../core/store/uiSlice';
import { selectTableForOrder, resumeOrder } from '../../../../../core/store/tablesSlice';
import { canManageTables, isOwnerOrManager } from '../../../../../core/auth/permissions';
import { useTables, useCreateTable, useUpdateTable, useDeleteTable, useRevokeSession, useMergeTable, useUnmergeTable } from '../../../../../core/api/hooks/useTables';
import {
  useOrders,
  useOrder,
  usePayOrder,
  useFireOrder,
  useCancelOrder,
  useShiftTable,
  useServeItem,
} from '../../../../../core/api/hooks/useOrders';
import { OrderItem as ApiOrderItem, ApiOrder } from '../../../../../core/api/ordersApi';
import { useSettings } from '../../../../../core/api/hooks/useSettings';
import { ApiTable } from '../../../../../core/api/tablesApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { buildWhatsAppBillUrl } from '../../../../../core/utils/whatsappShare';
import { ordersApi } from '../../../../../core/api/ordersApi';
import { getPublicApiBaseUrl } from '../../../../../core/config/env';
import { PrinterService } from '../../../../../core/printing/PrinterService';
import { markKotPrinted } from '../../../../../core/printing/printedKots';
import { SkeletonGrid } from '../../../../../shared/components/atoms/Skeleton';
import { Tooltip } from '../../../../../shared/components/atoms/Tooltip';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { GlobalSearchTrigger } from '../../../../../shared/components/search/GlobalSearchTrigger';
import { CategoryFilterModal, CategoryFilterTrigger } from '../../../../../shared/components/molecules/CategoryFilterModal';
import { OrderBillActions, PaymentSplit } from '../../../../../shared/components/billing/OrderBillActions';
import { WhatsAppTrackingQr } from '../../../../../shared/components/billing/WhatsAppTrackingQr';
import { PaymentMethod } from '../../../../../shared/components/billing/PaymentMethodPicker';
import { ItemQtyStepper } from '../../../../../shared/components/billing/ItemQtyStepper';
import { useItemQtyEditor, QtyReasonPrompt } from '../../../../../shared/components/billing/useItemQtyEditor';
import { useItemVoidPrompt, VoidReasonPrompt } from '../../../../../shared/components/billing/useItemVoidPrompt';
import { useItemPriceEditor, ItemRateButton, ItemRatePrompt } from '../../../../../shared/components/billing/useItemPriceEditor';
import { equalShares, paidShareCount } from '../../../../../core/billing/splitBill';

import { INPUT_BORDER_WIDTH, modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

/** Label for a single fire round's own status, shown as its group header in the
 * inKitchen item list — distinct from the order-wide rollup status shown elsewhere. */
const BATCH_STATUS_LABEL: Record<string, string> = {
  SERVED: 'Served',
  NEW: 'New',
  PREPARING: 'Preparing',
  READY: 'Ready to Serve',
};

const ITEM_STATUS_COLOR: Record<string, 'dangerAccent' | 'warning' | 'success'> = {
  NEW: 'dangerAccent',
  PREPARING: 'warning',
  READY: 'success',
};

/** Occupied ÷ total tables, no AI involved — just a threshold on the real percentage. */
const DINING_STATUS_THRESHOLDS = { busy: 70, moderate: 30 };

/** The bill number to show for an occupied table. Prefers what the server sent — that's the
 * cafe's own counter (ApiTable.orderNumber). The "#{1000 + id}" fallback is only for an API
 * build deployed before per-tenant numbering, where the tile would otherwise show nothing;
 * it reproduces exactly what that older server would have printed on the matching bill. */
const tableOrderLabel = (table: Pick<ApiTable, 'orderId' | 'orderNumber'>) =>
  table.orderNumber ?? (table.orderId != null ? `#${1000 + table.orderId}` : '—');

export const TableManagementScreen = ({ navigation }: any) => {
  const dispatch = useDispatch();
  const COLORS = useThemeColors();
  const route = useRoute();
  // This screen is mounted two ways: as the "Orders" bottom tab (no back —
  // it's a base destination) and pushed as "Tables" from elsewhere (needs
  // back). navigation.canGoBack() isn't reliable here since it also reflects
  // the *parent* stack's history (e.g. the auth flow before MainTabs), which
  // made a back arrow appear on the tab even though there's nothing to go
  // back to within Orders itself.
  const showBackButton = route.name !== 'Orders';
  const { isDesktopWeb, isWideLayout, isTablet } = useResponsive();
  // isWideLayout (not isDesktopWeb) — this needs to apply on a native tablet APK too,
  // not just a desktop browser tab. 0.85 = one readable step down; every fontSize on
  // this screen runs through it via makeStyles' fs() helper, uniformly, so the existing
  // size/weight hierarchy (headings bigger, or bold when a pair is equal) is preserved —
  // it's a ratio, and a uniform multiplier can't change a ratio's ordering.
  const styles = makeStyles(COLORS, isWideLayout ? 0.85 : 1, isDesktopWeb, isTablet);
  const insets = useSafeAreaInsets();
  const STATUS_STYLES = {
    empty: { bg: COLORS.cardAlt, text: COLORS.muted },
    occupied: { bg: COLORS.heading, text: '#FFFFFF' },
  };
  // Occupied tile's top-left badge only — the tile itself stays COLORS.heading for every
  // occupied table (unchanged). Same light-chip-on-dark-tile treatment the Empty badge
  // already uses (successBg + success), and the same accent/warning/success convention
  // KDS's STATUS_COLOR uses for New/Preparing/Ready, so this reads as the same status
  // language as the rest of the app rather than a new one.
  const ORDER_STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
    NEW: { label: 'New', bg: COLORS.proTipBg, text: COLORS.accent },
    READ: { label: 'New', bg: COLORS.proTipBg, text: COLORS.accent },
    PREPARING: { label: 'Preparing', bg: COLORS.warningBg, text: COLORS.warning },
    READY: { label: 'Ready', bg: COLORS.successBg, text: COLORS.success },
    SERVED: { label: 'Served', bg: 'rgba(255,255,255,0.18)', text: '#FFFFFF' },
  };
  const occupiedBadge = (orderStatus: string | null) =>
    ORDER_STATUS_BADGE[orderStatus ?? ''] ?? { label: 'Occupied', bg: 'rgba(255,255,255,0.18)', text: '#FFFFFF' };
  const diningStatusFor = (occupancyPct: number): { label: string; bg: string; text: string } => {
    if (occupancyPct >= DINING_STATUS_THRESHOLDS.busy) return { label: 'Busy', bg: COLORS.dangerBg, text: COLORS.dangerAccent };
    if (occupancyPct >= DINING_STATUS_THRESHOLDS.moderate) return { label: 'Moderate', bg: COLORS.warningBg, text: COLORS.warning };
    return { label: 'Available', bg: COLORS.successBg, text: COLORS.success };
  };
  const activeBranchId = useSelector((s: any) => s.branch.activeBranchId);
  const { data: allTables = [], isLoading, isError, refetch } = useTables();
  const { data: settings } = useSettings();
  const { data: ordersPage } = useOrders({ activeOnly: true, branchId: activeBranchId });
  // activeOnly also returns TAKEAWAY/DELIVERY/QSR tickets (see OrdersController.List) —
  // those have no table, so counting them here would inflate this screen's "Active Orders"
  // stat above what the table grid below actually shows occupied.
  const activeOrders = (ordersPage?.items ?? []).filter((o) => o.tableCode);
  const role = useSelector((s: any) => s.auth.user?.role);
  const createTable = useCreateTable();
  const updateTable = useUpdateTable();
  const deleteTable = useDeleteTable();
  const payOrder = usePayOrder();
  const fireOrder = useFireOrder();
  const cancelOrder = useCancelOrder();
  const serveItem = useServeItem();
  const revokeSession = useRevokeSession();
  const shiftTable = useShiftTable();
  const mergeTable = useMergeTable();
  const unmergeTable = useUnmergeTable();
  const canCancelOrder = isOwnerOrManager(role);

  // Grid "picker mode" — set by tapping Shift Table (in the occupied modal) or Merge (on an
  // empty tile). While either is set, tapping any OTHER tile in the grid completes that
  // action instead of the tile's normal tap behavior (open the occupied modal / start a new
  // order) — see handleTilePress.
  const [shiftingFrom, setShiftingFrom] = useState<ApiTable | null>(null);
  const [mergingFrom, setMergingFrom] = useState<ApiTable | null>(null);
  const pickerActive = shiftingFrom ?? mergingFrom;


  // Zones are derived from whatever tables actually exist on the backend —
  // no hardcoded zone list that could drift from reality.
  const zones = useMemo(() => Array.from(new Set(allTables.map((t) => t.zone))), [allTables]);
  const [zone, setZone] = useState<string | null>(null);
  const activeZone = zone ?? zones[0] ?? 'Indoor';

  const [capacityFilter, setCapacityFilter] = useState('All Sizes');
  const [statusFilter, setStatusFilter] = useState('All');
  const [capacityPickerVisible, setCapacityPickerVisible] = useState(false);
  const [statusPickerVisible, setStatusPickerVisible] = useState(false);

  const [occupiedModal, setOccupiedModal] = useState<ApiTable | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  // The table currently being edited (rename / seats / delete), or null. Held as the whole
  // ApiTable rather than an id so the modal can show what it started from even after a
  // refetch drops the row — e.g. the delete that just succeeded.
  const [editingTable, setEditingTable] = useState<ApiTable | null>(null);
  const [editName, setEditName] = useState('');
  const [editSeats, setEditSeats] = useState(4);
  // Second stage of the delete: the modal swaps its actions for a confirm strip rather than
  // firing on the first tap. Deleting a table is not undoable and the button sits next to
  // Save, so a mis-tap has to cost a second deliberate one.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [newSeats, setNewSeats] = useState(4);
  // The new table's display name (its code — what every order records as TableCode, and what
  // the tile shows). Optional: left blank the server auto-numbers the next "T{n}", which is
  // exactly what this screen did before naming was offered.
  const [newTableName, setNewTableName] = useState('');
  // Zones only ever exist as a byproduct of tables that already have one — there's
  // no dedicated "create a floor" flow, so a genuinely new floor (e.g. a cafe's
  // first table on "Rooftop") had no way to get created. This mode swaps the
  // "Add Table to {activeZone}" target for a typed-in new zone name instead.
  const [newZoneMode, setNewZoneMode] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  // Full order (items/subtotal/tax/guestPhone) for whichever occupied table's
  // modal is open — the tables list only carries the total, not line items.
  const { data: occupiedOrder } = useOrder(occupiedModal?.orderId ?? null);

  // Discount/coupon/gift-card/loyalty/charges all now live inside OrderBillActions
  // itself (self-contained there) — no local state needed for them here anymore.
  const [printingBill, setPrintingBill] = useState(false);
  // Separate from printingBill — Print Bill and Print KOT are two different printers'
  // worth of work and can be tapped independently, so one spinner can't cover both.
  const [printingKot, setPrintingKot] = useState(false);
  // Split Bill. Each share is collected as a real partial payment against this one order
  // (ordersApi.pay with allowPartial — see OrdersController.Pay), which is deliberately NOT
  // the same thing as issuing separate bills: the invoice stays single, it just accumulates
  // several tenders, so a guest paying by card and another by UPI don't produce two GST
  // invoice numbers. The API settles the order by itself once the running total covers the
  // bill, so the last share needs no special "and now close it" step.
  const [splitVisible, setSplitVisible] = useState(false);
  const [splitWays, setSplitWays] = useState(2);
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [splitMethod, setSplitMethod] = useState<PaymentMethod>('Cash');
  const [customAmount, setCustomAmount] = useState('');
  const [collecting, setCollecting] = useState(false);

  // Quantity corrections on every item row below — see useItemQtyEditor for the fired-line rules.
  const qtyEditor = useItemQtyEditor(occupiedOrder?.id ?? null);
  // Per-line rate overrides, this order only — see useItemPriceEditor. Manager/Owner only, so the
  // button it renders is simply absent for everyone else.
  const priceEditor = useItemPriceEditor(occupiedOrder?.id ?? null);
  // Taking a line off the bill, and the reason prompt that anything already cooked or served
  // has to go through — see useItemVoidPrompt for the rules, which are the server's.
  const voidPrompt = useItemVoidPrompt(occupiedOrder?.id ?? null, 'void');

  const unfiredCount = occupiedOrder?.items.filter((i) => i.fireBatch === 0).length ?? 0;
  // Item list (open/inKitchen view) only makes sense while there's still kitchen work to
  // track — once Served there's nothing left to show there, just the bill. Payment itself
  // is intentionally NOT gated on Served (see OrdersController.Pay) — a cafe may collect
  // payment up front, QSR-counter style, well before anything's cooked or served; the table
  // only frees up once it's BOTH served and paid (see the activeOnly query).
  const isOpenOrder = !!occupiedOrder && occupiedOrder.items.every((i) => i.fireBatch === 0);
  const hasFiredAnything = !!occupiedOrder && !isOpenOrder;
  // Everything the splitter shows is derived from the order itself, never from local state:
  // amountPaid/balanceDue come back off every pay call, so the paid ticks stay right after a
  // refresh, and after a second device collects a share on the same table.
  const splitTotal = occupiedOrder?.total ?? 0;
  const splitPaid = occupiedOrder?.amountPaid ?? 0;
  const splitRemaining = occupiedOrder?.balanceDue ?? splitTotal;
  const splitShares = equalShares(splitTotal, splitWays);
  const splitPaidCount = paidShareCount(splitShares, splitPaid);
  // The share this tap collects. Front to back — see paidShareCount for why the order of
  // equal shares doesn't matter.
  const nextShare = splitMode === 'equal' ? splitShares[splitPaidCount] : Number(customAmount);
  const canCollect =
    !collecting &&
    Number.isFinite(nextShare) &&
    nextShare > 0 &&
    // Never offer a tender the API would bounce for overshooting the balance (it allows
    // 0.01 of rounding slack, and so does this).
    nextShare - splitRemaining <= 0.01;

  const canAdd = canManageTables(role);

  const TABLES = allTables.filter((t) => t.zone === activeZone);

  // Capacity options are derived from whichever seat counts actually exist in this
  // zone — same reasoning as `zones` above, no hardcoded sizes that could drift.
  const capacityOptions = useMemo(
    () => ['All Sizes', ...Array.from(new Set(TABLES.map((t) => t.seats))).sort((a, b) => a - b).map((s) => `${s} Seater`)],
    [TABLES],
  );
  const capacityCounts = useMemo(() => {
    const counts: Record<string, number> = { 'All Sizes': TABLES.length };
    for (const opt of capacityOptions) {
      if (opt === 'All Sizes') continue;
      const seats = parseInt(opt, 10);
      counts[opt] = TABLES.filter((t) => t.seats === seats).length;
    }
    return counts;
  }, [TABLES, capacityOptions]);
  const statusOptions = ['All', 'Available', 'Occupied'];
  const statusCounts = useMemo(() => ({
    All: TABLES.length,
    Available: TABLES.filter((t) => t.status === 'empty').length,
    Occupied: TABLES.filter((t) => t.status === 'occupied').length,
  }), [TABLES]);
  // Occupied tables sort to the front of the grid — those are the ones staff act on
  // (settle, shift, add items), so they shouldn't be hunted for among the free tiles.
  // Sort is stable, so within each group the zone's own table order is preserved.
  const FILTERED_TABLES = useMemo(() => TABLES.filter((t) => {
    const matchesCapacity = capacityFilter === 'All Sizes' || t.seats === parseInt(capacityFilter, 10);
    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Available' && t.status === 'empty') ||
      (statusFilter === 'Occupied' && t.status === 'occupied');
    return matchesCapacity && matchesStatus;
  }).sort((a, b) => Number(b.status === 'occupied') - Number(a.status === 'occupied')),
  [TABLES, capacityFilter, statusFilter]);

  const occupiedCount = allTables.filter((t) => t.status === 'occupied').length;
  const freeTableCount = allTables.filter((t) => t.status === 'empty').length;
  const occupancyPct = allTables.length ? Math.round((occupiedCount / allTables.length) * 100) : 0;
  const activeOrderCount = activeOrders.length;
  const diningStatus = diningStatusFor(occupancyPct);

  const navigateToPOS = () => {
    try {
      navigation.navigate('MainTabs', { screen: 'POS' });
    } catch {
      navigation.navigate('POS');
    }
  };

  const handleOpenCheck = (table: ApiTable) => {
    dispatch(selectTableForOrder(table.code));
    navigateToPOS();
  };

  // "Add Items" on an active table: hand off to the POS in resume/append mode, loaded
  // with this table's existing open order — POS is the single order-entry interface.
  const handleAddItemsViaPos = () => {
    if (occupiedModal?.orderId == null) return;
    dispatch(resumeOrder({ orderId: occupiedModal.orderId, tableCode: occupiedModal.code }));
    closeOccupiedModal();
    navigateToPOS();
  };

  const handleShiftTargetPress = (target: ApiTable) => {
    if (!shiftingFrom || target.status !== 'empty' || target.id === shiftingFrom.id || shiftingFrom.orderId == null) return;
    shiftTable.mutate(
      { id: shiftingFrom.orderId, newTableCode: target.code },
      {
        onSuccess: () => dispatch(showToast({ message: `Order moved from ${shiftingFrom.code} to ${target.code}.`, icon: 'table-furniture', tone: 'success' })),
        onError: (err) => dispatch(showToast({ message: getApiErrorMessage(err, 'Could not shift table'), icon: 'alert-circle-outline', tone: 'danger' })),
      },
    );
    setShiftingFrom(null);
  };

  const handleMergeTargetPress = (target: ApiTable) => {
    if (!mergingFrom || target.status !== 'empty' || target.id === mergingFrom.id) return;
    mergeTable.mutate(
      { id: mergingFrom.id, targetHostTableId: target.id },
      {
        onSuccess: () => dispatch(showToast({ message: `${mergingFrom.code} merged into ${target.code}.`, icon: 'call-merge', tone: 'success' })),
        onError: (err) => dispatch(showToast({ message: getApiErrorMessage(err, 'Could not merge tables'), icon: 'alert-circle-outline', tone: 'danger' })),
      },
    );
    setMergingFrom(null);
  };

  // Undoes every guest folded into this host in one tap — a partial split (only some of
  // several merged tables) just means re-merging whichever ones should stay combined.
  const handleUnmergeAll = async (host: ApiTable) => {
    // Falls back to [] — an older/not-yet-updated API build won't send this field at all.
    const guests = host.mergedWith ?? [];
    try {
      await Promise.all(guests.map((g) => unmergeTable.mutateAsync(g.id)));
      dispatch(showToast({ message: `${host.code} split back into ${guests.length + 1} tables.`, icon: 'call-split', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not unmerge'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleTilePress = (table: ApiTable) => {
    if (shiftingFrom) return handleShiftTargetPress(table);
    if (mergingFrom) return handleMergeTargetPress(table);
    if (table.status === 'occupied') {
      setOccupiedModal(table);
    } else {
      handleOpenCheck(table);
    }
  };

  const handleMarkPaid = async (payments: PaymentSplit[], allowPartial?: boolean, andThen?: 'print' | 'whatsapp', phoneOverride?: string, guest?: { name: string; phone: string }, unfiredItems?: 'keep') => {
    if (!occupiedModal?.orderId) {
      setOccupiedModal(null);
      return;
    }
    try {
      // guestName/guestPhone are only present on a settle carrying a Due (udhaar) leg — the
      // server needs them to open the customer's khata and rejects the settle without.
      // unfiredItems likewise: only set when the cashier chose to bill a never-fired line
      // anyway, and the server rejects that settle without it (see PayOptions.unfiredItems).
      await payOrder.mutateAsync({ id: occupiedModal.orderId, splits: payments, allowPartial, guestName: guest?.name, guestPhone: guest?.phone, unfiredItems });
      // Deliberately don't close the modal here — it re-renders in its "paid"
      // state (see occupiedOrder?.paid below) so the WhatsApp option can show
      // up as the next step. "Done"/"Close" is what dismisses it now.
      // Chained straight off the settle tap (see OrderBillActions' split-button menu) —
      // neither of these depends on order.paid/payments having refreshed yet, they just
      // read the bill's items/prices, which settling never changes.
      if (andThen === 'print') await handlePrintBill();
      else if (andThen === 'whatsapp') await sendBillViaWhatsApp(phoneOverride);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not settle bill'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  /**
   * Collects one share. allowPartial is always on: the API treats the final share (the one
   * that closes the balance) as a real settle regardless, flipping the order to Paid — so
   * there's no separate "settle the last one" branch to get wrong here.
   */
  const collectShare = async () => {
    if (!occupiedModal?.orderId || !canCollect) return;
    // Send at most the outstanding balance. A custom amount typed as slightly over, or an
    // equal share whose last paisa drifted, would otherwise be rejected outright instead of
    // simply closing the bill.
    const amount = Math.round(Math.min(nextShare, splitRemaining) * 100) / 100;
    try {
      setCollecting(true);
      await payOrder.mutateAsync({
        id: occupiedModal.orderId,
        splits: [{ method: splitMethod, amount }],
        allowPartial: true,
      });
      setCustomAmount('');
      dispatch(showToast({ message: `₹${amount.toFixed(2)} collected by ${splitMethod}.`, icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not collect this share'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setCollecting(false);
    }
  };

  // Customer-facing bill — items + prices + total. Can be printed at any point once the
  // order's been fired, independent of payment (print-then-pay or pay-then-print both work).
  const handlePrintBill = async () => {
    if (!occupiedOrder) return;
    setPrintingBill(true);
    const result = await PrinterService.printReceipt({
      businessName: settings?.businessName ?? 'PrabandhOS',
      addressLine: settings?.address?.trim() || undefined,
      orderNumber: occupiedOrder.number,
      time: new Date(occupiedOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      title: occupiedOrder.title,
      orderTypeLabel: 'Dine In',
      guestPhone: occupiedOrder.guestPhone ?? undefined,
      waiterName: occupiedOrder.servedByName ?? occupiedOrder.createdByName,
      gstNumber: settings?.gstNumber,
      items: occupiedOrder.items,
      subtotal: occupiedOrder.subtotal,
      discountPct: occupiedOrder.discountPct || undefined,
      discountAmount: occupiedOrder.discountAmount || undefined,
      taxRatePct: settings?.taxRatePct ?? 8,
      tax: occupiedOrder.tax,
      total: occupiedOrder.total,
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

  const orderId = occupiedModal?.orderId ?? null;

  // Builds and sends the kitchen ticket for the current (latest) fire batch — no prices,
  // just what to make. Returns null when that batch has nothing printable (nothing fired
  // yet, or every line since voided) so each caller decides whether that's silent or a toast.
  const printCurrentKot = async (order: ApiOrder) => {
    const batchItems = order.items.filter((i) => i.fireBatch === order.currentFireBatch && !i.voided);
    if (batchItems.length === 0) return null;
    const batch = order.fireBatches.find((b) => b.batchNumber === order.currentFireBatch);
    // Claim it before printing — see printedKots.ts for why (AutoKotPrintHost's safety net
    // must not re-print a batch this screen is already handling).
    if (batch) markKotPrinted(batch.kotNumber);
    return PrinterService.printKot({
      title: order.tableCode ? `Table ${order.tableCode}` : order.title,
      kotNumber: batch?.kotNumber || `#${order.currentFireBatch}`,
      time: new Date(batch?.firedAt ?? order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      // order.title already reads "<Type> – <guest>" once tableCode isn't set, so
      // guestName is only added on top for Table — otherwise it'd repeat the name twice.
      guestName: order.tableCode ? order.guestName : undefined,
      items: batchItems.map((i) => ({
        name: i.name, qty: i.qty, variantName: i.variantName, modifier: i.modifier, stationName: i.stationName, vegNonVegType: i.vegNonVegType,
        selectedModifiers: i.selectedModifiers, subtitle: i.subtitle,
      })),
    });
  };

  // Fires alongside the fire itself. Doesn't block it either way, but does surface its
  // own toast (success or "no printer set up") right after "Sent to the kitchen" so a
  // missing/unconfigured printer doesn't just look like nothing happened.
  const autoPrintKot = async (order: ApiOrder) => {
    const result = await printCurrentKot(order);
    if (!result) return;
    dispatch(showToast({ message: result.ok ? 'KOT sent to kitchen printer.' : result.message, icon: result.ok ? 'printer-check' : 'alert-circle-outline', tone: result.ok ? 'success' : 'warning' }));
  };

  // Manual re-print of the latest KOT, same header pill as Token Orders — for when the
  // auto-print at fire time failed (printer off/out of paper) or the kitchen needs another
  // physical copy beyond what's on the KDS screen.
  const handlePrintKot = async () => {
    if (!occupiedOrder) return;
    setPrintingKot(true);
    const result = await printCurrentKot(occupiedOrder);
    setPrintingKot(false);
    if (!result) {
      dispatch(showToast({ message: 'Nothing fired to the kitchen yet.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    dispatch(showToast({ message: result.message, icon: result.ok ? 'printer-check' : 'alert-circle-outline', tone: result.ok ? 'success' : 'danger' }));
  };

  const handleFire = async () => {
    if (orderId == null) return;
    try {
      const firedOrder = await fireOrder.mutateAsync(orderId);
      dispatch(showToast({ message: 'Sent to the kitchen.', icon: 'chef-hat', tone: 'success' }));
      await autoPrintKot(firedOrder);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not fire order'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleCancelOrder = () => {
    if (orderId == null) return;
    Alert.alert(
      'Cancel this order?',
      'Every not-yet-served item is voided (stock is put back if prep hadn\'t started). Served items stay on the bill — use Refund for those instead.',
      [
        { text: 'Keep Order', style: 'cancel' },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelOrder.mutateAsync({ id: orderId });
              dispatch(showToast({ message: 'Order cancelled.', icon: 'close-circle-outline', tone: 'warning' }));
              closeOccupiedModal();
            } catch (err) {
              dispatch(showToast({ message: getApiErrorMessage(err, 'Could not cancel order'), icon: 'alert-circle-outline', tone: 'danger' }));
            }
          },
        },
      ],
    );
  };

  // Single tap, no confirmation — jumps this one line straight to Served regardless of
  // its current kitchen stage. Same one-tap pattern as TokenDashboardScreen's QSR flow
  // (see backend OrdersController.ServeItem, which isn't order-type-specific).
  const handleTapServeItem = async (item: ApiOrderItem) => {
    if (orderId == null || item.status === 'SERVED' || item.fireBatch === 0) return;
    try {
      await serveItem.mutateAsync({ id: orderId, itemId: item.id });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not mark served'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleRevokeSession = () => {
    if (occupiedModal?.activeSessionId == null) return;
    const tableId = occupiedModal.id;
    Alert.alert(
      'End guest session?',
      'The customer\'s phone will immediately lose access to this table\'s QR ordering session. This does not affect an already-placed order.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeSession.mutateAsync({ tableId, reason: 'Ended by staff from Tables screen' });
              dispatch(showToast({ message: 'Guest session ended.', icon: 'account-off-outline', tone: 'success' }));
            } catch (err) {
              dispatch(showToast({ message: getApiErrorMessage(err, 'Could not end session'), icon: 'alert-circle-outline', tone: 'danger' }));
            }
          },
        },
      ],
    );
  };

  const closeOccupiedModal = () => {
    setOccupiedModal(null);
    setSplitVisible(false);
    setSplitWays(2);
    setSplitMode('equal');
    setSplitMethod('Cash');
    setCustomAmount('');
  };

  // phoneOverride: a number the cashier just added through OrderBillActions' missing-number
  // prompt — occupiedOrder is still the pre-update copy here, so it can't be read back off
  // the order yet (see OrderBillActions' onSendWhatsApp doc).
  const sendBillViaWhatsApp = async (phoneOverride?: string) => {
    const guestPhone = phoneOverride ?? occupiedOrder?.guestPhone;
    if (!occupiedOrder || !guestPhone) return;
    // Best-effort: a missing/failed token just falls back to the text-only summary
    // below rather than blocking the whole "send bill" action over a PDF link.
    let receiptUrl: string | undefined;
    try {
      const token = await ordersApi.getReceiptToken(occupiedOrder.id);
      receiptUrl = `${getPublicApiBaseUrl()}/public/receipt/${token}`;
    } catch {
      receiptUrl = undefined;
    }
    const url = buildWhatsAppBillUrl({
      businessName: settings?.businessName ?? 'PrabandhOS',
      orderNumber: occupiedOrder.number,
      items: occupiedOrder.items,
      subtotal: occupiedOrder.subtotal,
      discountAmount: occupiedOrder.discountAmount || undefined,
      tax: occupiedOrder.tax,
      total: occupiedOrder.total,
      guestPhone,
      receiptUrl,
    });
    if (!url) {
      dispatch(showToast({ message: 'Need a valid 10-digit mobile number to send via WhatsApp.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    Linking.openURL(url);
  };

  // Only used as the name field's placeholder, so the cashier can see what leaving it blank
  // would produce. Mirrors the server's own rule (highest T-number + 1, non-numeric names
  // counting as 0) — it's a hint, not the value that gets sent: the server always decides.
  const nextAutoCode = useMemo(() => {
    const maxNum = allTables.reduce((max, t) => {
      const n = parseInt(t.code.replace(/^T/i, ''), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `T${maxNum + 1}`;
  }, [allTables]);

  const closeAddModal = () => {
    setAddModalVisible(false);
    setNewZoneMode(false);
    setNewZoneName('');
    setNewTableName('');
  };

  const openEditModal = (table: ApiTable) => {
    setEditingTable(table);
    setEditName(table.code);
    setEditSeats(table.seats);
    setConfirmingDelete(false);
  };

  const closeEditModal = () => {
    setEditingTable(null);
    setEditName('');
    setConfirmingDelete(false);
  };

  const handleSaveTable = async () => {
    if (!editingTable) return;
    const name = editName.trim();
    if (!name) {
      dispatch(showToast({ message: 'Table name cannot be empty.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const renaming = name !== editingTable.code;
    // Same local pre-check as Add — saves a round trip and points at the field to change.
    // Compared against every OTHER table, since keeping your own name is not a clash.
    if (renaming && allTables.some((t) => t.id !== editingTable.id && t.code.toLowerCase() === name.toLowerCase())) {
      dispatch(showToast({ message: `A table named "${name}" already exists.`, icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      const res = await updateTable.mutateAsync({ id: editingTable.id, code: name, seats: editSeats });
      // A rename silently invalidates the QR sticker physically taped to that table — the
      // token encodes the table's name, not its id. Staff have no way to discover that until
      // a guest's scan fails, so the toast has to say it, and stays a warning (not a success)
      // to survive being skim-read.
      if (res.qrCodeInvalidated) {
        dispatch(showToast({
          message: `Renamed to ${name}. Reprint this table's QR — the old one no longer works.`,
          icon: 'qrcode-remove',
          tone: 'warning',
        }));
      } else {
        dispatch(showToast({ message: 'Table updated', icon: 'check-circle-outline', tone: 'success' }));
      }
      closeEditModal();
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update table'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleDeleteTable = async () => {
    if (!editingTable) return;
    try {
      await deleteTable.mutateAsync(editingTable.id);
      dispatch(showToast({ message: `Table ${editingTable.code} deleted`, icon: 'check-circle-outline', tone: 'success' }));
      closeEditModal();
    } catch (err) {
      // The server refuses a table that is merged or has an open order, and says which —
      // surface its message rather than a generic one, since the fix differs for each.
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not delete table'), icon: 'alert-circle-outline', tone: 'danger' }));
      setConfirmingDelete(false);
    }
  };

  const handleAddTable = async () => {
    const targetZone = newZoneMode ? newZoneName.trim() : activeZone;
    if (newZoneMode && !targetZone) {
      dispatch(showToast({ message: 'Enter a name for the new floor/zone.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const name = newTableName.trim();
    // Blank is a deliberate, supported choice (auto-numbering) — only a name that's actually
    // taken is worth stopping for. The server enforces this too (unique index + 409); catching
    // it here just saves a round trip and points at the field the cashier has to change.
    if (name && allTables.some((t) => t.code.toLowerCase() === name.toLowerCase())) {
      dispatch(showToast({ message: `A table named "${name}" already exists.`, icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await createTable.mutateAsync({ zone: targetZone, seats: newSeats, code: name || undefined });
      // Jump the active tab to wherever the table actually landed — most
      // noticeable for a brand-new zone, which otherwise wouldn't be visible
      // until the user found and tapped its (now newly-existing) tab themselves.
      setZone(targetZone);
      setNewSeats(4);
      closeAddModal();
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add table'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  return (
    <View style={styles.container}>
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          {showBackButton ? (
            <>
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
                <Icon name="arrow-left" size={20} color={COLORS.heading} />
              </TouchableOpacity>
              <Icon name="table-chair" size={22} color={COLORS.accent} />
              <Text style={styles.brandTitle} numberOfLines={1}>Tables</Text>
            </>
          ) : (
            <>
              <Icon name="storefront-outline" size={22} color={COLORS.heading} />
              <Text style={styles.brandTitle} numberOfLines={1}>{settings?.businessName ?? 'PrabandhOS'}</Text>
            </>
          )}
          <GlobalSearchTrigger navigation={navigation} />
        </View>
      )}
      <DesktopPageHeader icon="table-chair" title="Tables" />

      <ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.zoneRow}>
          {zones.map((z) => {
            const active = z === activeZone;
            return (
              <TouchableOpacity key={z} onPress={() => setZone(z)} style={styles.zoneTab}>
                <Text style={[styles.zoneText, active && styles.zoneTextActive]}>{z}</Text>
                {active && <View style={styles.zoneUnderline} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legendRow}>
          <CategoryFilterTrigger
            label={`${capacityFilter} · ${capacityCounts[capacityFilter] ?? 0}`}
            onPress={() => setCapacityPickerVisible(true)}
            style={styles.filterTrigger}
          />
          <CategoryFilterTrigger
            label={`${statusFilter} · ${statusCounts[statusFilter as keyof typeof statusCounts] ?? 0}`}
            onPress={() => setStatusPickerVisible(true)}
            style={styles.filterTrigger}
          />
        </ScrollView>
        <CategoryFilterModal
          visible={capacityPickerVisible}
          onClose={() => setCapacityPickerVisible(false)}
          title="Filter by Capacity"
          categories={capacityOptions}
          activeCategory={capacityFilter}
          counts={capacityCounts}
          onSelect={setCapacityFilter}
        />
        <CategoryFilterModal
          visible={statusPickerVisible}
          onClose={() => setStatusPickerVisible(false)}
          title="Filter by Status"
          categories={statusOptions}
          activeCategory={statusFilter}
          counts={statusCounts}
          onSelect={setStatusFilter}
        />

        {pickerActive && (
          <View style={styles.pickerBanner}>
            <Icon name={shiftingFrom ? 'table-furniture' : 'call-merge'} size={16} color={COLORS.accent} />
            <Text style={styles.pickerBannerText} numberOfLines={2}>
              {shiftingFrom ? `Pick an empty table for ${shiftingFrom.code}'s order` : `Pick another empty table to merge with ${mergingFrom!.code}`}
            </Text>
            <TouchableOpacity onPress={() => { setShiftingFrom(null); setMergingFrom(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.pickerBannerCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {isError && allTables.length === 0 ? (
          <ErrorState
            title="Couldn't load tables"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : (
        <View style={styles.grid}>
          {isLoading && <SkeletonGrid items={8} columns={2} />}
          {!isLoading && FILTERED_TABLES.length === 0 && (
            <View style={styles.emptyZone}>
              <Icon name="table-furniture" size={28} color={COLORS.muted} />
              <Text style={styles.emptyZoneText}>
                {TABLES.length === 0 ? `No tables in ${activeZone} yet.` : 'No tables match this filter.'}
              </Text>
            </View>
          )}
          {FILTERED_TABLES.map((table) => {
            const style = STATUS_STYLES[table.status];
            const badge = table.status === 'occupied' ? occupiedBadge(table.orderStatus) : null;
            // Falls back to [] — an older/not-yet-updated API build won't send this field at all.
            const mergedWith = table.mergedWith ?? [];
            // While picking a Shift/Merge target, only OTHER empty tiles are valid — every
            // other tile dims instead of disabling outright, so the picker banner's Cancel
            // stays reachable and the grid doesn't jarringly re-layout.
            const isPickTarget = !!pickerActive && table.status === 'empty' && table.id !== pickerActive.id;
            const isDimmed = !!pickerActive && !isPickTarget;
            return (
              <TouchableOpacity
                key={table.id}
                style={[styles.tile, isDesktopWeb && styles.tileDesktop, { backgroundColor: style.bg }, isDimmed && styles.tileDimmed]}
                activeOpacity={0.85}
                onPress={() => handleTilePress(table)}
              >
                <View
                  style={[
                    styles.tileStatusBadge,
                    // Empty tiles have taller content (code + seats + "Available" + the New
                    // Order button) than occupied ones, which pushes right up against a
                    // top-left badge and collides with the table code — top-right is clear
                    // for empty tiles since only occupied ones use that corner for the
                    // account-multiple icon.
                    table.status === 'empty' ? styles.tileStatusBadgeRight : styles.tileStatusBadgeLeft,
                    { backgroundColor: table.status === 'empty' ? COLORS.successBg : badge!.bg },
                  ]}
                >
                  <Text style={[styles.tileStatusBadgeText, { color: table.status === 'empty' ? COLORS.success : badge!.text }]} numberOfLines={1}>
                    {table.status === 'empty' ? 'Empty' : badge!.label}
                  </Text>
                </View>
                {table.status === 'occupied' && (
                  <Icon name="account-multiple" size={18} color={style.text} style={styles.tileTopIcon} />
                )}

                {/* Rename / resize / delete. Only on EMPTY tiles: the status badge sits
                    top-right there, leaving this corner free, and every edit the sheet offers
                    is one the server refuses on an occupied table anyway. Hidden mid-picker so
                    it can't be mistaken for choosing a Shift/Merge target. */}
                {canAdd && !pickerActive && table.status === 'empty' && (
                  <TouchableOpacity
                    style={styles.tileEditBtn}
                    onPress={() => openEditModal(table)}
                    accessibilityLabel={`Edit table ${table.code}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="pencil-outline" size={15} color={style.text} />
                  </TouchableOpacity>
                )}

                <Text style={[styles.tileId, { color: style.text }]} numberOfLines={1}>{table.code}</Text>

                {table.status === 'empty' && (
                  <>
                    <Text style={[styles.tileMeta, { color: style.text }]} numberOfLines={1}>
                      {mergedWith.length > 0
                        ? `${table.mergedSeats ?? table.seats} Seater (+${mergedWith.map((g) => g.code).join(', ')})`
                        : `${table.seats} Seater`}
                    </Text>
                    <Text style={[styles.tileMetaItalic, { color: style.text }]}>Available</Text>
                    <TouchableOpacity style={styles.openCheckBtn} onPress={() => handleTilePress(table)}>
                      <Text style={styles.openCheckText}>New Order</Text>
                    </TouchableOpacity>
                    {/* Hidden mid-picker so a tap here can't be mistaken for completing the
                        Shift/Merge in progress — Merge/Unmerge only make sense as a fresh action. */}
                    {canAdd && !pickerActive && (
                      mergedWith.length > 0 ? (
                        <TouchableOpacity style={styles.tileSecondaryBtn} onPress={() => handleUnmergeAll(table)}>
                          <Text style={styles.tileSecondaryBtnText}>Unmerge</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={styles.tileSecondaryBtn} onPress={() => setMergingFrom(table)}>
                          <Text style={styles.tileSecondaryBtnText}>Merge with another table</Text>
                        </TouchableOpacity>
                      )
                    )}
                  </>
                )}

                {table.status === 'occupied' && (
                  <>
                    <Text style={[styles.tileMeta, { color: style.text }]} numberOfLines={1}>
                      {table.guestName ? table.guestName : `Order ${tableOrderLabel(table)}`} · {table.orderStatus}
                    </Text>
                    <Text style={[styles.tileBill, { color: style.text }]}>₹{table.bill?.toFixed(2)}</Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        )}

        <View style={styles.efficiencyCard}>
          <View style={styles.efficiencyHeader}>
            <Text style={styles.efficiencyTitle}>Dining Area</Text>
            <View style={[styles.diningStatusBadge, { backgroundColor: diningStatus.bg }]}>
              <Text style={[styles.diningStatusText, { color: diningStatus.text }]}>{diningStatus.label}</Text>
            </View>
          </View>
          <View style={styles.efficiencyStatsRow}>
            <View style={styles.efficiencyStat}>
              <Text style={styles.efficiencyLabel}>Occupancy</Text>
              <Text style={styles.efficiencyValue}>{occupancyPct}%</Text>
              <Text style={styles.efficiencyCount}>{occupiedCount}/{allTables.length}</Text>
            </View>
            <View style={styles.efficiencyStat}>
              <Text style={styles.efficiencyLabel}>Active Orders</Text>
              <Text style={styles.efficiencyValue}>{activeOrderCount}</Text>
            </View>
            <View style={styles.efficiencyStat}>
              <Text style={styles.efficiencyLabel}>Free Tables</Text>
              <Text style={styles.efficiencyValue}>{freeTableCount}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {canAdd && (
        <Tooltip label="Add table" placement="left">
          <TouchableOpacity style={styles.fab} onPress={() => setAddModalVisible(true)}>
            <Icon name="plus" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </Tooltip>
      )}

      {/* ---------- Occupied table: order lifecycle. Payment is available at any point
          (not gated on Served) — full page on mobile so there's room for the item list,
          bill, and payment actions together; a centered card on desktop web. ---------- */}
      <Modal visible={!!occupiedModal} transparent={isDesktopWeb} animationType={isDesktopWeb ? 'fade' : 'slide'} onRequestClose={closeOccupiedModal}>
        <View style={isDesktopWeb ? styles.modalOverlay : styles.occFullPage}>
          <View style={isDesktopWeb ? [styles.modalSheet, styles.occModalSheetTight] : [styles.occFullPageInner, { paddingTop: insets.top + 12 }]}>
            <View style={styles.occupiedModalHeader}>
              {/* Mobile is a full-page slide-in → back arrow on the left (phone convention).
                  Desktop web is a dialog → the close (X) belongs on the top-RIGHT, so the
                  title takes the row (flex) and the X sits after it on the right edge. */}
              {!isDesktopWeb && (
                <TouchableOpacity style={styles.occupiedModalBackBtn} onPress={closeOccupiedModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Icon name="arrow-left" size={22} color={COLORS.heading} />
                </TouchableOpacity>
              )}
              {/* flex on both layouts now (it used to be desktop-only): the Print KOT pill
                  sits after the title, so the title has to take up the slack for the pill
                  to land on the right edge instead of butting up against the heading. */}
              <Text style={[styles.modalTitle, styles.occupiedModalTitleText, { flex: 1, minWidth: 0 }, modalHeadingOverride(styles.modalTitle.fontSize)]} numberOfLines={1}>{occupiedModal?.code} — {occupiedOrder?.status ?? occupiedModal?.orderStatus}</Text>
              {occupiedOrder && (
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
                <CloseButton onPress={closeOccupiedModal} size={22} style={styles.occupiedModalBackBtn} />
              )}
            </View>
            {/* Order number + the three order-lifecycle actions (QR session/Shift/Cancel)
                share one row — icon-only buttons so all three fit alongside the order
                number instead of stacking as separate full-width rows. */}
            <View style={styles.orderHeaderRow}>
              <Text style={styles.modalLine} numberOfLines={1}>
                {occupiedModal?.guestName
                  ? `Guest: ${occupiedModal.guestName}`
                  : `Order ${occupiedModal ? tableOrderLabel(occupiedModal) : '—'}`}
              </Text>
              <View style={styles.orderHeaderActions}>
                {/* QR guest session (doc Section 5.6) — independent of the order lifecycle
                    below. Owner/Manager only, same policy the backend enforces
                    (Policies.OwnerOrManager). */}
                {canAdd && occupiedModal?.activeSessionId != null && (
                  <Tooltip label="End QR guest session" placement="bottom">
                    <TouchableOpacity
                      style={styles.orderHeaderIconBtn}
                      onPress={handleRevokeSession}
                      disabled={revokeSession.isPending}
                      accessibilityLabel="End QR Guest Session"
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      {revokeSession.isPending ? (
                        <ActivityIndicator size="small" color={COLORS.dangerAccent} />
                      ) : (
                        <Icon name="account-off-outline" size={15} color={COLORS.dangerAccent} />
                      )}
                    </TouchableOpacity>
                  </Tooltip>
                )}

                {/* Moves this order to a different, currently-empty table — no Owner/Manager
                    gate, same routine-floor-action availability as Fire/Add Items (not
                    Cancel Order's stricter one below), since relabelling a table isn't
                    destructive or billing-related. */}
                {occupiedOrder && !occupiedOrder.cancelled && (
                  <Tooltip label="Move to another table" placement="bottom">
                    <TouchableOpacity
                      style={[styles.orderHeaderIconBtn, styles.orderHeaderIconBtnAccent]}
                      onPress={() => { if (occupiedModal) { setShiftingFrom(occupiedModal); closeOccupiedModal(); } }}
                      disabled={shiftTable.isPending}
                      accessibilityLabel="Shift Table"
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      {shiftTable.isPending ? (
                        <ActivityIndicator size="small" color={COLORS.accent} />
                      ) : (
                        <Icon name="table-furniture" size={15} color={COLORS.accent} />
                      )}
                    </TouchableOpacity>
                  </Tooltip>
                )}

                {/* Whole-order cancel — Owner/Manager only, matches Policies enforced server-side
                    once any item's already been served. Hidden once paid (use Refund instead). */}
                {canCancelOrder && occupiedOrder && !occupiedOrder.paid && !occupiedOrder.cancelled && (
                  <Tooltip label="Cancel order" placement="bottom">
                    <TouchableOpacity
                      style={styles.orderHeaderIconBtn}
                      onPress={handleCancelOrder}
                      disabled={cancelOrder.isPending}
                      accessibilityLabel="Cancel Order"
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      {cancelOrder.isPending ? (
                        <ActivityIndicator size="small" color={COLORS.dangerAccent} />
                      ) : (
                        <Icon name="close-circle-outline" size={15} color={COLORS.dangerAccent} />
                      )}
                    </TouchableOpacity>
                  </Tooltip>
                )}
              </View>
            </View>

            {/* flex:1 alone doesn't reliably get a determinate height to shrink into inside
                the desktop modal's maxHeight-capped (not height-capped) card, so it wouldn't
                actually scroll — a fixed maxHeight there is what works (matches the pattern
                already used by POS's own bill modal). Mobile's occFullPageInner is a true
                flex-stretched full screen, so flex:1 is fine there. */}
            {/* Desktop web shows the scrollbar so it's obvious the settle panel scrolls
                below the fold (Adjustments + payment sit under the Grand Total); the mobile
                full-page keeps its clean, indicator-free scroll. */}
            <ScrollView style={[styles.occModalScroll, isDesktopWeb && { flex: undefined, maxHeight: Dimensions.get('window').height * 0.8 }]} showsVerticalScrollIndicator={isDesktopWeb} persistentScrollbar={isDesktopWeb}>
              {!occupiedOrder && (
                <ActivityIndicator size="small" color={COLORS.accent} style={{ marginVertical: 24 }} />
              )}

              {/* --- Item list (open editing — nothing fired yet, so no batches to group by) --- */}
              {occupiedOrder && isOpenOrder && (
                <View style={styles.occItemsScroll}>
                  {occupiedOrder.items.map((item) => (
                    <View key={item.id} style={styles.occItemRow}>
                      <ItemQtyStepper
                        qty={item.qty}
                        disabled={occupiedOrder.paid}
                        pending={qtyEditor.pendingItemId === item.id}
                        onChange={(next) => qtyEditor.request(item, next)}
                      />
                      <Text style={styles.occItemName} numberOfLines={isDesktopWeb ? 1 : 2}>{item.name}</Text>
                      <View style={styles.occUnfiredTag}><Text style={styles.occUnfiredTagText}>NEW</Text></View>
                      <Text style={styles.occItemPrice}>₹{(item.price * item.qty).toFixed(2)}</Text>
                      <ItemRateButton editor={priceEditor} item={item} disabled={occupiedOrder.paid || occupiedOrder.cancelled} />
                      <Tooltip label="Remove item" placement="left">
                        <TouchableOpacity onPress={() => voidPrompt.request(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Icon name="close" size={16} color={COLORS.dangerAccent} />
                        </TouchableOpacity>
                      </Tooltip>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.occAddItemBtn} onPress={handleAddItemsViaPos}>
                    <Icon name="plus" size={16} color={COLORS.accent} />
                    <Text style={styles.occAddItemText}>Add Items (POS)</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* --- Item list (inKitchen — grouped by fire round; each round tracks its own
                  status independently). Stays visible once Served too, so staff can still
                  see what actually went out — only the bill/payment section below changes
                  based on Served/Paid. --- */}
              {occupiedOrder && !isOpenOrder && (
                <View style={styles.occItemsScroll}>
                  {occupiedOrder.fireBatches.map((batch) => {
                    // Exclude voided lines. Removing a fired item VOIDS it (soft delete so the
                    // KOT/ledger history survives — see OrdersController.RemoveItem/VoidItemAsync),
                    // so without this filter the "removed" line just stays here as a disabled "1×"
                    // row and looks like the X did nothing.
                    const batchItems = occupiedOrder.items.filter((i) => i.fireBatch === batch.batchNumber && !i.voided);
                    if (batchItems.length === 0) return null; // whole round pulled back — nothing left to show
                    return (
                      <View key={batch.batchNumber} style={styles.occBatchGroup}>
                        <View style={styles.occBatchHeaderRow}>
                          <Text style={styles.occBatchLabel}>
                            KOT {batch.kotNumber || `#${batch.batchNumber}`} · {BATCH_STATUS_LABEL[batch.status] ?? batch.status}
                          </Text>
                        </View>
                        {batchItems.map((item) => {
                          const dotColor = COLORS[ITEM_STATUS_COLOR[item.status] ?? 'muted'];
                          const servable = item.status !== 'SERVED';
                          return (
                            <View key={item.id} style={styles.occItemRow}>
                              <View style={[styles.occItemStatusDot, { backgroundColor: dotColor }]} />
                              {/* No served-units floor — see TokenDashboardScreen for why the
                                  till has to be able to correct an already-served count. A voided
                                  line isn't editable at all; it's history. */}
                              <ItemQtyStepper
                                qty={item.qty}
                                disabled={occupiedOrder.paid || item.voided}
                                pending={qtyEditor.pendingItemId === item.id}
                                onChange={(next) => qtyEditor.request(item, next)}
                              />
                              <Text style={styles.occItemName} numberOfLines={isDesktopWeb ? 1 : 2}>{item.name}</Text>
                              {/* The status label IS the tap target — one tap jumps straight to
                                  Served, no confirmation, no stage-by-stage stepping. */}
                              <TouchableOpacity
                                disabled={!servable || serveItem.isPending}
                                onPress={() => handleTapServeItem(item)}
                                style={[styles.occItemStatusPill, { backgroundColor: `${dotColor}22` }]}
                              >
                                <Text style={[styles.occItemStatusPillText, { color: dotColor }]}>{item.status}</Text>
                              </TouchableOpacity>
                              <ItemRateButton editor={priceEditor} item={item} disabled={occupiedOrder.paid || occupiedOrder.cancelled || item.voided} />
                              <Tooltip label="Remove item" placement="left">
                                <TouchableOpacity onPress={() => voidPrompt.request(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                  <Icon name="close" size={16} color={COLORS.dangerAccent} />
                                </TouchableOpacity>
                              </Tooltip>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                  {/* Not-yet-fired lines get the same group-with-a-header shape as the KOT
                      rounds above, because to staff reading this list they ARE just the next
                      round — one that hasn't gone to the kitchen yet. They used to be emitted
                      as bare rows straight after the last batch: no header, no status dot, a
                      price column none of the fired rows carry, and a differently-styled tag
                      where the status pill sits. Two unrelated-looking lists in one panel, with
                      nothing saying where one ended and the other began. */}
                  {occupiedOrder.items.some((i) => i.fireBatch === 0 && !i.voided) && (
                    <View style={styles.occBatchGroup}>
                      <View style={styles.occBatchHeaderRow}>
                        <Text style={styles.occBatchLabel}>NEW · not sent to the kitchen yet</Text>
                      </View>
                      {occupiedOrder.items.filter((i) => i.fireBatch === 0 && !i.voided).map((item) => (
                        <View key={item.id} style={styles.occItemRow}>
                          <View style={[styles.occItemStatusDot, { backgroundColor: COLORS.muted }]} />
                          <ItemQtyStepper
                            qty={item.qty}
                            disabled={occupiedOrder.paid}
                            pending={qtyEditor.pendingItemId === item.id}
                            onChange={(next) => qtyEditor.request(item, next)}
                          />
                          <Text style={styles.occItemName} numberOfLines={isDesktopWeb ? 1 : 2}>{item.name}</Text>
                          {/* Same slot the fired rows put their status pill in, so the columns
                              line up. Not a TouchableOpacity: there's no kitchen stage to
                              advance until this round is actually fired. */}
                          <View style={[styles.occItemStatusPill, { backgroundColor: `${COLORS.muted}22` }]}>
                            <Text style={[styles.occItemStatusPillText, { color: COLORS.muted }]}>NEW</Text>
                          </View>
                          <ItemRateButton editor={priceEditor} item={item} disabled={occupiedOrder.paid || occupiedOrder.cancelled} />
                          <Tooltip label="Remove item" placement="left">
                            <TouchableOpacity onPress={() => voidPrompt.request(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Icon name="close" size={16} color={COLORS.dangerAccent} />
                            </TouchableOpacity>
                          </Tooltip>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {occupiedOrder && hasFiredAnything && !occupiedOrder.paid && (
                <TouchableOpacity style={styles.occAddItemBtn} onPress={handleAddItemsViaPos}>
                  <Icon name="plus" size={16} color={COLORS.accent} />
                  <Text style={styles.occAddItemText}>Add Items (POS)</Text>
                </TouchableOpacity>
              )}

              {/* --- Bill + payment — scrolls with the item list above (a fixed pin below
                  the scroll used to make the Settle button unreachable once discount/
                  charges/loyalty adjustments made this panel tall). Available the moment
                  anything's been fired, regardless of serve status (a cafe may collect
                  payment before, during, or after serving). Discount/coupon/gift-card/
                  loyalty/charges are self-contained inside OrderBillActions itself. --- */}
              {occupiedOrder && hasFiredAnything && (
                <View style={{ marginTop: 8 }}>
                  {!occupiedOrder.paid && (
                    <TouchableOpacity style={styles.occSplitBtn} onPress={() => setSplitVisible(true)}>
                      <Icon name="account-cash-outline" size={15} color={COLORS.heading} />
                      <Text style={styles.occSplitBtnText}>Split Bill</Text>
                    </TouchableOpacity>
                  )}

                  <OrderBillActions
                    key={occupiedOrder.id}
                    order={occupiedOrder}
                    taxLabel={`Tax (${settings?.taxRatePct ?? 0}%)`}
                    payingPending={payOrder.isPending}
                    printingPending={printingBill}
                    offerServeOnSettle
                    onMarkPaid={handleMarkPaid}
                    onPrintBill={handlePrintBill}
                    onSendWhatsApp={sendBillViaWhatsApp}
                  />
                </View>
              )}
              {occupiedOrder && !occupiedOrder.cancelled && <WhatsAppTrackingQr orderId={occupiedOrder.id} />}
            </ScrollView>

            {/* --- Primary action row: Fire (Close/Done removed — the top-right X dismisses;
                payment lives in OrderBillActions above) --- */}
            <View style={styles.modalActions}>
              {occupiedOrder && isOpenOrder && (
                <TouchableOpacity style={styles.modalPayBtn} onPress={handleFire} disabled={fireOrder.isPending}>
                  {fireOrder.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="chef-hat" size={16} color="#FFFFFF" />}
                  <Text style={styles.modalPayText}>Fire to Kitchen</Text>
                </TouchableOpacity>
              )}

              {/* Hidden once the bill is settled: the backend refuses Fire on a paid order
                  ("Order is already paid"), so this could only ever throw an error toast. */}
              {occupiedOrder && !isOpenOrder && !occupiedOrder.paid && unfiredCount > 0 && (
                <TouchableOpacity style={styles.modalPayBtn} onPress={handleFire} disabled={fireOrder.isPending}>
                  {fireOrder.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="chef-hat" size={16} color="#FFFFFF" />}
                  <Text style={styles.modalPayText}>Fire New Items ({unfiredCount})</Text>
                </TouchableOpacity>
              )}
            </View>

          </View>
        </View>
      </Modal>

      {/* ---------- Split Bill (cosmetic calculator) ---------- */}
      <Modal visible={splitVisible} transparent animationType="fade" onRequestClose={() => setSplitVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.occupiedModalHeader}>
              {/* flex on the title pushes the close (X) to the right edge — occupiedModalHeader
                  itself has no space-between (it's shared with the back-arrow layout above). */}
              <Text style={[styles.modalTitle, { flex: 1, minWidth: 0 }, modalHeadingOverride(styles.modalTitle.fontSize)]} numberOfLines={1}>Split Bill</Text>
              <CloseButton onPress={() => setSplitVisible(false)} size={22} />
            </View>
            <View style={styles.occBillRow}><Text style={styles.occBillTotalLabel}>Bill Total</Text><Text style={styles.occBillTotalVal}>₹{splitTotal.toFixed(2)}</Text></View>
            <View style={styles.occBillRow}><Text style={styles.occBillLabel}>Collected</Text><Text style={styles.occBillVal}>₹{splitPaid.toFixed(2)}</Text></View>
            <View style={styles.occBillRow}><Text style={styles.occBillLabel}>Remaining</Text><Text style={styles.splitRemainingVal}>₹{splitRemaining.toFixed(2)}</Text></View>

            {splitRemaining <= 0.01 ? (
              <Text style={styles.splitDoneNote}>This bill is fully collected.</Text>
            ) : (
              <>
                {/* Equal vs Custom — the two splits every POS offers. Item-wise splitting
                    would need each item tagged to a guest at order-entry time, which this
                    app doesn't capture, so it's deliberately not offered here. */}
                <View style={styles.splitModeRow}>
                  {(['equal', 'custom'] as const).map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.splitModeBtn, splitMode === mode && styles.splitModeBtnOn]}
                      onPress={() => setSplitMode(mode)}
                    >
                      <Text style={[styles.splitModeText, splitMode === mode && styles.splitModeTextOn]}>
                        {mode === 'equal' ? 'Split equally' : 'Custom amount'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {splitMode === 'equal' ? (
                  <>
                    <View style={styles.splitWaysRow}>
                      <Text style={styles.occBillLabel}>Split between</Text>
                      <View style={styles.splitStepper}>
                        <TouchableOpacity style={styles.splitStepBtn} onPress={() => setSplitWays((w) => Math.max(2, w - 1))}><Text style={styles.splitStepText}>−</Text></TouchableOpacity>
                        <Text style={styles.splitWaysValue}>{splitWays}</Text>
                        <TouchableOpacity style={styles.splitStepBtn} onPress={() => setSplitWays((w) => Math.min(8, w + 1))}><Text style={styles.splitStepText}>+</Text></TouchableOpacity>
                      </View>
                      <Text style={styles.occBillLabel}>people</Text>
                    </View>
                    {splitShares.map((share, p) => {
                      const isPaid = p < splitPaidCount;
                      const isNext = p === splitPaidCount;
                      return (
                        <View key={p} style={[styles.occBillRow, isNext && styles.splitNextRow]}>
                          <Text style={[styles.occBillLabel, isPaid && styles.splitPaidLabel]}>
                            Person {p + 1}{isPaid ? '  ✓ paid' : ''}
                          </Text>
                          <Text style={[styles.occBillVal, isPaid && styles.splitPaidLabel]}>₹{share.toFixed(2)}</Text>
                        </View>
                      );
                    })}
                  </>
                ) : (
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.occBillLabel}>Amount to collect now</Text>
                    <TextInput
                      style={styles.splitAmountInput}
                      value={customAmount}
                      onChangeText={setCustomAmount}
                      placeholder={`Up to ₹${splitRemaining.toFixed(2)}`}
                      placeholderTextColor={COLORS.placeholder}
                      keyboardType="decimal-pad"
                    />
                  </View>
                )}

                <Text style={[styles.occBillLabel, { marginTop: 12 }]}>Paid by</Text>
                <View style={styles.splitModeRow}>
                  {(['Cash', 'UPI', 'Card'] as PaymentMethod[]).map((method) => (
                    <TouchableOpacity
                      key={method}
                      style={[styles.splitModeBtn, splitMethod === method && styles.splitModeBtnOn]}
                      onPress={() => setSplitMethod(method)}
                    >
                      <Text style={[styles.splitModeText, splitMethod === method && styles.splitModeTextOn]}>{method}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.splitCollectBtn, !canCollect && styles.splitCollectBtnOff]}
                  onPress={collectShare}
                  disabled={!canCollect}
                >
                  {collecting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.splitCollectText}>
                      {splitMode === 'equal' && Number.isFinite(nextShare)
                        ? `Collect ₹${nextShare.toFixed(2)} · Person ${splitPaidCount + 1}`
                        : `Collect ₹${Number.isFinite(nextShare) && nextShare > 0 ? nextShare.toFixed(2) : '0.00'}`}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={[styles.modalCancelBtn, { marginTop: 14 }]} onPress={() => setSplitVisible(false)}>
              <Text style={styles.modalCancelText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ---------- Add Table (Owner/Manager only) ---------- */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAddModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>{newZoneMode ? 'Add Table to a New Floor' : `Add Table to ${activeZone}`}</Text>

            {newZoneMode ? (
              <>
                <Text style={styles.modalLine}>Floor / Zone Name</Text>
                <View style={styles.newZoneInputWrap}>
                  <TextInput
                    style={styles.newZoneInput}
                    value={newZoneName}
                    onChangeText={setNewZoneName}
                    placeholder="e.g. Rooftop, 2nd Floor"
                    placeholderTextColor={COLORS.placeholder}
                    autoFocus
                  />
                </View>
                <TouchableOpacity onPress={() => { setNewZoneMode(false); setNewZoneName(''); }}>
                  <Text style={styles.newZoneToggleText}>Use an existing floor instead</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity onPress={() => setNewZoneMode(true)}>
                <Text style={styles.newZoneToggleText}>+ Create a new floor/zone instead</Text>
              </TouchableOpacity>
            )}

            {/* Table name = the code shown on the tile and recorded on every order placed
                there. Optional on purpose: a cafe that just wants T1, T2, T3… shouldn't have
                to type anything, so blank keeps the old auto-numbering behaviour. */}
            <Text style={[styles.modalLine, { marginTop: 14 }]}>Table Name</Text>
            <View style={styles.newZoneInputWrap}>
              <TextInput
                style={styles.newZoneInput}
                value={newTableName}
                onChangeText={setNewTableName}
                placeholder={`${nextAutoCode} (leave blank to auto-number)`}
                placeholderTextColor={COLORS.placeholder}
                maxLength={20}
                autoCapitalize="characters"
              />
            </View>

            <Text style={[styles.modalLine, { marginTop: 14 }]}>Seats</Text>
            <View style={styles.seatStepperRow}>
              <TouchableOpacity style={styles.seatStepBtn} onPress={() => setNewSeats((n) => Math.max(1, n - 1))}>
                <Text style={styles.seatStepText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.seatValue}>{newSeats}</Text>
              <TouchableOpacity style={styles.seatStepBtn} onPress={() => setNewSeats((n) => n + 1)}>
                <Text style={styles.seatStepText}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={closeAddModal}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalPayBtn} onPress={handleAddTable} disabled={createTable.isPending}>
                {createTable.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Icon name="plus" size={16} color="#FFFFFF" />
                )}
                <Text style={styles.modalPayText}>Add Table</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Edit / Delete Table (Owner/Manager only) ---------- */}
      <Modal
        visible={!!editingTable}
        transparent
        animationType="fade"
        onRequestClose={closeEditModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Edit {editingTable?.code}</Text>

            <Text style={styles.modalLine}>Table Name</Text>
            <View style={styles.newZoneInputWrap}>
              <TextInput
                style={styles.newZoneInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="e.g. T5, Corner Booth"
                placeholderTextColor={COLORS.placeholder}
                maxLength={20}
                autoCapitalize="characters"
              />
            </View>
            {/* Shown only while the name is actually different, so it reads as a consequence
                of what the user just typed rather than a permanent warning they learn to
                ignore. The QR encodes the NAME, so renaming orphans the printed sticker. */}
            {!!editingTable && editName.trim() !== editingTable.code && (
              <Text style={styles.editWarnText}>
                Renaming breaks this table's printed QR code — you'll need to reprint it.
              </Text>
            )}

            <Text style={[styles.modalLine, { marginTop: 14 }]}>Seats</Text>
            <View style={styles.seatStepperRow}>
              <TouchableOpacity style={styles.seatStepBtn} onPress={() => setEditSeats((n) => Math.max(1, n - 1))}>
                <Text style={styles.seatStepText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.seatValue}>{editSeats}</Text>
              <TouchableOpacity style={styles.seatStepBtn} onPress={() => setEditSeats((n) => n + 1)}>
                <Text style={styles.seatStepText}>+</Text>
              </TouchableOpacity>
            </View>

            {confirmingDelete ? (
              <>
                <Text style={[styles.editWarnText, { marginTop: 16 }]}>
                  Delete {editingTable?.code} permanently? Past orders placed here keep their records.
                </Text>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setConfirmingDelete(false)}>
                    <Text style={styles.modalCancelText}>Keep Table</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalDeleteBtn} onPress={handleDeleteTable} disabled={deleteTable.isPending}>
                    {deleteTable.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Icon name="trash-can-outline" size={16} color="#FFFFFF" />
                    )}
                    <Text style={styles.modalPayText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.editDeleteLink} onPress={() => setConfirmingDelete(true)}>
                  <Icon name="trash-can-outline" size={15} color={COLORS.danger} />
                  <Text style={styles.editDeleteLinkText}>Delete this table</Text>
                </TouchableOpacity>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={closeEditModal}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalPayBtn} onPress={handleSaveTable} disabled={updateTable.isPending}>
                    {updateTable.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Icon name="content-save-outline" size={16} color="#FFFFFF" />
                    )}
                    <Text style={styles.modalPayText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Same wastage bargain as the void prompt below, for a quantity cut rather than a
          whole line. */}
      <QtyReasonPrompt editor={qtyEditor} />

      {/* Re-rates one line on this order alone — the menu keeps its own price. */}
      <ItemRatePrompt editor={priceEditor} />

      {/* Reason prompt for anything already cooked or recorded as served — the server requires a
          reason for both, and for a served line it's also where staff say whether the kitchen
          ever actually made it (the only thing that puts stock back). */}
      <VoidReasonPrompt prompt={voidPrompt} />
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, fontScale: number, isDesktopWeb: boolean, isTablet: boolean) => {
  // Tablet+ (isWideLayout — native tablet AND desktop web, see useResponsive) runs every
  // fontSize on this screen through this. It's a single proportional multiplier, so any
  // heading that was already bigger than its sub-text/body stays bigger after scaling —
  // the hierarchy is a ratio, and scaling preserves ratios. No rounding: at fontScale 1
  // (phones — the no-op case) n * 1 must equal n exactly, including the two .5 values
  // below (9.5, 8.5) — Math.round would have silently nudged those on phones too, which
  // is scope this screen's phone layout never asked for. RN fontSize accepts fractions.
  const fs = (n: number) => n * fontScale;
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingTop: isDesktopWeb ? 9 : 9,
    paddingBottom: isDesktopWeb ? 9 : 9,
    gap: isDesktopWeb ? 7 : 7.5,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: fs(14),
    fontWeight: 'bold',
    color: COLORS.heading,
    flex: 1,
  },
  zoneRow: {
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    gap: isDesktopWeb ? 14 : 15,
    marginBottom: isDesktopWeb ? 10 : 10.5,
  },
  zoneTab: {
    alignItems: 'center',
    paddingBottom: isDesktopWeb ? 6 : 6,
  },
  zoneText: {
    fontSize: fs(13),
    fontWeight: '600',
    color: COLORS.muted,
  },
  zoneTextActive: {
    color: COLORS.heading,
    fontWeight: '700',
  },
  zoneUnderline: {
    marginTop: isDesktopWeb ? 4 : 4.5,
    height: 2,
    width: 24,
    backgroundColor: COLORS.heading,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 12 : 12,
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 10 : 10.5,
  },
  filterTrigger: {
    marginHorizontal: 0,
    marginBottom: 0,
    maxWidth: undefined,
  },
  pickerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.proTipBg,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pickerBannerText: { flex: 1, fontSize: fs(12), fontWeight: '600', color: COLORS.heading },
  pickerBannerCancel: { fontSize: fs(12), fontWeight: '700', color: COLORS.accent },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    gap: isDesktopWeb ? 8 : 9,
    marginBottom: isDesktopWeb ? 14 : 15,
    // flex-start, not space-between — tiles are a fixed % width (see tile/tileDesktop),
    // so space-between stretches the *gaps* to fill the row on a zone with only a couple
    // of tables (e.g. Rooftop with 2), shoving one tile to each edge with a huge empty
    // middle instead of the tiles just packing left with a normal gap between them.
    justifyContent: 'flex-start',
  },
  emptyZone: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: isDesktopWeb ? 30 : 30,
    gap: isDesktopWeb ? 7 : 7.5,
  },
  emptyZoneText: {
    fontSize: fs(13),
    color: COLORS.muted,
  },
  tile: {
    width: '46.5%',
    minHeight: 130,
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 10.5,
    justifyContent: 'flex-end',
  },
  // Desktop web only (isDesktopWeb) — 25% smaller than its own original 18% / 150,
  // same ratio as before. `tile` above is what native/APK mobile actually renders,
  // reverted back to its original size. On a tablet-width browser, 13.5% left barely
  // enough room for the status badge and table code to coexist without colliding —
  // wider columns there (fewer per row) instead of shrinking content further.
  tileDesktop: {
    width: isTablet ? '23%' : '13.5%',
    minHeight: 113,
  },
  // Not a valid Shift/Merge target while a picker is active.
  tileDimmed: { opacity: 0.35 },
  tileTopIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  tileStatusBadge: {
    position: 'absolute',
    top: 12,
    maxWidth: '70%',
    paddingHorizontal: isDesktopWeb ? 6 : 6,
    paddingVertical: isDesktopWeb ? 2 : 2.25,
    borderRadius: 999,
    zIndex: 1,
  },
  tileStatusBadgeLeft: {
    left: 12,
  },
  tileStatusBadgeRight: {
    right: 12,
  },
  tileStatusBadgeText: {
    fontSize: fs(9),
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  tileId: {
    fontSize: fs(22),
    fontWeight: 'bold',
    marginBottom: isDesktopWeb ? 4 : 4.5,
  },
  tileMeta: {
    fontSize: fs(12),
    opacity: 0.85,
    marginBottom: isDesktopWeb ? 1 : 1.5,
  },
  tileMetaItalic: {
    fontSize: fs(12),
    fontStyle: 'italic',
    opacity: 0.7,
    marginBottom: isDesktopWeb ? 7 : 7.5,
  },
  tileBill: {
    fontSize: fs(17),
    fontWeight: 'bold',
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  openCheckBtn: {
    backgroundColor: COLORS.background,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 6 : 6,
    alignItems: 'center',
  },
  openCheckText: {
    fontSize: fs(12),
    fontWeight: '700',
    color: COLORS.heading,
  },
  tileSecondaryBtn: { marginTop: 6, alignItems: 'center' },
  tileSecondaryBtnText: { fontSize: fs(10), fontWeight: '700', color: COLORS.muted, textDecorationLine: 'underline' },
  // Mirror of tileTopIcon on the opposite corner. Only empty tiles show this, and their
  // status badge is the right-hand one (tileStatusBadgeRight), so the two never collide.
  tileEditBtn: {
    position: 'absolute',
    top: 10,
    left: 10,
    opacity: 0.75,
    zIndex: 1,
  },
  efficiencyCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 82 : 82.5,
    borderRadius: 8,
    padding: isDesktopWeb ? 13 : 13.5,
  },
  efficiencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: isDesktopWeb ? 12 : 12,
  },
  efficiencyTitle: {
    fontSize: fs(17),
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  diningStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: isDesktopWeb ? 9 : 9,
    paddingVertical: isDesktopWeb ? 4 : 3.75,
  },
  diningStatusText: {
    fontSize: fs(12),
    fontWeight: '700',
  },
  efficiencyStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  efficiencyStat: {
    alignItems: 'center',
  },
  efficiencyLabel: {
    fontSize: fs(12),
    color: COLORS.muted,
    marginBottom: isDesktopWeb ? 3 : 3,
  },
  efficiencyValue: {
    fontSize: fs(20),
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  efficiencyCount: {
    fontSize: fs(11),
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 1 : 1.5,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    // Deliberately NOT COLORS.button/COLORS.heading — that's the exact same dark
    // brown occupied tiles use, so when every table in a zone is occupied the FAB
    // visually vanishes against the grid behind/around it. Accent is distinct from
    // every tile state (empty=cardAlt, occupied=heading).
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.background,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isDesktopWeb ? 18 : 18,
  },
  // maxHeight caps every modal sheet using this style so a ScrollView inside (e.g. the
  // occupied-order modal's occModalScroll) has a bounded height to actually scroll within —
  // without it, a tall order (more items, billing adjustments) just grows the card past the
  // viewport with no way to reach the Settle button. Harmless for the smaller confirm-style
  // modals that also reuse this style; they never get near 90% of the viewport.
  modalSheet: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '94%',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: isDesktopWeb ? 16 : 16.5,
  },
  // Tighter padding for the occupied-order modal specifically (per design request) —
  // scoped here so the other dialogs sharing modalSheet keep their roomier padding.
  occModalSheetTight: {
    padding: isDesktopWeb ? 6 : 10,
  },
  // Occupied-order modal on mobile: full page, not a centered popup — there's a lot to
  // fit (items, bill, payment) and this is the screen a QSR counter lives in all day.
  occFullPage: { flex: 1, backgroundColor: COLORS.background },
  occFullPageInner: { flex: 1, paddingHorizontal: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 12 : 12 },
  // minHeight: 0 overrides a flex item's default min-height:auto — without it, this
  // ScrollView refuses to shrink below its content's natural height and pushes the modal
  // taller than its own maxHeight instead of clipping and actually scrolling.
  occModalScroll: { flex: 1, minHeight: 0, marginTop: isDesktopWeb ? 1 : 3 },
  occModalScrollDesktop: { flex: undefined, maxHeight: 560 },
  occupiedModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 7 : 7.5,
    marginBottom: isDesktopWeb ? 2 : 5,
  },
  // Fixed-size hit target, same pattern as CafeSettingsScreen's header iconBtn — gives the
  // back icon a clean box to center in so it lines up with the title on the row's cross-axis.
  occupiedModalBackBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  occupiedModalTitleText: {
    marginBottom: 0,
  },
  // Print KOT lives in the modal header, matching Token Orders' pill of the same name.
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 3 : 2.25,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 14,
    paddingHorizontal: isDesktopWeb ? 7 : 6.75,
    paddingVertical: isDesktopWeb ? 5 : 3.75,
  },
  headerPillText: { fontSize: fs(12), fontWeight: '700', color: COLORS.heading },
  modalTitle: {
    fontSize: fs(18),
    fontWeight: '800',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 9 : 9,
  },
  modalLine: {
    fontSize: fs(14),
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 2 : 2.5,
  },
  orderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: isDesktopWeb ? 7 : 7.5,
  },
  orderHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 6,
    marginBottom: isDesktopWeb ? 2 : 4.5,
  },
  orderHeaderIconBtn: {
    width: isDesktopWeb ? 30 : 26,
    height: isDesktopWeb ? 30 : 26,
    borderRadius: isDesktopWeb ? 15 : 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.dangerBg,
  },
  orderHeaderIconBtnAccent: {
    backgroundColor: COLORS.proTipBg,
  },
  modalBill: {
    fontSize: fs(24),
    fontWeight: '800',
    color: COLORS.accent,
    marginBottom: isDesktopWeb ? 4 : 4.5,
  },
  modalHint: {
    fontSize: fs(12),
    color: COLORS.muted,
    fontStyle: 'italic',
    marginBottom: isDesktopWeb ? 3 : 3,
  },
  shiftTableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.proTipBg,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  shiftTableBtnText: {
    fontSize: fs(11),
    fontWeight: '700',
    color: COLORS.accent,
  },
  endSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4 : 4.5,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.dangerBg,
    borderRadius: 6,
    paddingHorizontal: isDesktopWeb ? 7 : 7.5,
    paddingVertical: isDesktopWeb ? 4 : 4.5,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  endSessionBtnText: {
    fontSize: fs(11),
    fontWeight: '700',
    color: COLORS.dangerAccent,
  },
  modalActions: {
    flexDirection: 'row',
    gap: isDesktopWeb ? 9 : 9,
    marginTop: isDesktopWeb ? 7 : 8,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.divider,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 10 : 10.5,
  },
  modalCancelText: {
    fontSize: fs(14),
    fontWeight: '700',
    color: COLORS.heading,
  },
  modalPayBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 10 : 10.5,
  },
  // Same shape as modalPayBtn so the confirm strip doesn't re-layout when it replaces
  // Save — only the colour says this one is destructive.
  modalDeleteBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.danger,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 10 : 10.5,
  },
  editWarnText: {
    marginTop: 8,
    fontSize: fs(11),
    lineHeight: fs(15),
    color: COLORS.warning,
  },
  editDeleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
  },
  editDeleteLinkText: {
    fontSize: fs(12),
    fontWeight: '700',
    color: COLORS.danger,
  },
  modalPayText: {
    fontSize: fs(14),
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalPayBtnDisabled: {
    backgroundColor: COLORS.divider,
  },
  // --- Occupied modal: lifecycle sub-views ---
  occItemsScroll: { marginTop: isDesktopWeb ? 2 : 5 },
  occItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 6,
    paddingVertical: isDesktopWeb ? 1.5 : 3.5,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  // 14 on mobile was the largest name font of the three order screens, on the most crowded row
  // of the three (this one carries a line total the others don't). Still routed through fs(), so
  // a cafe running a larger font scale gets its names scaled up from here as before.
  occItemName: { fontSize: fs(isDesktopWeb ? 12.5 : 12), color: COLORS.heading, flex: 1, minWidth: 0 },
  occItemStatusDot: { width: isDesktopWeb ? 7 : 8, height: isDesktopWeb ? 7 : 8, borderRadius: 4 },
  occItemStatusPill: { borderRadius: 6, paddingHorizontal: isDesktopWeb ? 4.5 : 5.25, paddingVertical: isDesktopWeb ? 1 : 1.5 },
  occItemStatusPillText: { fontSize: fs(isDesktopWeb ? 8.5 : 9.5), fontWeight: '800', letterSpacing: 0.3 },
  occUnfiredTag: { backgroundColor: COLORS.dangerAccent, borderRadius: 5, paddingHorizontal: isDesktopWeb ? 4 : 3.75, paddingVertical: isDesktopWeb ? 0.75 : 0.75 },
  occUnfiredTagText: { fontSize: fs(8.5), fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.4 },
  occItemPrice: { fontSize: fs(13), fontWeight: '700', color: COLORS.heading, minWidth: 62, textAlign: 'right' },
  occBatchGroup: { marginTop: isDesktopWeb ? 3 : 7.5 },
  occBatchHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: isDesktopWeb ? 1 : 3 },
  occBatchLabel: { fontSize: fs(isDesktopWeb ? 10 : 11), fontWeight: '700', color: COLORS.muted, letterSpacing: 0.3 },
  occAddItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 4 : 4.5, paddingVertical: isDesktopWeb ? 4 : 6, marginTop: isDesktopWeb ? 1 : 2 },
  occAddItemText: { fontSize: fs(isDesktopWeb ? 12.5 : 14), fontWeight: '700', color: COLORS.accent },
  occBillRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: isDesktopWeb ? 2 : 2.25 },
  occBillLabel: { fontSize: fs(13), color: COLORS.muted },
  occBillVal: { fontSize: fs(13), fontWeight: '600', color: COLORS.heading },
  occBillTotalLabel: { fontSize: fs(15), fontWeight: '800', color: COLORS.heading },
  occBillTotalVal: { fontSize: fs(18), fontWeight: '800', color: COLORS.heading },
  occFieldInput: { flex: 1, backgroundColor: COLORS.cardAlt, borderWidth: INPUT_BORDER_WIDTH, borderColor: COLORS.inputBorder, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 9 : 9, height: 42, fontSize: fs(16), color: COLORS.heading },
  occSplitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 4 : 4.5, backgroundColor: COLORS.cardAlt, borderRadius: 6, paddingVertical: isDesktopWeb ? 4 : 6, marginTop: isDesktopWeb ? 3 : 5 },
  occSplitBtnText: { fontSize: fs(isDesktopWeb ? 12 : 13), fontWeight: '700', color: COLORS.heading },
  occPickerRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7 : 7.5, paddingVertical: isDesktopWeb ? 6 : 6, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  occPickerName: { flex: 1, fontSize: fs(14), color: COLORS.heading },
  occPickerPrice: { fontSize: fs(13), fontWeight: '700', color: COLORS.muted },
  splitWaysRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 9 : 9, marginVertical: isDesktopWeb ? 10 : 10.5 },
  splitStepper: { flexDirection: 'row', alignItems: 'center', gap: 10.5, backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingHorizontal: 7.5, paddingVertical: 3 },
  splitStepBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  splitRemainingVal: { fontSize: fs(14), fontWeight: '800', color: COLORS.accent },
  splitDoneNote: { fontSize: fs(12), color: COLORS.muted, textAlign: 'center', marginVertical: 14 },
  splitModeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  splitModeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  splitModeBtnOn: { borderColor: COLORS.accent, backgroundColor: COLORS.card },
  splitModeText: { fontSize: fs(12), fontWeight: '600', color: COLORS.muted },
  splitModeTextOn: { color: COLORS.accent, fontWeight: '800' },
  // Marks the share the Collect button is currently pointed at, so a biller reading down a
  // list of identical amounts can see which one this tap actually settles.
  splitNextRow: { backgroundColor: COLORS.cardAlt, borderRadius: 6, paddingHorizontal: 6 },
  splitPaidLabel: { color: COLORS.muted, textDecorationLine: 'line-through' },
  splitAmountInput: {
    backgroundColor: COLORS.cardAlt,
    borderWidth: INPUT_BORDER_WIDTH,
    borderColor: COLORS.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: fs(15),
    fontWeight: '700',
    color: COLORS.heading,
    marginTop: 6,
  },
  splitCollectBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
  },
  splitCollectBtnOff: { opacity: 0.45 },
  splitCollectText: { fontSize: fs(14), fontWeight: '800', color: '#FFFFFF' },
  splitStepText: { fontSize: fs(20), fontWeight: '700', color: COLORS.heading },
  splitWaysValue: { fontSize: fs(16), fontWeight: '800', color: COLORS.heading, minWidth: 20, textAlign: 'center' },
  newZoneInput: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 10.5,
    height: 46,
    fontSize: fs(16),
    color: COLORS.heading,
  },
  // The focus ring is a box-shadow the global stylesheet puts on whichever div directly wraps
  // the focused input (see public/index.html), so this wrapper's box has to be exactly the
  // input's visible box — a margin left on the input itself would grow the wrapper and the ring
  // would sit low. Hence the gap below the field lives here, not on newZoneInput.
  newZoneInputWrap: {
    borderRadius: 8,
    marginBottom: 6,
  },
  newZoneToggleText: {
    fontSize: fs(12),
    fontWeight: '700',
    color: COLORS.accent,
    marginBottom: 3,
  },
  seatStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16.5,
    marginVertical: 9,
  },
  seatStepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatStepText: {
    fontSize: fs(24),
    fontWeight: '700',
    color: COLORS.heading,
  },
  seatValue: {
    fontSize: fs(22),
    fontWeight: '800',
    color: COLORS.heading,
    minWidth: 40,
    textAlign: 'center',
  },
  });
};
