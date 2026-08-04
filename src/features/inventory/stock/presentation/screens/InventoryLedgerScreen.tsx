import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useInventoryTransactions } from '../../../../../core/api/hooks/useInventory';
import { InventoryTransactionType, InventoryTransaction } from '../../../../../core/api/inventoryApi';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { RootState } from '../../../../../core/store/rootReducer';
import { GlobalSearchTrigger } from '../../../../../shared/components/search/GlobalSearchTrigger';
import { SearchClearButton } from '../../../../../shared/components/atoms/SearchClearButton';
import { CategoryFilterModal, CategoryFilterTrigger } from '../../../../../shared/components/molecules/CategoryFilterModal';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const ALL_TYPES: InventoryTransactionType[] = ['Sale', 'Purchase', 'Waste', 'ManualAdjustment', 'Expired', 'Return', 'Transfer'];

const DATE_RANGES = [
  { label: '7D', days: 7 },
  { label: '15D', days: 15 },
  { label: '1M', days: 30 },
] as const;
type DateRangeDays = typeof DATE_RANGES[number]['days'];

const TYPE_STYLES: Record<InventoryTransactionType, { bg: string; color: string; icon: string }> = {
  Sale: { bg: '#E3F2FD', color: '#1976D2', icon: 'cart-arrow-down' },
  Purchase: { bg: '#E8F5E9', color: '#388E3C', icon: 'cart-plus' },
  ManualAdjustment: { bg: '#FFF3E0', color: '#F57C00', icon: 'clipboard-edit-outline' },
  Waste: { bg: '#FFEBEE', color: '#C62828', icon: 'delete-outline' },
  Expired: { bg: '#FFEBEE', color: '#C62828', icon: 'calendar-remove' },
  Return: { bg: '#E8F5E9', color: '#388E3C', icon: 'keyboard-return' },
  Transfer: { bg: '#F3E5F5', color: '#7B1FA2', icon: 'swap-horizontal' },
};

const formatTimestamp = (iso: string) => {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
};

