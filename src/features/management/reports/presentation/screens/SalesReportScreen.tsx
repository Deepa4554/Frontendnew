import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector, useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useSalesReport } from '../../../../../core/api/hooks/useReports';
import { useBranches } from '../../../../../core/api/hooks/useBranches';
import { RootState } from '../../../../../core/store/rootReducer';
import { showToast } from '../../../../../core/store/uiSlice';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';
import { DateRangeFilter, RangePreset, rangeForPreset, rangeLabelFor } from '../../../../../shared/components/reports/DateRangeFilter';
import { ReportExportService } from '../../../../../core/utils/reportExport';

type Tab = 'item' | 'category' | 'payment';
const TABS: { key: Tab; label: string }[] = [
  { key: 'item', label: 'Item-wise' },
  { key: 'category', label: 'Category-wise' },
  { key: 'payment', label: 'Payment Mode' },
];

export const SalesReportScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const [tab, setTab] = useState<Tab>('item');
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const activeBranchId = useSelector((s: RootState) => s.branch.activeBranchId);
  const { data: branches = [] } = useBranches();
  const activeBranchName = activeBranchId === null ? 'All Branches' : branches.find((b) => b.id === activeBranchId)?.name ?? 'All Branches';
  const range = rangeForPreset(preset, customFrom, customTo);
  const rangeLabel = rangeLabelFor(preset, customFrom, customTo);
  const { data, isLoading, isError, refetch } = useSalesReport({ ...range, branchId: activeBranchId });

  const runExport = async (format: 'pdf' | 'excel') => {
    if (!data) return;
    setExporting(format);
    try {
      const def = {
        title: 'Sales Report',
        businessName: activeBranchName,
        dateRangeLabel: `${rangeLabel} · ${activeBranchName}`,
        sections: [
          {
            title: 'Summary',
            columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value', align: 'right' as const }],
            rows: [
              { metric: 'Gross sales', value: data.grossSales },
              { metric: 'Total discounts', value: data.totalDiscounts },
              { metric: 'Complimentary', value: data.complimentaryTotal },
              { metric: 'Net sales', value: data.netSales },
              { metric: 'Refunds', value: data.refundsTotal },
              { metric: 'Orders', value: data.orderCount },
            ],
          },
          {
            title: 'Item-wise',
            columns: [{ key: 'name', label: 'Item' }, { key: 'qty', label: 'Qty Sold', align: 'right' as const }, { key: 'net', label: 'Net Sales', align: 'right' as const }],
            rows: data.itemWise.map((i) => ({ name: i.name, qty: i.qtySold, net: i.netSales })),
          },
          {
            title: 'Category-wise',
            columns: [{ key: 'category', label: 'Category' }, { key: 'qty', label: 'Qty Sold', align: 'right' as const }, { key: 'net', label: 'Net Sales', align: 'right' as const }],
            rows: data.categoryWise.map((c) => ({ category: c.category, qty: c.qtySold, net: c.netSales })),
          },
          {
            title: 'Payment-mode-wise',
            columns: [{ key: 'method', label: 'Method' }, { key: 'txns', label: 'Transactions', align: 'right' as const }, { key: 'amount', label: 'Amount', align: 'right' as const }],
            rows: data.paymentModeWise.map((p) => ({ method: p.method, txns: p.txnCount, amount: p.amount })),
          },
        ],
      };
      if (format === 'pdf') await ReportExportService.exportToPDF(def);
      else await ReportExportService.exportToExcel(def);
    } catch (e: any) {
      dispatch(showToast({ message: e?.message ?? 'Could not build the report file.', icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setExporting(null);
    }
  };

  if (isError && !data) {
    return <View style={styles.container}><ErrorState title="Couldn't load sales report" message="Check your connection and try again." onRetry={() => refetch()} /></View>;
  }

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="chart-bar" title="Sales Report" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {!isDesktopWeb && (
          <>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="arrow-left" size={22} color={COLORS.heading} />
              </TouchableOpacity>
              <Text style={styles.title} numberOfLines={1}>Sales Report</Text>
            </View>
            <Text style={styles.subtitle}>Item, category, and payment-mode breakdown of paid orders in this range.</Text>
          </>
        )}

        <View style={styles.filterRow}>
          <DateRangeFilter preset={preset} customFrom={customFrom} customTo={customTo} onChange={(p, f, t) => { setPreset(p); setCustomFrom(f); setCustomTo(t); }} />
          <Text style={styles.branchLabel}>{activeBranchName}</Text>
        </View>

        {isLoading || !data ? (
          <View style={{ paddingHorizontal: 16 }}><SkeletonList rows={6} /></View>
        ) : (
          <>
            <View style={styles.tableCard}>
              {[
                ['Gross sales', data.grossSales],
                ['Total discounts', -data.totalDiscounts],
                ['Complimentary', -data.complimentaryTotal],
                ['Net sales', data.netSales],
                ['Refunds', -data.refundsTotal],
              ].map(([label, value], i, arr) => (
                <View key={label as string} style={[styles.row, i !== arr.length - 1 && styles.rowDivider]}>
                  <Text style={styles.rowLabel}>{label}</Text>
                  <Text style={styles.rowValue}>₹{(value as number).toFixed(2)}</Text>
                </View>
              ))}
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Orders</Text>
                <Text style={styles.rowValue}>{data.orderCount}</Text>
              </View>
            </View>

            <View style={styles.tabRow}>
              {TABS.map((t) => (
                <TouchableOpacity key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]} onPress={() => setTab(t.key)}>
                  <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.tableCard}>
              {tab === 'item' && (data.itemWise.length === 0
                ? <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No sales in this range.</Text>
                : data.itemWise.map((i, idx) => (
                  <View key={i.menuItemId} style={[styles.row, idx !== data.itemWise.length - 1 && styles.rowDivider]}>
                    <Text style={styles.rowLabel}>{i.name}</Text>
                    <Text style={styles.metaInline}>{i.qtySold} sold</Text>
                    <Text style={styles.rowValue}>₹{i.netSales.toFixed(2)}</Text>
                  </View>
                )))}
              {tab === 'category' && (data.categoryWise.length === 0
                ? <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No sales in this range.</Text>
                : data.categoryWise.map((c, idx) => (
                  <View key={c.category} style={[styles.row, idx !== data.categoryWise.length - 1 && styles.rowDivider]}>
                    <Text style={styles.rowLabel}>{c.category}</Text>
                    <Text style={styles.metaInline}>{c.qtySold} sold</Text>
                    <Text style={styles.rowValue}>₹{c.netSales.toFixed(2)}</Text>
                  </View>
                )))}
              {tab === 'payment' && (data.paymentModeWise.length === 0
                ? <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No payments in this range.</Text>
                : data.paymentModeWise.map((p, idx) => (
                  <View key={p.method} style={[styles.row, idx !== data.paymentModeWise.length - 1 && styles.rowDivider]}>
                    <Text style={styles.rowLabel}>{p.method}</Text>
                    <Text style={styles.metaInline}>{p.txnCount} txns</Text>
                    <Text style={styles.rowValue}>₹{p.amount.toFixed(2)}</Text>
                  </View>
                )))}
            </View>

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
  tableCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, overflow: 'hidden', marginBottom: isDesktopWeb ? 12 : 9 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingVertical: isDesktopWeb ? 12 : 9, gap: 8 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  rowLabel: { fontSize: 13, color: COLORS.heading, fontWeight: '600', flex: 1 },
  rowValue: { fontSize: 13, color: COLORS.heading, fontWeight: '700' },
  metaInline: { fontSize: 11, color: COLORS.muted },
  tabRow: { flexDirection: 'row', marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 12 : 9, gap: 6 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  tabBtnActive: { backgroundColor: COLORS.button },
  tabText: { fontSize: 11, fontWeight: '700', color: COLORS.heading },
  tabTextActive: { color: '#FFFFFF' },
  exportRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 16 : 12, gap: 8, marginTop: 4 },
  exportPdfBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: 8 },
  exportPdfText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  exportExcelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.cardAlt, borderRadius: 6, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.divider },
  exportExcelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
});
