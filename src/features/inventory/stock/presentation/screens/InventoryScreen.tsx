import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { showToast } from '../../../../../core/store/uiSlice';
import { RootState } from '../../../../../core/store/rootReducer';
import { canAccessRoute } from '../../../../../core/auth/permissions';
import { usePlanCategory } from '../../../../../core/plan/planCategory';
import {
  useInventory,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useDeleteInventoryItem,
  useReactivateInventoryItem,
  useRestockInventoryItem,
  useLogWaste,
  useAdjustStock,
  useExpiringBatches,
  useBulkImportInventory,
} from '../../../../../core/api/hooks/useInventory';
import { useBranches } from '../../../../../core/api/hooks/useBranches';
import { useMissingRecipeAlerts, useDismissMissingRecipeAlert } from '../../../../../core/api/hooks/useReports';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { InventoryItem, WasteReasonCode, WASTE_REASON_LABELS, InventoryImportRowError } from '../../../../../core/api/inventoryApi';
import { pickAndParseInventorySheet, normalizeInventoryImportRows } from '../../../../../core/utils/csvInventoryImport';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { SearchClearButton } from '../../../../../shared/components/atoms/SearchClearButton';
import { ScreenContainer } from '../../../../../core/components/ScreenContainer';
import { DatePickerModal, isValidDateISO } from '../../../../../shared/components/atoms/DatePickerModal';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const formatRestockDate = (iso: string | null) => {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
};

const WASTE_REASONS: WasteReasonCode[] = ['Spoiled', 'Expired', 'Burnt', 'Spilled', 'TrialTasting', 'StaffMeal', 'Complimentary', 'Broken', 'Other'];

