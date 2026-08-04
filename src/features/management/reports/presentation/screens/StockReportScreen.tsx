import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector, useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useStockReport } from '../../../../../core/api/hooks/useReports';
import { useBranches } from '../../../../../core/api/hooks/useBranches';
import { RootState } from '../../../../../core/store/rootReducer';
import { showToast } from '../../../../../core/store/uiSlice';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { SearchClearButton } from '../../../../../shared/components/atoms/SearchClearButton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';
import { DateRangeFilter, RangePreset, rangeForPreset, rangeLabelFor } from '../../../../../shared/components/reports/DateRangeFilter';
import { ReportExportService } from '../../../../../core/utils/reportExport';

const round = (n: number) => Math.round(n * 100) / 100;

export const StockReportScreen = () => {
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
  const { data: rows = [], isLoading, isError, refetch } = useStockReport({ from: range.from, to: range.to, branchId: activeBranchId });

  const filtered = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  const totalValue = filtered.reduce((sum, r) => sum + r.currentValue, 0);

  const runExport = async (format: 'pdf' | 'excel') => {
    setExporting(format);
    try {
      const def = {
        title: 'Stock Report',
        businessName: activeBranchName,
        dateRangeLabel: `${rangeLabel} · ${activeBranchName}`,
        sections: [{
          title: 'Stock valuation & movement',
          columns: [
            { key: 'name', label: 'Ingredient' },
            { key: 'category', label: 'Category' },
            { key: 'currentQty', label: 'Current Qty', align: 'right' as const },
            { key: 'currentValue', label: 'Current Value', align: 'right' as const },
            { key: 'opening', label: 'Opening', align: 'right' as const },
            { key: 'purchased', label: 'Purchased', align: 'right' as const },
            { key: 'sold', label: 'Sold', align: 'right' as const },
            { key: 'wasted', label: 'Wasted', align: 'right' as const },
            { key: 'closing', label: 'Closing', align: 'right' as const },
          ],
          rows: filtered.map((r) => ({
            name: r.name,
            category: r.category,
            currentQty: `${round(r.currentQty)} ${r.unit}`,
            currentValue: r.currentValue,
            opening: r.openingBalance === null ? '—' : `${round(r.openingBalance)} ${r.unit}`,
            purchased: r.purchased === null ? '—' : `${round(r.purchased)} ${r.unit}`,
            sold: r.sold === null ? '—' : `${round(r.sold)} ${r.unit}`,
            wasted: r.wasted === null ? '—' : `${round(r.wasted)} ${r.unit}`,
            closing: r.closingBalance === null ? '—' : `${round(r.closingBalance)} ${r.unit}`,
          })),
          totalsRow: { name: 'Total', category: '', currentQty: '', currentValue: totalValue, opening: '', purchased: '', sold: '', wasted: '', closing: '' },
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
      <DesktopPageHeader icon="package-variant-closed" title="Stock Report" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {!isDesktopWeb && (
          <>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="arrow-left" size={22} color={COLORS.heading} />
              </TouchableOpacity>
              <Text style={styles.title} numberOfLines={1}>Stock Report</Text>
            </View>
            <Text style={styles.subtitle}>
              Current stock valuation, always as of now. Opening/Purchased/Sold/Wasted/Closing columns populate once a date range is picked.
            </Text>
          </>
        )}

        <View style={styles.filterRow}>
          <DateRangeFilter preset={preset} customFrom={customFrom} customTo={customTo} onChange={(p, f, t) => { setPreset(p); setCustomFrom(f); setCustomTo(t); }} />
          <Text style={styles.branchLabel}>{activeBranchName}</Text>
        </View>

        <View style={styles.searchWrapper}>
          <Icon name="magnify" size={18} color={COLORS.muted} style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <TextInput style={styles.searchInput} placeholder="Search ingredient..." placeholderTextColor={COLORS.placeholder} value={search} onChangeText={setSearch} />
            {!!search && <SearchClearButton onPress={() => setSearch('')} />}
          </View>
        </View>

        {isError && rows.length === 0 ? (
          <ErrorState title="Couldn't load stock report" message="Check your connection and try again." onRetry={() => refetch()} />
        ) : (
          <>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>TOTAL STOCK VALUE</Text>
              <Text style={styles.totalValue}>₹{totalValue.toFixed(2)}</Text>
            </View>

            <View style={styles.tableCard}>
              {isLoading && <View style={{ padding: 16 }}><SkeletonList rows={6} /></View>}
              {!isLoading && filtered.length === 0 && <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No ingredients found.</Text>}
              {filtered.map((r, index) => (
                <View key={r.inventoryItemId} style={[styles.row, index !== filtered.length - 1 && styles.rowDivider]}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.itemName}>{r.name}</Text>
                    <Text style={styles.itemValue}>₹{r.currentValue.toFixed(2)}</Text>
                  </View>
                  <View style={styles.metricsRow}>
                    <View style={styles.metric}><Text style={styles.metricLabel}>CURRENT</Text><Text style={styles.metricValue}>{round(r.currentQty)} {r.unit}</Text></View>
                    {r.openingBalance !== null && (
                      <>
                        <View style={styles.metric}><Text style={styles.metricLabel}>OPENING</Text><Text style={styles.metricValue}>{round(r.openingBalance)} {r.unit}</Text></View>
                        <View style={styles.metric}><Text style={styles.metricLabel}>PURCHASED</Text><Text style={styles.metricValue}>{round(r.purchased ?? 0)} {r.unit}</Text></View>
                        <View style={styles.metric}><Text style={styles.metricLabel}>SOLD</Text><Text style={styles.metricValue}>{round(r.sold ?? 0)} {r.unit}</Text></View>
                        <View style={styles.metric}><Text style={styles.metricLabel}>WASTED</Text><Text style={styles.metricValue}>{round(r.wasted ?? 0)} {r.unit}</Text></View>
                        <View style={styles.metric}><Text style={styles.metricLabel}>CLOSING</Text><Text style={styles.metricValue}>{round(r.closingBalance ?? 0)} {r.unit}</Text></View>
                      </>
                    )}
                  </View>
                </View>
              ))}
            </View>

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
          </>
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
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 12 : 9 },
  branchLabel: { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
  searchWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardAlt, borderRadius: 8, marginHorizontal: isDesktopWeb ? 16 : 12, paddingHorizontal: isDesktopWeb ? 14 : 10.5, height: 46, marginBottom: isDesktopWeb ? 16 : 12 },
  searchInput: { width: '100%', fontSize: 16, color: COLORS.heading, paddingRight: 24 },
  totalCard: { backgroundColor: COLORS.aiCardBg, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: isDesktopWeb ? 14 : 10.5, marginBottom: isDesktopWeb ? 12 : 9 },
  totalLabel: { fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 0.5 },
  totalValue: { fontSize: isDesktopWeb ? 20 : 16, fontWeight: 'bold', color: COLORS.accent, marginTop: 4 },
  tableCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, overflow: 'hidden' },
  row: { paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingVertical: isDesktopWeb ? 12 : 9 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  itemName: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: COLORS.heading, flexShrink: 1 },
  itemValue: { fontSize: 13, fontWeight: '700', color: COLORS.heading },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { minWidth: 80 },
  metricLabel: { fontSize: 9, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.3, marginBottom: 2 },
  metricValue: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  exportRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 16 : 12, gap: 8, marginTop: 12 },
  exportPdfBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: 8 },
  exportPdfText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  exportExcelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.cardAlt, borderRadius: 6, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.divider },
  exportExcelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
});