export const InventoryLedgerScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const activeBranchId = useSelector((s: RootState) => s.branch.activeBranchId);

  const [selectedType, setSelectedType] = useState<InventoryTransactionType | 'All'>('All');
  const [search, setSearch] = useState('');
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const [rangeDays, setRangeDays] = useState<DateRangeDays>(7);
  const [page, setPage] = useState(1);
  // Every page fetched so far for the current range/type, keyed by page
  // number so a "Load More" tap only appends rather than re-merging.
  const [accumulated, setAccumulated] = useState<InventoryTransaction[]>([]);

  // Cutoff for the selected range — dateFrom is passed to the API too, for
  // when the deployed backend starts honoring it.
  const rangeStart = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - rangeDays);
    return d;
  }, [rangeDays]);

  const changeRange = (days: DateRangeDays) => {
    setRangeDays(days);
    setPage(1);
    setAccumulated([]);
  };

  // Always request the backend's max page size — a busy week can easily have
  // more rows than a quiet month, so guessing a smaller size by date range
  // isn't reliable. "Load More" fetches further pages within this same
  // range/type instead of silently dropping anything past the first page.
  const MAX_PAGE_SIZE = 200;

  const { data: response, isLoading, isError, refetch } = useInventoryTransactions({
    types: selectedType === 'All' ? ALL_TYPES : [selectedType],
    branchId: activeBranchId ?? undefined,
    dateFrom: rangeStart.toISOString(),
    pageNumber: page,
    pageSize: MAX_PAGE_SIZE,
  });

  // Handle both old flat array format and new paged result format.
  const pageItems = Array.isArray(response) ? response : (response?.items ?? []);
  // Old deployed backend returns a flat array with no pagination metadata —
  // in that case there's nothing more to load, so the button stays hidden.
  const totalPages = !Array.isArray(response) ? response?.totalPages ?? 1 : 1;
  const hasMorePages = page < totalPages;

  React.useEffect(() => {
    if (pageItems.length === 0) return;
    setAccumulated(prev => (page === 1 ? pageItems : [...prev, ...pageItems]));
    // pageItems intentionally excluded — it's a new array identity every
    // render; re-running only when the page (or its data) actually changes
    // is what avoids an infinite loop here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, response]);

  const transactions = page === 1 ? pageItems : accumulated;

  const loadMore = () => setPage(p => p + 1);

  // Client-side filtering — the deployed API doesn't honor the `types`/`dateFrom`
  // query params (older backend build), so filter here too rather than trust the response.
  // `countBase` applies every filter EXCEPT type, so per-type counts in the filter
  // modal reflect the current date range/search rather than being stuck at whatever
  // type happens to be selected right now.
  const countBase = transactions
    .filter(t => new Date(t.createdAt) >= rangeStart)
    .filter(t =>
      !search.trim() ||
      t.inventoryItemName.toLowerCase().includes(search.toLowerCase()) ||
      t.userName.toLowerCase().includes(search.toLowerCase())
    );
  const filteredTransactions = selectedType === 'All' ? countBase : countBase.filter(t => t.type === selectedType);

  const typeFilterLabels = ['All', ...ALL_TYPES];
  const typeFilterCounts = typeFilterLabels.reduce<Record<string, number>>((acc, label) => {
    acc[label] = label === 'All' ? countBase.length : countBase.filter(t => t.type === label).length;
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      <DesktopPageHeader
        icon="swap-horizontal"
        title="Inventory Ledger"
        onBack={() => navigation.goBack()}
        right={(
          <View style={styles.rangeGroup}>
            {DATE_RANGES.map(r => (
              <TouchableOpacity
                key={r.label}
                style={[styles.rangeChip, rangeDays === r.days && styles.rangeChipActive]}
                onPress={() => changeRange(r.days)}
              >
                <Text style={[styles.rangeChipText, rangeDays === r.days && styles.rangeChipTextActive]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {!isDesktopWeb && (
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="arrow-left" size={22} color={COLORS.heading} />
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>Inventory Ledger</Text>
            <View style={styles.headerRight}>
              <View style={styles.rangeGroup}>
                {DATE_RANGES.map(r => (
                  <TouchableOpacity
                    key={r.label}
                    style={[styles.rangeChip, rangeDays === r.days && styles.rangeChipActive]}
                    onPress={() => changeRange(r.days)}
                  >
                    <Text style={[styles.rangeChipText, rangeDays === r.days && styles.rangeChipTextActive]}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <GlobalSearchTrigger navigation={navigation} style={styles.searchIconBtn} />
            </View>
          </View>
        )}

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Icon name="magnify" size={18} color={COLORS.muted} style={styles.searchIcon} />
          <View style={styles.searchInputWrap}>
            <TextInput
              style={[styles.searchInput, { paddingRight: 24 }]}
              placeholder="Search items or users..."
              placeholderTextColor={COLORS.muted}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && <SearchClearButton onPress={() => setSearch('')} />}
          </View>
        </View>

        {/* Type Filter */}
        <CategoryFilterTrigger
          label={`${selectedType} · ${typeFilterCounts[selectedType]}`}
          onPress={() => setTypePickerVisible(true)}
        />
        <CategoryFilterModal
          visible={typePickerVisible}
          onClose={() => setTypePickerVisible(false)}
          title="Filter by Type"
          categories={typeFilterLabels}
          activeCategory={selectedType}
          counts={typeFilterCounts}
          onSelect={(label) => {
            setSelectedType(label as InventoryTransactionType | 'All');
            setPage(1);
            setAccumulated([]);
          }}
        />

        {isError && filteredTransactions.length === 0 ? (
          <ErrorState
            title="Couldn't load ledger"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : (
          <View style={styles.tableCard}>
            {isLoading && page === 1 && (
              <View style={{ padding: 16 }}>
                <SkeletonList rows={6} />
              </View>
            )}
            {!(isLoading && page === 1) && filteredTransactions.length === 0 && (
              <Text style={styles.emptyText}>No stock movements found.</Text>
            )}

            {!(isLoading && page === 1) &&
              filteredTransactions.map((t: InventoryTransaction, index: number) => {
                const { date, time } = formatTimestamp(t.createdAt);
                const style = TYPE_STYLES[t.type];
                const positive = t.changedQuantity >= 0;
                return (
                  <View key={t.id} style={[styles.row, index !== filteredTransactions.length - 1 && styles.rowDivider]}>
                    <View style={[styles.typeIconBox, { backgroundColor: style.bg }]}>
                      <Icon name={style.icon} size={16} color={style.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{t.inventoryItemName}</Text>
                      <Text style={styles.metaText}>
                        {date} · {time} · {t.userName}
                        {t.reason ? ` · ${t.reason}` : ''}
                        {t.referenceId ? ` · #${t.referenceId}` : ''}
                      </Text>
                      {t.wasteReasonCode && <Text style={styles.wasteReasonText}>{t.wasteReasonCode}</Text>}
                    </View>
                    <View style={styles.qtyBox}>
                      <Text style={[styles.qtyText, { color: positive ? COLORS.success : COLORS.dangerAccent }]}>
                        {positive ? '+' : ''}{Math.round(t.changedQuantity * 1000) / 1000}
                      </Text>
                      <Text style={styles.remainingText}>→ {Math.round(t.remainingStock * 1000) / 1000}</Text>
                    </View>
                  </View>
                );
              })}
          </View>
        )}

        {hasMorePages && (
          <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore} disabled={isLoading}>
            {isLoading && page > 1 ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <Text style={styles.loadMoreText}>Load More</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};


const makeStyles = (COLORS: any, isDesktopWeb: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: isDesktopWeb ? 12 : 12,
      marginBottom: isDesktopWeb ? 12 : 12,
      marginTop: isDesktopWeb ? 9 : 9,
      gap: 10,
    },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
    rangeGroup: { flexDirection: 'row', backgroundColor: COLORS.chipBg, borderRadius: 14, padding: 2, gap: 2 },
    rangeChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 },
    rangeChipActive: { backgroundColor: COLORS.chipActiveBg },
    rangeChipText: { fontSize: 10.5, fontWeight: '700', color: COLORS.heading },
    rangeChipTextActive: { color: '#ffffff' },
    searchIconBtn: { width: 32, height: 32 },
    title: { flex: 1, fontSize: isDesktopWeb ? 20 : 18, fontWeight: 'bold', color: COLORS.heading },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.cardAlt,
      marginHorizontal: 12,
      marginBottom: 12,
      borderRadius: 8,
      paddingHorizontal: 10,
      height: 40,
    },
    searchIcon: { marginRight: 8 },
    searchInputWrap: { flex: 1, borderRadius: 8 },
    searchInput: { width: '100%', fontSize: 13, color: COLORS.heading, paddingVertical: 8 },
    tableCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: 12, borderRadius: 8, overflow: 'hidden', marginBottom: 20 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
    typeIconBox: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    itemName: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
    metaText: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
    wasteReasonText: { fontSize: 9, color: COLORS.muted, fontStyle: 'italic', marginTop: 2 },
    qtyBox: { alignItems: 'flex-end' },
    qtyText: { fontSize: 12, fontWeight: '700' },
    remainingText: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
    emptyText: { padding: 16, color: COLORS.muted, fontSize: 13, textAlign: 'center' },
    loadMoreBtn: {
      marginHorizontal: 12,
      marginTop: 4,
      marginBottom: 20,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: COLORS.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadMoreText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  });