export const InventoryScreen = ({ navigation, route }: any) => {
  const dispatch = useDispatch();
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const activeBranchId = useSelector((s: RootState) => s.branch.activeBranchId);
  // Ledger/Purchase Orders/Vendors/Stock Takes/Variance/Food Cost/Expiring are each their
  // own screen-catalog key, separately grantable under Custom Screen Access — so these
  // header shortcuts need the same check their route guard applies. Otherwise a revoked
  // screen still had a button here that just bounced the user back to MainTabs.
  const user = useSelector((s: RootState) => s.auth.user);
  const { category: planCategory } = usePlanCategory();
  const canOpen = (routeKey: string) => canAccessRoute(user ?? undefined, routeKey, planCategory);
  // Deleted items are soft-deleted, so they're only fetched at all when the user asks to see them.
  const [showDeleted, setShowDeleted] = useState(false);
  const { data: items = [], isLoading } = useInventory(activeBranchId, showDeleted);
  const { data: branches = [] } = useBranches();
  const activeBranchName = activeBranchId === null ? 'All Branches' : branches.find((b) => b.id === activeBranchId)?.name ?? 'All Branches';
  const createInventoryItem = useCreateInventoryItem();
  const updateInventoryItem = useUpdateInventoryItem();
  const deleteInventoryItem = useDeleteInventoryItem();
  const reactivateInventoryItem = useReactivateInventoryItem();
  const restockItem = useRestockInventoryItem();
  const logWaste = useLogWaste();
  const adjustStock = useAdjustStock();
  const bulkImportInventory = useBulkImportInventory();
  const [search, setSearch] = useState('');

  // --- Bulk stock/rate import state ---
  const [importingSheet, setImportingSheet] = useState(false);
  const [importErrors, setImportErrors] = useState<InventoryImportRowError[] | null>(null);

  // --- Add Item modal state ---
  const [addVisible, setAddVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newMax, setNewMax] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newMinStock, setNewMinStock] = useState('');
  const [newReorderLevel, setNewReorderLevel] = useState('');
  const [newExpiry, setNewExpiry] = useState('');
  const [newExpiryPickerVisible, setNewExpiryPickerVisible] = useState(false);

  // --- Edit Item modal state ---
  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editMax, setEditMax] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editMinStock, setEditMinStock] = useState('');
  const [editReorderLevel, setEditReorderLevel] = useState('');

  // --- Restock modal state ---
  const [restockTarget, setRestockTarget] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockCost, setRestockCost] = useState('');
  const [restockExpiry, setRestockExpiry] = useState('');
  const [restockExpiryPickerVisible, setRestockExpiryPickerVisible] = useState(false);

  // --- Waste modal state ---
  const [wasteTarget, setWasteTarget] = useState<InventoryItem | null>(null);
  const [wasteQty, setWasteQty] = useState('');
  const [wasteReason, setWasteReason] = useState<WasteReasonCode>(WASTE_REASONS[0]);
  const [wasteNote, setWasteNote] = useState('');

  const { data: missingRecipeAlerts = [] } = useMissingRecipeAlerts();
  const dismissMissingRecipeAlert = useDismissMissingRecipeAlert();
  const { data: expiringBatches = [] } = useExpiringBatches(7);

  // Arriving from the Expiring Batches screen's "Log Waste" quick action — pre-fill and
  // open the waste modal for that ingredient once its data has loaded.
  useEffect(() => {
    const wasteItemId = route?.params?.wasteItemId;
    if (wasteItemId == null) return;
    const target = items.find((i) => i.id === wasteItemId);
    if (!target) return;
    setWasteTarget(target);
    setWasteQty('');
    setWasteReason((route?.params?.wasteReason as WasteReasonCode | undefined) ?? WASTE_REASONS[0]);
    setWasteNote('');
    navigation.setParams({ wasteItemId: undefined, wasteReason: undefined });
  }, [route?.params?.wasteItemId, items]);

  // --- Adjust modal state ---
  const [adjustTarget, setAdjustTarget] = useState<InventoryItem | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  // --- Dismissed alerts state ---
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<number>>(new Set());

  const handleAddItem = async () => {
    const max = parseFloat(newMax);
    if (!newName.trim()) {
      dispatch(showToast({ message: 'Enter the item name.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (isNaN(max) || max <= 0) {
      dispatch(showToast({ message: 'Enter a valid max stock quantity.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const expiry = newExpiry.trim();
    if (expiry && !isValidDateISO(expiry)) {
      dispatch(showToast({ message: 'Enter a valid expiry date in YYYY-MM-DD format.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await createInventoryItem.mutateAsync({
        name: newName.trim(),
        category: newCategory.trim() || 'General',
        max,
        unit: newUnit.trim() || 'unit',
        minStock: newMinStock.trim() ? parseFloat(newMinStock) : undefined,
        // Reorder level is entered as a % of max stock, but the API stores it as an absolute quantity.
        reorderLevel: newReorderLevel.trim() ? Math.round((max * parseFloat(newReorderLevel)) / 100 * 100) / 100 : undefined,
        branchId: activeBranchId,
        expiryDate: expiry || undefined,
      });
      dispatch(showToast({ message: `${newName.trim()} added to inventory`, icon: 'check-circle-outline', tone: 'success' }));
      setAddVisible(false);
      setNewName('');
      setNewCategory('');
      setNewMax('');
      setNewUnit('');
      setNewMinStock('');
      setNewReorderLevel('');
      setNewExpiry('');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add item'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const openEdit = (item: InventoryItem) => {
    setEditTarget(item);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditMax(String(item.max));
    setEditUnit(item.unit);
    setEditMinStock(item.minStock ? String(item.minStock) : '');
    // reorderLevel is stored as an absolute quantity; show it as % of max for editing.
    setEditReorderLevel(item.reorderLevel ? String(Math.round((item.reorderLevel / item.max) * 100)) : '');
  };

  const handleUpdateItem = async () => {
    if (!editTarget || updateInventoryItem.isPending) return;
    const max = parseFloat(editMax);
    if (!editName.trim()) {
      dispatch(showToast({ message: 'Enter the item name.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (isNaN(max) || max <= 0) {
      dispatch(showToast({ message: 'Enter a valid max stock quantity.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await updateInventoryItem.mutateAsync({
        id: editTarget.id,
        req: {
          name: editName.trim(),
          category: editCategory.trim() || 'General',
          max,
          unit: editUnit.trim() || 'unit',
          minStock: editMinStock.trim() ? parseFloat(editMinStock) : undefined,
          // Reorder level is entered as a % of max stock, but the API stores it as an absolute quantity.
          reorderLevel: editReorderLevel.trim() ? Math.round((max * parseFloat(editReorderLevel)) / 100 * 100) / 100 : undefined,
        },
      });
      dispatch(showToast({ message: `${editName.trim()} updated`, icon: 'check-circle-outline', tone: 'success' }));
      setEditTarget(null);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update item'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  // Soft delete — the item stops showing in the list and in pickers, but its ledger, batches,
  // and any recipe still referencing it keep resolving, so this stays reversible via Restore.
  const confirmDelete = (item: InventoryItem) => {
    Alert.alert(
      'Delete this item?',
      `${item.name} will be hidden from inventory, purchase orders, and recipes. Its stock history is kept and you can restore it later from "Show deleted".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInventoryItem.mutateAsync(item.id);
              setEditTarget(null);
              dispatch(showToast({ message: `${item.name} deleted`, icon: 'trash-can-outline', tone: 'success' }));
            } catch (err) {
              dispatch(showToast({ message: getApiErrorMessage(err, 'Could not delete item'), icon: 'alert-circle-outline', tone: 'danger' }));
            }
          },
        },
      ],
    );
  };

  const handleRestore = async (item: InventoryItem) => {
    try {
      await reactivateInventoryItem.mutateAsync(item.id);
      dispatch(showToast({ message: `${item.name} restored`, icon: 'check-circle-outline', tone: 'success' }));
      // Nothing left to show once the last deleted item is restored — flip the chip back
      // to "Show deleted" instead of leaving it stuck open on an empty state.
      const otherDeletedRemain = items.some((i) => i.id !== item.id && !i.isActive);
      if (!otherDeletedRemain) setShowDeleted(false);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not restore item'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  // Deleted items ride along in `items` when "Show deleted" is on — they must not skew the
  // SKU count, the low-stock alert, or the reorder suggestion.
  const activeItems = items.filter((i) => i.isActive);
  const lowStockCount = activeItems.filter((i) => i.lowStock).length;
  const mostCritical = [...activeItems].sort((a, b) => a.current / (a.max || 1) - b.current / (b.max || 1))[0];
  const daysLeft = mostCritical ? Math.max(0, Math.round((mostCritical.current / (mostCritical.dailyUsage || 1)) * 10) / 10) : 0;

  const openRestock = (item: InventoryItem) => {
    setRestockTarget(item);
    setRestockQty('');
    setRestockCost(item.unitCost ? String(item.unitCost) : '');
    setRestockExpiry('');
  };

  const submitRestock = async () => {
    // BUG FIX #2: Prevent double-click submissions
    if (!restockTarget || restockItem.isPending) return;

    const qty = parseFloat(restockQty);
    if (isNaN(qty) || qty <= 0) {
      dispatch(showToast({ message: 'Enter a restock quantity greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }

    // BUG FIX #4: Validate unit cost is not negative
    const cost = restockCost.trim() ? parseFloat(restockCost) : undefined;
    if (cost !== undefined && cost < 0) {
      dispatch(showToast({ message: 'Unit cost cannot be negative.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }

    const expiry = restockExpiry.trim();
    if (expiry && !isValidDateISO(expiry)) {
      dispatch(showToast({ message: 'Enter a valid expiry date in YYYY-MM-DD format.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await restockItem.mutateAsync({
        id: restockTarget.id,
        req: { quantity: qty, unitCost: cost, expiryDate: expiry || undefined },
      });
      dispatch(showToast({ message: `${restockTarget.name} restocked (+${qty}${restockTarget.unit})`, icon: 'cart-outline', tone: 'success' }));
      setRestockTarget(null);
      setRestockQty('');
      setRestockCost('');
      setRestockExpiry('');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not restock'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const submitWaste = async () => {
    if (!wasteTarget) return;
    const qty = parseFloat(wasteQty);
    if (isNaN(qty) || qty <= 0) {
      dispatch(showToast({ message: 'Enter a waste quantity greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await logWaste.mutateAsync({ id: wasteTarget.id, req: { quantity: qty, reason: wasteReason, note: wasteNote.trim() || undefined } });
      dispatch(showToast({ message: `Logged ${qty}${wasteTarget.unit} waste for ${wasteTarget.name}`, icon: 'delete-outline', tone: 'warning' }));
      setWasteTarget(null);
      setWasteQty('');
      setWasteNote('');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not log waste'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const submitAdjust = async () => {
    if (!adjustTarget) return;
    const qty = parseFloat(adjustQty);
    if (isNaN(qty) || qty < 0) {
      dispatch(showToast({ message: 'Enter the corrected stock count (0 or more).', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }

    // BUG FIX #5: Require adjustment reason
    if (!adjustReason.trim()) {
      dispatch(showToast({ message: 'Provide a reason for this adjustment.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }

    try {
      await adjustStock.mutateAsync({ id: adjustTarget.id, req: { newQuantity: qty, reason: adjustReason.trim() } });
      dispatch(showToast({ message: `${adjustTarget.name} adjusted to ${qty}${adjustTarget.unit}`, icon: 'clipboard-check-outline', tone: 'success' }));
      setAdjustTarget(null);
      setAdjustQty('');
      setAdjustReason('');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not adjust stock'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  // BUG FIX #1: Dismiss missing recipe alert
  const handleDismissMissingRecipeAlert = async (alertId: number) => {
    try {
      await dismissMissingRecipeAlert.mutateAsync(alertId);
      setDismissedAlertIds(prev => new Set([...prev, alertId]));
      dispatch(showToast({ message: 'Alert dismissed', icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not dismiss alert'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleImportSheet = async () => {
    setImportingSheet(true);
    try {
      const picked = await pickAndParseInventorySheet();
      if (!picked) return; // user closed the file dialog without choosing anything
      const parsed = normalizeInventoryImportRows(picked.rows);
      if (parsed.length === 0) {
        dispatch(showToast({
          message: 'No usable rows found. Columns needed: IngredientName, Unit, CurrentStock, UnitCost.',
          icon: 'alert-circle-outline', tone: 'warning',
        }));
        return;
      }
      const result = await bulkImportInventory.mutateAsync({ rows: parsed, branchId: activeBranchId });
      dispatch(showToast({
        message: `Added ${result.itemsCreated} item(s), updated ${result.itemsUpdated}.`
          + (result.rowsWithErrors > 0 ? ` ${result.rowsWithErrors} row(s) had errors.` : ''),
        icon: result.rowsWithErrors > 0 ? 'alert-circle-outline' : 'check-circle',
        tone: result.rowsWithErrors > 0 ? 'warning' : 'success',
      }));
      if (result.errors.length > 0) setImportErrors(result.errors);
    } catch (err) {
      dispatch(showToast({ message: err instanceof Error ? err.message : getApiErrorMessage(err, 'Could not import that file'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setImportingSheet(false);
    }
  };

  return (
    <View style={styles.container}>
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="clipboard-list" size={22} color={COLORS.accent} />
          <Text style={styles.brandTitle} numberOfLines={1}>Inventory</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.headerIconScroll}
            contentContainerStyle={styles.headerIconScrollContent}
          >
            {canOpen('PurchaseOrders') && (
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate('PurchaseOrders')}>
                <Icon name="cart-plus" size={20} color={COLORS.heading} />
              </TouchableOpacity>
            )}
            {canOpen('Vendors') && (
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate('Vendors')}>
                <Icon name="truck-outline" size={20} color={COLORS.heading} />
              </TouchableOpacity>
            )}
            {canOpen('InventoryLedger') && (
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate('InventoryLedger')}>
                <Icon name="format-list-bulleted" size={20} color={COLORS.heading} />
              </TouchableOpacity>
            )}
            {canOpen('StockTakes') && (
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate('StockTakes')}>
                <Icon name="clipboard-list-outline" size={20} color={COLORS.heading} />
              </TouchableOpacity>
            )}
            {canOpen('VarianceReport') && (
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate('VarianceReport')}>
                <Icon name="chart-line" size={20} color={COLORS.heading} />
              </TouchableOpacity>
            )}
            {canOpen('ExpiringBatches') && (
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate('ExpiringBatches')}>
                <Icon name="clock-alert-outline" size={20} color={expiringBatches.length > 0 ? COLORS.dangerAccent : COLORS.heading} />
                {expiringBatches.length > 0 && (
                  <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{expiringBatches.length}</Text></View>
                )}
              </TouchableOpacity>
            )}
            {canOpen('FoodCostReport') && (
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate('FoodCostReport')}>
                <Icon name="percent-outline" size={20} color={COLORS.heading} />
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}
      <DesktopPageHeader icon="clipboard-list-outline" title="Inventory" />
      {isDesktopWeb && (
        <View style={styles.desktopPageHeader}>
          <View style={styles.desktopHeaderActions}>
            {canOpen('InventoryLedger') && (
              <TouchableOpacity style={styles.desktopHeaderBtn} onPress={() => navigation.navigate('InventoryLedger')}>
                <Icon name="format-list-bulleted" size={16} color={COLORS.heading} />
                <Text style={styles.desktopHeaderBtnText}>Ledger</Text>
              </TouchableOpacity>
            )}
            {canOpen('PurchaseOrders') && (
              <TouchableOpacity style={styles.desktopHeaderBtn} onPress={() => navigation.navigate('PurchaseOrders')}>
                <Icon name="cart-plus" size={16} color={COLORS.heading} />
                <Text style={styles.desktopHeaderBtnText}>Purchase Orders</Text>
              </TouchableOpacity>
            )}
            {canOpen('Vendors') && (
              <TouchableOpacity style={styles.desktopHeaderBtn} onPress={() => navigation.navigate('Vendors')}>
                <Icon name="truck-outline" size={16} color={COLORS.heading} />
                <Text style={styles.desktopHeaderBtnText}>Vendors</Text>
              </TouchableOpacity>
            )}
            {canOpen('StockTakes') && (
              <TouchableOpacity style={styles.desktopHeaderBtn} onPress={() => navigation.navigate('StockTakes')}>
                <Icon name="clipboard-list-outline" size={16} color={COLORS.heading} />
                <Text style={styles.desktopHeaderBtnText}>Stock Takes</Text>
              </TouchableOpacity>
            )}
            {canOpen('VarianceReport') && (
              <TouchableOpacity style={styles.desktopHeaderBtn} onPress={() => navigation.navigate('VarianceReport')}>
                <Icon name="chart-line" size={16} color={COLORS.heading} />
                <Text style={styles.desktopHeaderBtnText}>Variance</Text>
              </TouchableOpacity>
            )}
            {canOpen('FoodCostReport') && (
              <TouchableOpacity style={styles.desktopHeaderBtn} onPress={() => navigation.navigate('FoodCostReport')}>
                <Icon name="percent-outline" size={16} color={COLORS.heading} />
                <Text style={styles.desktopHeaderBtnText}>Food Cost</Text>
              </TouchableOpacity>
            )}
            {canOpen('ExpiringBatches') && (
              <TouchableOpacity style={styles.desktopHeaderBtn} onPress={() => navigation.navigate('ExpiringBatches')}>
                <Icon name="clock-alert-outline" size={16} color={expiringBatches.length > 0 ? COLORS.dangerAccent : COLORS.heading} />
                <Text style={[styles.desktopHeaderBtnText, expiringBatches.length > 0 && { color: COLORS.dangerAccent }]}>
                  Expiring{expiringBatches.length > 0 ? ` (${expiringBatches.length})` : ''}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.branchPill} onPress={() => navigation.navigate('Branches')} activeOpacity={0.7}>
        <Icon name="storefront" size={13} color={COLORS.accent} />
        <Text style={styles.branchPillText}>{activeBranchName}</Text>
        <Icon name="chevron-right" size={14} color={COLORS.muted} />
      </TouchableOpacity>

      <ScreenContainer maxWidth={isDesktopWeb ? 1280 : 1000} style={{ flex: 1, width: '100%', alignSelf: 'center' }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <TouchableOpacity style={styles.importBanner} onPress={handleImportSheet} disabled={importingSheet} activeOpacity={0.85}>
          <View style={styles.importBannerIcon}>
            {importingSheet ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <Icon name="file-upload-outline" size={20} color={COLORS.accent} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.importBannerTitle}>Import stock & rates from Excel/CSV</Text>
            <Text style={styles.importBannerDesc}>
              Columns: IngredientName, Unit, CurrentStock, UnitCost (Category, MaxStock, ReorderLevel optional). Stock is set to the figure in the sheet, not added.
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color={COLORS.muted} />
        </TouchableOpacity>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TOTAL ITEMS</Text>
            <Text style={styles.statValue}>{activeItems.length} <Text style={styles.statValueSub}>Active SKU</Text></Text>
          </View>
          <View style={[styles.statCard, styles.alertCard]}>
            <Text style={styles.alertLabel}>LOW STOCK ALERT</Text>
            <View style={styles.alertRow}>
              <Text style={styles.alertValue}>{lowStockCount}</Text>
              <Icon name="alert-circle" size={18} color={COLORS.dangerAccent} />
            </View>
            <Text style={styles.alertDescription}>
              {lowStockCount > 0 ? `Critical restock required for ${mostCritical.name}.` : 'All stock levels healthy.'}
            </Text>
          </View>
        </View>

        {mostCritical && mostCritical.lowStock && (
          <View style={styles.aiPredictionCard}>
            <View style={styles.aiIconBox}>
              <Icon name="creation" size={20} color={COLORS.accent} />
            </View>
            <View style={styles.aiTextBox}>
              <Text style={styles.aiLabel}>REORDER ALERT</Text>
              <Text style={styles.aiText}>
                <Text style={{ fontWeight: '700' }}>{mostCritical.name}</Text> is at or below its reorder level (~{daysLeft}{' '}
                day{daysLeft === 1 ? '' : 's'} left at current usage). Restock now?
              </Text>
            </View>
            <TouchableOpacity style={styles.orderBtn} onPress={() => openRestock(mostCritical)}>
              <Text style={styles.orderBtnText}>Restock</Text>
            </TouchableOpacity>
          </View>
        )}

        {missingRecipeAlerts.filter(a => !dismissedAlertIds.has(a.id)).length > 0 && (
          <View style={styles.missingRecipeCard}>
            <TouchableOpacity
              style={styles.missingRecipeCloseBtn}
              onPress={() => {
                const firstAlert = missingRecipeAlerts.find(a => !dismissedAlertIds.has(a.id));
                if (firstAlert) handleDismissMissingRecipeAlert(firstAlert.id);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={18} color={COLORS.muted} />
            </TouchableOpacity>

            <View style={styles.aiIconBox}>
              <Icon name="chef-hat" size={20} color={COLORS.dangerAccent} />
            </View>
            <View style={styles.aiTextBox}>
              <Text style={styles.missingRecipeLabel}>MISSING RECIPES</Text>
              <Text style={styles.aiText}>
                {missingRecipeAlerts.filter(a => !dismissedAlertIds.has(a.id)).length} item{missingRecipeAlerts.filter(a => !dismissedAlertIds.has(a.id)).length === 1 ? '' : 's'} sold with no recipe on file — no ingredients were
                deducted. Build a recipe so sales actually consume stock.
              </Text>
              {missingRecipeAlerts
                .filter(a => !dismissedAlertIds.has(a.id))
                .slice(0, 3)
                .map((a) => (
                  <View key={a.id} style={styles.missingRecipeRow}>
                    <Text style={styles.missingRecipeItemText} numberOfLines={1}>
                      {a.menuItemName} <Text style={{ color: COLORS.muted }}>×{a.occurrenceCount}</Text>
                    </Text>
                    <TouchableOpacity onPress={() => navigation.navigate('RecipeBuilder', { menuItemId: a.menuItemId })}>
                      <Text style={styles.missingRecipeFixText}>Fix</Text>
                    </TouchableOpacity>
                  </View>
                ))}
            </View>
          </View>
        )}

        <View style={styles.searchRow}>
          <View style={styles.searchWrapper}>
            <Icon name="magnify" size={18} color={COLORS.muted} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { paddingRight: 24 }]}
              placeholder="Search inventory..."
              placeholderTextColor={COLORS.placeholder}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && <SearchClearButton onPress={() => setSearch('')} />}
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Inventory Items</Text>
          <View style={styles.sectionHeaderActions}>
            <TouchableOpacity
              style={[styles.showDeletedChip, showDeleted && styles.showDeletedChipActive]}
              onPress={() => setShowDeleted((v) => !v)}
            >
              <Icon
                name={showDeleted ? 'eye-off-outline' : 'eye-outline'}
                size={13}
                color={showDeleted ? '#FFFFFF' : COLORS.muted}
              />
              <Text style={[styles.showDeletedChipText, showDeleted && styles.showDeletedChipTextActive]}>
                {showDeleted ? 'Hide deleted' : 'Show deleted'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => setAddVisible(true)}>
              <Icon name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Add Item</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isLoading && <SkeletonList rows={5} avatarShape="square" style={{ marginTop: 4 }} />}

        {!isLoading && items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())).map((item) => {
          const ratio = item.max > 0 ? Math.max(0, Math.min(1, item.current / item.max)) : 0;
          return (
            <View key={item.id} style={[styles.itemCard, !item.isActive && styles.itemCardDeleted]}>
              <View style={styles.itemTopRow}>
                <View style={[styles.itemIconBox, item.lowStock && styles.itemIconBoxLow]}>
                  <Icon name={item.icon} size={20} color={item.lowStock ? COLORS.dangerAccent : COLORS.heading} />
                </View>
                <View style={styles.itemInfo}>
                  <View style={styles.itemNameRow}>
                    {!item.isActive && (
                      <View style={styles.deletedBadge}>
                        <Text style={styles.deletedBadgeText}>DELETED</Text>
                      </View>
                    )}
                    {item.isActive && item.lowStock && (
                      <View style={styles.lowStockBadge}>
                        <Text style={styles.lowStockText}>LOW STOCK</Text>
                      </View>
                    )}
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  </View>
                  <Text style={styles.itemCategory}>{item.category}</Text>
                </View>
                <View style={styles.itemCurrentBox}>
                  <Text style={styles.itemCurrentLabel}>CURRENT</Text>
                  <Text style={[styles.itemCurrentValue, item.lowStock && { color: COLORS.dangerAccent }]}>
                    {Math.round(item.current * 100) / 100}{item.unit}
                    <Text style={styles.itemMaxValue}> / {item.max}{item.unit}</Text>
                  </Text>
                </View>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${ratio * 100}%`, backgroundColor: item.lowStock ? COLORS.dangerAccent : COLORS.heading },
                  ]}
                />
              </View>

              <View style={styles.itemBottomRow}>
                <Text style={styles.lastRestock}>Last Restock: {formatRestockDate(item.lastRestockAt)}</Text>
                {item.isActive ? (
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.smallActionBtn} onPress={() => openEdit(item)}>
                      <Icon name="pencil-outline" size={14} color={COLORS.heading} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.smallActionBtn} onPress={() => { setAdjustTarget(item); setAdjustQty(String(item.current)); }}>
                      <Icon name="clipboard-edit-outline" size={14} color={COLORS.heading} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.smallActionBtn} onPress={() => { setWasteTarget(item); setWasteQty(''); setWasteReason(WASTE_REASONS[0]); setWasteNote(''); }}>
                      <Icon name="delete-outline" size={14} color={COLORS.dangerAccent} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.restockBtn, item.lowStock && styles.restockBtnFilled]}
                      onPress={() => openRestock(item)}
                    >
                      <Icon name="cart-outline" size={14} color={item.lowStock ? '#FFFFFF' : COLORS.heading} />
                      <Text style={[styles.restockText, item.lowStock && { color: '#FFFFFF' }]}>Restock</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.restoreBtn}
                    onPress={() => handleRestore(item)}
                    disabled={reactivateInventoryItem.isPending}
                  >
                    <Icon name="restore" size={14} color={COLORS.heading} />
                    <Text style={styles.restoreBtnText}>Restore</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
      </ScreenContainer>

      {/* ---------- Add Item modal ---------- */}
      <Modal visible={addVisible} transparent animationType="fade" onRequestClose={() => setAddVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Add Inventory Item</Text>
              <TouchableOpacity onPress={() => setAddVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalFieldsScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Item name</Text>
              <View style={{ borderRadius: 8 }}>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. Almond Milk"
                  placeholderTextColor={COLORS.placeholder}
                  value={newName}
                  onChangeText={setNewName}
                />
              </View>

              <Text style={styles.fieldLabel}>
                Category <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: '400' }}>(Optional)</Text>
              </Text>
              <View style={{ borderRadius: 8 }}>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. Dairy (defaults to General)"
                  placeholderTextColor={COLORS.placeholder}
                  value={newCategory}
                  onChangeText={setNewCategory}
                />
              </View>

              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Max stock</Text>
                  <View style={{ borderRadius: 8 }}>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. 24"
                      placeholderTextColor={COLORS.placeholder}
                      value={newMax}
                      onChangeText={setNewMax}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Unit</Text>
                  <View style={{ borderRadius: 8 }}>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="L / kg / pcs"
                      placeholderTextColor={COLORS.placeholder}
                      value={newUnit}
                      onChangeText={setNewUnit}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Min stock (optional)</Text>
                  <View style={{ borderRadius: 8 }}>
                    <TextInput
                      style={styles.fieldInput}
                     
                      placeholderTextColor={COLORS.placeholder}
                      value={newMinStock}
                      onChangeText={setNewMinStock}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Reorder level % of max (optional)</Text>
                  <View style={{ borderRadius: 8 }}>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="Defaults to 25"
                      placeholderTextColor={COLORS.placeholder}
                      value={newReorderLevel}
                      onChangeText={setNewReorderLevel}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

              <Text style={styles.fieldLabel}>Expiry date (optional)</Text>
              <TouchableOpacity
                style={[styles.fieldInput, { justifyContent: 'center' }]}
                onPress={() => setNewExpiryPickerVisible(true)}
              >
                <Text style={{ fontSize: 12, color: newExpiry ? COLORS.heading : COLORS.placeholder, paddingTop: 2 }}>
                  {newExpiry || 'YYYY-MM-DD'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtn} onPress={handleAddItem}>
                <Icon name="plus" size={14} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>Add to Inventory</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <DatePickerModal
        visible={newExpiryPickerVisible}
        value={newExpiry}
        title="Select Expiry Date"
        allowFutureDates={true}
        onCancel={() => setNewExpiryPickerVisible(false)}
        onConfirm={(selectedDate) => {
          setNewExpiry(selectedDate);
          setNewExpiryPickerVisible(false);
        }}
      />

      {/* ---------- Edit Item modal ---------- */}
      <Modal visible={!!editTarget} transparent animationType="fade" onRequestClose={() => setEditTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Edit Item</Text>
              <TouchableOpacity onPress={() => setEditTarget(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Current stock stays at {editTarget ? Math.round(editTarget.current * 100) / 100 : 0}{editTarget?.unit} — use Adjust or Restock to change it.
            </Text>

            <ScrollView style={styles.modalFieldsScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Item name</Text>
              <View style={{ borderRadius: 8 }}>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. Almond Milk"
                  placeholderTextColor={COLORS.placeholder}
                  value={editName}
                  onChangeText={setEditName}
                />
              </View>

              <Text style={styles.fieldLabel}>Category</Text>
              <View style={{ borderRadius: 8 }}>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. Dairy (defaults to General)"
                  placeholderTextColor={COLORS.placeholder}
                  value={editCategory}
                  onChangeText={setEditCategory}
                />
              </View>

              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Max stock</Text>
                  <View style={{ borderRadius: 8 }}>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. 24"
                      placeholderTextColor={COLORS.placeholder}
                      value={editMax}
                      onChangeText={setEditMax}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Unit</Text>
                  <View style={{ borderRadius: 8 }}>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="L / kg / pcs"
                      placeholderTextColor={COLORS.placeholder}
                      value={editUnit}
                      onChangeText={setEditUnit}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Min stock (optional)</Text>
                  <View style={{ borderRadius: 8 }}>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="Planning floor"
                      placeholderTextColor={COLORS.placeholder}
                      value={editMinStock}
                      onChangeText={setEditMinStock}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Reorder level % of max (optional)</Text>
                  <View style={{ borderRadius: 8 }}>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="Defaults to 25"
                      placeholderTextColor={COLORS.placeholder}
                      value={editReorderLevel}
                      onChangeText={setEditReorderLevel}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateItem} disabled={updateInventoryItem.isPending}>
                {updateInventoryItem.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Icon name="content-save-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteItemBtn}
                onPress={() => editTarget && confirmDelete(editTarget)}
                disabled={deleteInventoryItem.isPending}
              >
                <Icon name="trash-can-outline" size={14} color={COLORS.dangerAccent} />
                <Text style={styles.deleteItemBtnText}>Delete this item</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---------- Restock modal ---------- */}
      <Modal visible={!!restockTarget} transparent animationType="fade" onRequestClose={() => setRestockTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Restock {restockTarget?.name}</Text>
              <TouchableOpacity onPress={() => setRestockTarget(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Current: {restockTarget ? Math.round(restockTarget.current * 100) / 100 : 0}{restockTarget?.unit}</Text>

            <Text style={styles.fieldLabel}>Quantity to add</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={styles.fieldInput}
                placeholder={`e.g. 10${restockTarget?.unit ?? ''}`}
                placeholderTextColor={COLORS.placeholder}
                value={restockQty}
                onChangeText={setRestockQty}
                keyboardType="numeric"
              />
            </View>

            <Text style={styles.fieldLabel}>Unit cost (optional)</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={styles.fieldInput}
                placeholder="₹ per unit"
                placeholderTextColor={COLORS.placeholder}
                value={restockCost}
                onChangeText={setRestockCost}
                keyboardType="numeric"
              />
            </View>

            <Text style={styles.fieldLabel}>Expiry date (optional)</Text>
            <TouchableOpacity
              style={[styles.fieldInput, { justifyContent: 'center' }]}
              onPress={() => setRestockExpiryPickerVisible(true)}
            >
              <Text style={{ fontSize: 12, color: restockExpiry ? COLORS.heading : COLORS.placeholder, paddingTop: 2 }}>
                {restockExpiry || 'YYYY-MM-DD'}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRestockTarget(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, restockItem.isPending && styles.modalSaveBtnDisabled]}
                onPress={submitRestock}
                disabled={restockItem.isPending}
                activeOpacity={restockItem.isPending ? 1 : 0.8}
              >
                {restockItem.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Icon name="check" size={14} color="#FFFFFF" />
                    <Text style={styles.modalSaveText}>Restock</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Waste modal ---------- */}
      <Modal visible={!!wasteTarget} transparent animationType="fade" onRequestClose={() => setWasteTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Log Waste — {wasteTarget?.name}</Text>
              <TouchableOpacity onPress={() => setWasteTarget(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Quantity wasted</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={styles.fieldInput}
                placeholder={`e.g. 1${wasteTarget?.unit ?? ''}`}
                placeholderTextColor={COLORS.placeholder}
                value={wasteQty}
                onChangeText={setWasteQty}
                keyboardType="numeric"
              />
            </View>

            <Text style={styles.fieldLabel}>Reason</Text>
            <View style={styles.reasonPickerRow}>
              {WASTE_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[styles.reasonPill, wasteReason === reason && styles.reasonPillActive]}
                  onPress={() => setWasteReason(reason)}
                >
                  <Text style={[styles.reasonText, wasteReason === reason && styles.reasonTextActive]}>{WASTE_REASON_LABELS[reason]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={styles.fieldInput}
                placeholder="Any extra detail..."
                placeholderTextColor={COLORS.placeholder}
                value={wasteNote}
                onChangeText={setWasteNote}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setWasteTarget(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={submitWaste}>
                <Icon name="check" size={14} color="#FFFFFF" />
                <Text style={styles.modalSaveText}>Log Waste</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Adjust Stock modal ---------- */}
      <Modal visible={!!adjustTarget} transparent animationType="fade" onRequestClose={() => setAdjustTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Adjust Stock — {adjustTarget?.name}</Text>
              <TouchableOpacity onPress={() => setAdjustTarget(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Set the exact quantity after a physical count.</Text>

            <Text style={styles.fieldLabel}>New quantity</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={styles.fieldInput}
                placeholder={`e.g. 12${adjustTarget?.unit ?? ''}`}
                placeholderTextColor={COLORS.placeholder}
                value={adjustQty}
                onChangeText={setAdjustQty}
                keyboardType="numeric"
              />
            </View>

            <Text style={styles.fieldLabel}>Reason for adjustment</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.fieldInput, styles.multilineInput]}
                placeholder="e.g., Spillage, Theft, Data error, Broken items"
                placeholderTextColor={COLORS.placeholder}
                value={adjustReason}
                onChangeText={setAdjustReason}
                multiline
                numberOfLines={2}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAdjustTarget(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={submitAdjust}>
                <Icon name="check" size={14} color="#FFFFFF" />
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <DatePickerModal
        visible={restockExpiryPickerVisible}
        value={restockExpiry}
        title="Select Expiry Date"
        allowFutureDates={true}
        onCancel={() => setRestockExpiryPickerVisible(false)}
        onConfirm={(selectedDate) => {
          setRestockExpiry(selectedDate);
          setRestockExpiryPickerVisible(false);
        }}
      />

      <Modal visible={importErrors !== null} transparent animationType="fade" onRequestClose={() => setImportErrors(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Import row errors</Text>
              <TouchableOpacity onPress={() => setImportErrors(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              These rows were skipped. Fix them in the sheet and re-import — everything else already went through.
            </Text>
            <ScrollView style={styles.modalFieldsScroll} showsVerticalScrollIndicator={false}>
              {(importErrors ?? []).map((e, idx) => (
                <View key={idx} style={styles.importErrorRow}>
                  <Text style={styles.importErrorRowNumber}>Row {e.rowNumber}</Text>
                  <Text style={styles.importErrorText}>
                    <Text style={{ fontWeight: '600' }}>{e.name}</Text> — {e.reason}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  desktopPageHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: 12,
    paddingHorizontal: isDesktopWeb ? 20 : 30,
    paddingBottom: isDesktopWeb ? 12 : 12,
  },
  desktopHeaderActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    gap: isDesktopWeb ? 7 : 7.5,
  },
  desktopHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4 : 4.5,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 6,
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    paddingVertical: isDesktopWeb ? 6 : 6.75,
  },
  desktopHeaderBtnText: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 7 : 7.5,
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingTop: isDesktopWeb ? 8 : 9,
    paddingBottom: isDesktopWeb ? 8 : 9,
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.heading,
    flex: 1,
  },
  headerIconScroll: {
    flexShrink: 0,
    flexGrow: 0,
    maxWidth: 140,
  },
  headerIconScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: COLORS.dangerAccent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: isDesktopWeb ? 2 : 2.25,
  },
  headerBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  branchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4 : 3.75,
    alignSelf: 'flex-start',
    marginLeft: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.aiCardBg,
    borderRadius: 12,
    paddingHorizontal: isDesktopWeb ? 7 : 7.5,
    paddingVertical: isDesktopWeb ? 4 : 3.75,
  },
  branchPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    gap: isDesktopWeb ? 9 : 9,
    marginBottom: isDesktopWeb ? 12 : 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 10.5,
  },
  alertCard: {
    backgroundColor: '#FBEAE6',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  statValue: {
    fontSize: isDesktopWeb ? 22 : 12,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  statValueSub: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
  },
  alertLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.dangerAccent,
    letterSpacing: 0.5,
    marginBottom: isDesktopWeb ? 6 : 4.5,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4 : 4.5,
    marginBottom: isDesktopWeb ? 6 : 4.5,
  },
  alertValue: {
    fontSize: isDesktopWeb ? 22 : 12,
    fontWeight: 'bold',
    color: COLORS.dangerAccent,
  },
  alertDescription: {
    fontSize: 10,
    color: COLORS.heading,
    lineHeight: 14,
  },
  aiPredictionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.aiCardBg,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 10.5,
    marginBottom: isDesktopWeb ? 12 : 12,
    gap: isDesktopWeb ? 7 : 7.5,
  },
  aiIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTextBox: {
    flex: 1,
  },
  aiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
    marginBottom: isDesktopWeb ? 2 : 2.25,
  },
  aiText: {
    fontSize: 12,
    color: COLORS.heading,
    lineHeight: 16,
  },
  missingRecipeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.dangerBg,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 10.5,
    marginBottom: isDesktopWeb ? 12 : 12,
    gap: isDesktopWeb ? 7 : 7.5,
  },
  missingRecipeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.dangerAccent,
    marginBottom: isDesktopWeb ? 2 : 2.25,
  },
  missingRecipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 7 : 7.5,
    marginTop: isDesktopWeb ? 6 : 6,
  },
  missingRecipeItemText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  missingRecipeFixText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
  },
  orderBtn: {
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    paddingVertical: isDesktopWeb ? 6 : 6,
  },
  orderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    gap: isDesktopWeb ? 7 : 7.5,
    marginBottom: isDesktopWeb ? 12 : 12,
  },
  searchWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.heading,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 9 : 9,
  },
  sectionTitle: {
    fontSize: isDesktopWeb ? 20 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 6,
  },
  showDeletedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4 : 3.75,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 6,
    paddingHorizontal: isDesktopWeb ? 7 : 7.5,
    paddingVertical: isDesktopWeb ? 6 : 5.75,
  },
  showDeletedChipActive: {
    backgroundColor: COLORS.muted,
    borderColor: COLORS.muted,
  },
  showDeletedChipText: {
    fontSize: isDesktopWeb ? 12 : 11,
    fontWeight: '700',
    color: COLORS.muted,
  },
  showDeletedChipTextActive: {
    color: '#FFFFFF',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4 : 3.75,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    paddingVertical: isDesktopWeb ? 6 : 6.75,
  },
  addBtnText: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isDesktopWeb ? 18 : 18,
  },
  modalSheet: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: isDesktopWeb ? 12 : 12,
    overflow: 'hidden',
  },
  modalFieldsScroll: {
    flexGrow: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  modalTitle: {
    fontSize: isDesktopWeb ? 16 : 14,
    fontWeight: '800',
    color: COLORS.heading,
    flexShrink: 1,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  importBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 9 : 9,
    backgroundColor: COLORS.aiCardBg,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 9 : 9,
    marginBottom: isDesktopWeb ? 12 : 12,
  },
  importBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.heading,
  },
  importBannerDesc: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 2 : 1.5,
  },
  importErrorRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  importErrorRowNumber: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.dangerAccent,
    marginBottom: 2,
  },
  importErrorText: {
    fontSize: 12,
    color: COLORS.heading,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    marginBottom: isDesktopWeb ? 3 : 3,
    marginTop: isDesktopWeb ? 4 : 4.5,
  },
  fieldInput: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 34,
    fontSize: 12,
    color: COLORS.heading,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: isDesktopWeb ? 6 : 6,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 7 : 7.5,
    marginTop: isDesktopWeb ? 9 : 9,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalActions: {
    flexDirection: 'row',
    gap: isDesktopWeb ? 6 : 6,
    marginTop: isDesktopWeb ? 9 : 9,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 7 : 7.5,
  },
  modalCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  modalSaveBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 7 : 7.5,
  },
  modalSaveBtnDisabled: {
    opacity: 0.6,
  },
  modalSaveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  missingRecipeCloseBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 8,
    zIndex: 10,
  },
  multilineInput: {
    textAlignVertical: 'top',
    minHeight: 50,
  },
  reasonPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: isDesktopWeb ? 6 : 6,
  },
  reasonPill: {
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    paddingVertical: isDesktopWeb ? 6 : 6,
    borderRadius: 20,
    backgroundColor: COLORS.cardAlt,
  },
  reasonPillActive: {
    backgroundColor: COLORS.button,
  },
  reasonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
  },
  reasonTextActive: {
    color: '#FFFFFF',
  },
  itemCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 10.5,
    marginBottom: isDesktopWeb ? 9 : 9,
  },
  itemCardDeleted: {
    opacity: 0.6,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderStyle: 'dashed',
  },
  itemTopRow: {
    flexDirection: 'row',
    marginBottom: isDesktopWeb ? 7 : 7.5,
  },
  itemIconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.aiCardBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: isDesktopWeb ? 7 : 7.5,
  },
  itemIconBoxLow: {
    backgroundColor: COLORS.dangerBg,
  },
  itemInfo: {
    flex: 1,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: isDesktopWeb ? 4 : 4.5,
    marginBottom: isDesktopWeb ? 2 : 1.5,
  },
  lowStockBadge: {
    backgroundColor: COLORS.dangerBg,
    paddingHorizontal: isDesktopWeb ? 4 : 4.5,
    paddingVertical: isDesktopWeb ? 2 : 1.5,
    borderRadius: 6,
  },
  lowStockText: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.dangerAccent,
  },
  deletedBadge: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: isDesktopWeb ? 4 : 4.5,
    paddingVertical: isDesktopWeb ? 2 : 1.5,
    borderRadius: 6,
  },
  deletedBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.muted,
  },
  itemName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
    flexShrink: 1,
  },
  itemCategory: {
    fontSize: 12,
    color: COLORS.muted,
  },
  itemCurrentBox: {
    alignItems: 'flex-end',
  },
  itemCurrentLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.muted,
    marginBottom: 1.5,
  },
  itemCurrentValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  itemMaxValue: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.muted,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.background,
    marginBottom: 7.5,
  },
  progressFill: {
    height: 5,
    borderRadius: 3,
  },
  itemBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastRestock: {
    fontSize: 11,
    color: COLORS.muted,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.75,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5.25,
  },
  restockBtnFilled: {
    backgroundColor: COLORS.button,
    borderColor: COLORS.button,
  },
  restockText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.75,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5.25,
  },
  restoreBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  deleteItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 6,
    borderWidth: 1,
    borderColor: COLORS.dangerAccent,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 7 : 7.5,
    marginTop: isDesktopWeb ? 6 : 6,
  },
  deleteItemBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.dangerAccent,
  },
});
