import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector, useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useVarianceReport } from '../../../../../core/api/hooks/useReports';
import { useBranches } from '../../../../../core/api/hooks/useBranches';
import { RootState } from '../../../../../core/store/rootReducer';
import { showToast } from '../../../../../core/store/uiSlice';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { SearchClearButton } from '../../../../../shared/components/atoms/SearchClearButton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DateRangeFilter, RangePreset, rangeForPreset, rangeLabelFor } from '../../../../../shared/components/reports/DateRangeFilter';
import { ReportExportService } from '../../../../../core/utils/reportExport';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const round = (n: number) => Math.round(n * 1000) / 1000;

export const VarianceReportScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const activeBranchId = useSelector((s: RootState) => s.branch.activeBranchId);
  const { data: branches = [] } = useBranches();
  const activeBranchName = activeBranchId === null ? 'All Branches' : branches.find((b) => b.id === activeBranchId)?.name ?? 'All Branches';
  const range = rangeForPreset(preset, customFrom, customTo);
  const rangeLabel = rangeLabelFor(preset, customFrom, customTo);
  const { data: rows = [], isLoading, isError, refetch } = useVarianceReport({ ...range, branchId: activeBranchId });

  const filtered = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));

  const runExport = async (format: 'pdf' | 'excel') => {
    setExporting(format);
    try {
      const def = {
        title: 'Variance Report',
        businessName: activeBranchName,
        dateRangeLabel: `${rangeLabel} · ${activeBranchName}`,
        sections: [{
          title: 'Ingredient variance',
          columns: [
            { key: 'name', label: 'Ingredient' },
            { key: 'theoretical', label: 'Theoretical Used', align: 'right' as const },
            { key: 'purchased', label: 'Purchased', align: 'right' as const },
            { key: 'wasted', label: 'Wasted', align: 'right' as const },
            { key: 'variance', label: 'Last Count Variance', align: 'right' as const },
          ],
          rows: filtered.map((r) => ({
            name: r.name,
            theoretical: `${round(r.theoreticalConsumption)} ${r.unit}`,
            purchased: `${round(r.purchasedQty)} ${r.unit}`,
            wasted: `${round(r.wastageQty)} ${r.unit}`,
            variance: r.latestStockTakeVariance === null ? 'No count yet' : `${round(r.latestStockTakeVariance)} ${r.unit}`,
          })),
        }],
      };
      if (format === 'pdf') await ReportExportService.exportToPDF(def);
      else await ReportExportService.exportToExcel(def);
    } catch (e: any) {
      dispatch(showToast({ message: e?.message ?? 'Could not build the report file.', icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setExporting(null);
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="scale-balance" title="Variance Report" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {!isDesktopWeb && (
          <>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="arrow-left" size={22} color={COLORS.heading} />
              </TouchableOpacity>
              <Text style={styles.title} numberOfLines={1}>Variance Report</Text>
            </View>
            <Text style={styles.subtitle}>
              Theoretical consumption (what recipes say you should have used) vs purchases, wastage, and the latest
              physical stock-take correction.
            </Text>
          </>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 16 : 12 }}>
          <DateRangeFilter preset={preset} customFrom={customFrom} customTo={customTo} onChange={(p, f, t) => { setPreset(p); setCustomFrom(f); setCustomTo(t); }} />
          <Text style={{ fontSize: 12, color: COLORS.muted, fontWeight: '600' }}>{activeBranchName}</Text>
        </View>

        <View style={styles.searchWrapper}>
          <Icon name="magnify" size={18} color={COLORS.muted} style={{ marginRight: 8 }} />
          <View style={styles.searchInputWrap}>
            <TextInput
              style={[styles.searchInput, { paddingRight: 24 }]}
              placeholder="Search ingredient..."
              placeholderTextColor={COLORS.placeholder}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && <SearchClearButton onPress={() => setSearch('')} />}
          </View>
        </View>

        {isError && rows.length === 0 ? (
          <ErrorState title="Couldn't load variance report" message="Check your connection and try again." onRetry={() => refetch()} />
        ) : (
          <View style={styles.tableCard}>
            {isLoading && (
              <View style={{ padding: 16 }}>
                <SkeletonList rows={6} />
              </View>
            )}
            {!isLoading && filtered.length === 0 && (
              <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No ingredient activity in this period.</Text>
            )}

            {filtered.map((r, index) => {
              const hasStockTake = r.latestStockTakeVariance !== null;
              const variancePct = hasStockTake && r.theoreticalConsumption > 0
                ? Math.abs((r.latestStockTakeVariance as number) / r.theoreticalConsumption) * 100
                : null;
              const flagged = variancePct !== null && variancePct >= 5;
              return (
                <View key={r.inventoryItemId} style={[styles.row, index !== filtered.length - 1 && styles.rowDivider]}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.itemName}>{r.name}</Text>
                    {flagged && (
                      <View style={styles.flagBadge}>
                        <Icon name="alert-circle-outline" size={11} color={COLORS.dangerAccent} />
                        <Text style={styles.flagText}>{Math.round(variancePct as number)}% variance</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.metricsRow}>
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>THEORETICAL USED</Text>
                      <Text style={styles.metricValue}>{round(r.theoreticalConsumption)} {r.unit}</Text>
                    </View>
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>PURCHASED</Text>
                      <Text style={styles.metricValue}>{round(r.purchasedQty)} {r.unit}</Text>
                    </View>
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>WASTED</Text>
                      <Text style={styles.metricValue}>{round(r.wastageQty)} {r.unit}</Text>
                    </View>
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>LAST COUNT VARIANCE</Text>
                      {hasStockTake ? (
                        <Text style={[styles.metricValue, { color: flagged ? COLORS.dangerAccent : COLORS.heading }]}>
                          {(r.latestStockTakeVariance as number) >= 0 ? '+' : ''}{round(r.latestStockTakeVariance as number)} {r.unit}
                        </Text>
                      ) : (
                        <Text style={styles.metricValueMuted}>No count yet</Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {!isLoading && filtered.length > 0 && (
          <View style={styles.exportRow}>
            <TouchableOpacity style={styles.exportPdfBtn} onPress={() => runExport('pdf')} disabled={exporting !== null}>
              {exporting === 'pdf' ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="file-pdf-box" size={16} color="#FFFFFF" />}
              <Text style={styles.exportPdfText}>Export PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.exportExcelBtn} onPress={() => runExport('excel')} disabled={exporting !== null}>
              {exporting === 'excel' ? <ActivityIndicator size="small" color={COLORS.heading} /> : <Icon name="grid" size={16} color={COLORS.heading} />}
              <Text style={styles.exportExcelText}>Export Excel</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: isDesktopWeb ? 16 : 12, marginTop: isDesktopWeb ? 12 : 9, marginBottom: isDesktopWeb ? 6 : 4.5 },
  title: { flex: 1, fontSize: isDesktopWeb ? 20 : 18, fontWeight: 'bold', color: COLORS.heading },
  subtitle: { fontSize: 13, color: COLORS.muted, lineHeight: 18, marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 12 : 9 },
  searchWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardAlt, borderRadius: 8,
    marginHorizontal: isDesktopWeb ? 12 : 12, paddingHorizontal: isDesktopWeb ? 10 : 10.5, height: 46, marginBottom: isDesktopWeb ? 12 : 12,
  },
  searchInputWrap: { flex: 1, borderRadius: 8 },
  searchInput: { width: '100%', fontSize: 16, color: COLORS.heading },
  tableCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 12 : 12, borderRadius: 8, overflow: 'hidden' },
  row: { paddingHorizontal: isDesktopWeb ? 10 : 10.5, paddingVertical: isDesktopWeb ? 10 : 10.5 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: isDesktopWeb ? 7 : 7.5, gap: isDesktopWeb ? 6 : 6 },
  itemName: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: COLORS.heading, flexShrink: 1 },
  flagBadge: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 3 : 3, backgroundColor: COLORS.dangerBg, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 6 : 6, paddingVertical: isDesktopWeb ? 2 : 2.25 },
  flagText: { fontSize: 10, fontWeight: '700', color: COLORS.dangerAccent },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { minWidth: 90 },
  metricLabel: { fontSize: 9, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.3, marginBottom: 2.25 },
  metricValue: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  metricValueMuted: { fontSize: 12, color: COLORS.muted, fontStyle: 'italic' },
  exportRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 16 : 12, gap: 8, marginTop: 12 },
  exportPdfBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: 8 },
  exportPdfText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  exportExcelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.cardAlt, borderRadius: 6, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.divider },
  exportExcelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
});
