import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useExpenseReport } from '../../../../../core/api/hooks/useExpenses';
import { useSettings } from '../../../../../core/api/hooks/useSettings';
import { showToast } from '../../../../../core/store/uiSlice';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';
import { DateRangeFilter, RangePreset, rangeForPreset, rangeLabelFor } from '../../../../../shared/components/reports/DateRangeFilter';
import { ReportExportService } from '../../../../../core/utils/reportExport';

export const ExpenseReportScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const range = rangeForPreset(preset, customFrom, customTo);
  const rangeLabel = rangeLabelFor(preset, customFrom, customTo);
  const { data, isLoading, isError, refetch } = useExpenseReport({ from: range.from, to: range.to });
  const { data: settings } = useSettings();

  const runExport = async (format: 'pdf' | 'excel') => {
    if (!data) return;
    setExporting(format);
    try {
      const def = {
        title: 'Expense Report',
        businessName: settings?.businessName ?? 'Business',
        dateRangeLabel: rangeLabel,
        sections: [
          {
            title: 'By category',
            columns: [{ key: 'category', label: 'Category' }, { key: 'total', label: 'Total', align: 'right' as const }],
            rows: data.byCategory.map((c) => ({ category: c.category, total: c.total })),
            totalsRow: { category: 'Total', total: data.total },
          },
          {
            title: 'All expenses',
            columns: [
              { key: 'purpose', label: 'Purpose' },
              { key: 'category', label: 'Category' },
              { key: 'amount', label: 'Amount', align: 'right' as const },
              { key: 'spentBy', label: 'Spent By' },
              { key: 'spentAt', label: 'Date' },
            ],
            rows: data.lines.map((l) => ({ purpose: l.purpose, category: l.category, amount: l.amount, spentBy: l.spentBy, spentAt: new Date(l.spentAt).toLocaleDateString() })),
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
    return <View style={styles.container}><ErrorState title="Couldn't load expense report" message="Check your connection and try again." onRetry={() => refetch()} /></View>;
  }

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="cash-minus" title="Expense Report" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {!isDesktopWeb && (
          <>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="arrow-left" size={22} color={COLORS.heading} />
              </TouchableOpacity>
              <Text style={styles.title} numberOfLines={1}>Expense Report</Text>
            </View>
            <Text style={styles.subtitle}>Cafe running costs for this range, by category. Not split by branch — expenses aren't tracked per-branch yet.</Text>
          </>
        )}

        <View style={styles.filterRow}>
          <DateRangeFilter preset={preset} customFrom={customFrom} customTo={customTo} onChange={(p, f, t) => { setPreset(p); setCustomFrom(f); setCustomTo(t); }} />
        </View>

        {isLoading || !data ? (
          <View style={{ paddingHorizontal: 16 }}><SkeletonList rows={6} /></View>
        ) : (
          <>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>TOTAL EXPENSES</Text>
              <Text style={styles.totalValue}>₹{data.total.toFixed(2)}</Text>
            </View>

            <Text style={styles.sectionHeading}>By Category</Text>
            <View style={styles.tableCard}>
              {data.byCategory.length === 0 ? (
                <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No expenses in this range.</Text>
              ) : (
                data.byCategory.map((c, i) => (
                  <View key={c.category} style={[styles.row, i !== data.byCategory.length - 1 && styles.rowDivider]}>
                    <Text style={styles.rowLabel}>{c.category}</Text>
                    <Text style={styles.rowValue}>₹{c.total.toFixed(2)}</Text>
                  </View>
                ))
              )}
            </View>

            <Text style={styles.sectionHeading}>All Expenses</Text>
            <View style={styles.tableCard}>
              {data.lines.length === 0 ? (
                <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No expenses in this range.</Text>
              ) : (
                data.lines.map((l, i) => (
                  <View key={l.id} style={[styles.row, i !== data.lines.length - 1 && styles.rowDivider]}>
                    <View style={styles.rowHeader}>
                      <Text style={styles.itemName}>{l.purpose}</Text>
                      <Text style={styles.itemValue}>₹{l.amount.toFixed(2)}</Text>
                    </View>
                    <Text style={styles.metaText}>{l.category} · {l.spentBy} · {new Date(l.spentAt).toLocaleDateString()}</Text>
                  </View>
                ))
              )}
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
  totalCard: { backgroundColor: COLORS.aiCardBg, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: isDesktopWeb ? 14 : 10.5, marginBottom: isDesktopWeb ? 12 : 9 },
  totalLabel: { fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 0.5 },
  totalValue: { fontSize: isDesktopWeb ? 20 : 16, fontWeight: 'bold', color: COLORS.accent, marginTop: 4 },
  sectionHeading: { fontSize: 12, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: 6, marginTop: 12 },
  tableCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, overflow: 'hidden' },
  row: { paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingVertical: isDesktopWeb ? 12 : 9 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  itemName: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: COLORS.heading, flexShrink: 1 },
  itemValue: { fontSize: 13, fontWeight: '700', color: COLORS.heading },
  rowLabel: { fontSize: 13, color: COLORS.heading, fontWeight: '600' },
  rowValue: { fontSize: 13, color: COLORS.heading, fontWeight: '700' },
  metaText: { fontSize: 11, color: COLORS.muted },
  exportRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 16 : 12, gap: 8, marginTop: 12 },
  exportPdfBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: 8 },
  exportPdfText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  exportExcelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.cardAlt, borderRadius: 6, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.divider },
  exportExcelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
});
