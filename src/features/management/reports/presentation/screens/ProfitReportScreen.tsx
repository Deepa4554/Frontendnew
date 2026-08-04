import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector, useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useProfitReport } from '../../../../../core/api/hooks/useReports';
import { useBranches } from '../../../../../core/api/hooks/useBranches';
import { RootState } from '../../../../../core/store/rootReducer';
import { showToast } from '../../../../../core/store/uiSlice';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';
import { DateRangeFilter, RangePreset, rangeForPreset, rangeLabelFor } from '../../../../../shared/components/reports/DateRangeFilter';
import { ReportExportService } from '../../../../../core/utils/reportExport';

export const ProfitReportScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const activeBranchId = useSelector((s: RootState) => s.branch.activeBranchId);
  const { data: branches = [] } = useBranches();
  const activeBranchName = activeBranchId === null ? 'All Branches' : branches.find((b) => b.id === activeBranchId)?.name ?? 'All Branches';
  const range = rangeForPreset(preset, customFrom, customTo);
  const rangeLabel = rangeLabelFor(preset, customFrom, customTo);
  const { data, isLoading, isError, refetch } = useProfitReport({ ...range, branchId: activeBranchId });

  const runExport = async (format: 'pdf' | 'excel') => {
    if (!data) return;
    setExporting(format);
    try {
      const def = {
        title: 'Profit Report',
        businessName: activeBranchName,
        dateRangeLabel: `${rangeLabel} · ${activeBranchName}`,
        sections: [
          {
            title: 'Summary',
            columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value', align: 'right' as const }],
            rows: [
              { metric: 'Revenue', value: data.revenue },
              { metric: 'Cost of goods sold', value: data.cogs },
              { metric: 'Gross profit', value: data.grossProfit },
              { metric: 'Expenses (whole tenant)', value: data.expenses },
              { metric: 'Net profit', value: data.netProfit },
            ],
          },
          {
            title: 'Daily breakdown',
            columns: [
              { key: 'day', label: 'Day' },
              { key: 'revenue', label: 'Revenue', align: 'right' as const },
              { key: 'cogs', label: 'COGS', align: 'right' as const },
              { key: 'expenses', label: 'Expenses', align: 'right' as const },
            ],
            rows: data.daily.map((d) => ({ day: d.day, revenue: d.revenue, cogs: d.cogs, expenses: d.expenses })),
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
    return <View style={styles.container}><ErrorState title="Couldn't load profit report" message="Check your connection and try again." onRetry={() => refetch()} /></View>;
  }

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="chart-line" title="Profit Report" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {!isDesktopWeb && (
          <>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="arrow-left" size={22} color={COLORS.heading} />
              </TouchableOpacity>
              <Text style={styles.title} numberOfLines={1}>Profit Report</Text>
            </View>
            <Text style={styles.subtitle}>Revenue minus cost of goods sold minus expenses. Expenses aren't split by branch — that line is always whole-tenant.</Text>
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
            {data.ordersWithoutRecipeCost > 0 && (
              <TouchableOpacity style={styles.warningCard} onPress={() => navigation.navigate('Inventory')}>
                <Icon name="alert-circle-outline" size={16} color={COLORS.dangerAccent} />
                <Text style={styles.warningText}>
                  {data.ordersWithoutRecipeCost} order(s) had items with no recipe on file — their cost is understated. Add recipes to fix.
                </Text>
                <Icon name="chevron-right" size={16} color={COLORS.dangerAccent} />
              </TouchableOpacity>
            )}

            <View style={styles.netProfitCard}>
              <Text style={styles.netProfitLabel}>NET PROFIT</Text>
              <Text style={[styles.netProfitValue, { color: data.netProfit >= 0 ? COLORS.success : COLORS.dangerAccent }]}>₹{data.netProfit.toFixed(2)}</Text>
            </View>

            <View style={styles.tableCard}>
              {[
                ['Revenue', data.revenue],
                ['Cost of goods sold', -data.cogs],
                ['Gross profit', data.grossProfit],
                ['Expenses', -data.expenses],
                ['Net profit', data.netProfit],
              ].map(([label, value], i, arr) => (
                <View key={label as string} style={[styles.row, i !== arr.length - 1 && styles.rowDivider]}>
                  <Text style={styles.rowLabel}>{label}</Text>
                  <Text style={styles.rowValue}>₹{(value as number).toFixed(2)}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionHeading}>Daily Breakdown</Text>
            <View style={styles.tableCard}>
              {data.daily.length === 0 ? (
                <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No activity in this range.</Text>
              ) : (
                data.daily.map((d, i) => (
                  <View key={`${d.day}-${i}`} style={[styles.row, i !== data.daily.length - 1 && styles.rowDivider]}>
                    <Text style={styles.rowLabel}>{d.day}</Text>
                    <Text style={styles.rowValue}>₹{(d.revenue - d.cogs - d.expenses).toFixed(2)}</Text>
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
  branchLabel: { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
  warningCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.dangerBg, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: isDesktopWeb ? 12 : 9, marginBottom: isDesktopWeb ? 12 : 9 },
  warningText: { flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.dangerAccent },
  netProfitCard: { backgroundColor: COLORS.aiCardBg, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: isDesktopWeb ? 14 : 10.5, marginBottom: isDesktopWeb ? 12 : 9 },
  netProfitLabel: { fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 0.5 },
  netProfitValue: { fontSize: isDesktopWeb ? 24 : 18, fontWeight: 'bold', marginTop: 4 },
  sectionHeading: { fontSize: 12, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: 6, marginTop: 12 },
  tableCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingVertical: isDesktopWeb ? 12 : 9 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  rowLabel: { fontSize: 13, color: COLORS.heading, fontWeight: '600' },
  rowValue: { fontSize: 13, color: COLORS.heading, fontWeight: '700' },
  exportRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 16 : 12, gap: 8, marginTop: 16 },
  exportPdfBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: 8 },
  exportPdfText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  exportExcelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.cardAlt, borderRadius: 6, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.divider },
  exportExcelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
});
