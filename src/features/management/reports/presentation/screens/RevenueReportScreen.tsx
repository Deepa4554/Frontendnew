import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector, useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useDashboardAnalytics } from '../../../../../core/api/hooks/useDashboard';
import { useOrdersReport } from '../../../../../core/api/hooks/useReports';
import { useBranches } from '../../../../../core/api/hooks/useBranches';
import { useSettings } from '../../../../../core/api/hooks/useSettings';
import { RootState } from '../../../../../core/store/rootReducer';
import { showToast } from '../../../../../core/store/uiSlice';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';
import { DateRangeFilter, RangePreset, rangeForPreset, rangeLabelFor } from '../../../../../shared/components/reports/DateRangeFilter';
import { ReportExportService } from '../../../../../core/utils/reportExport';

export const RevenueReportScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const [preset, setPreset] = useState<RangePreset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const activeBranchId = useSelector((s: RootState) => s.branch.activeBranchId);
  const { data: branches = [] } = useBranches();
  const activeBranchName = activeBranchId === null ? 'All Branches' : branches.find((b) => b.id === activeBranchId)?.name ?? 'All Branches';
  const range = rangeForPreset(preset, customFrom, customTo);
  const rangeLabel = rangeLabelFor(preset, customFrom, customTo);
  const { data, isLoading, isError, refetch } = useDashboardAnalytics({ ...range, branchId: activeBranchId });
  const { data: settings } = useSettings();
  // Second call rather than a wider analytics payload — the bill list is only fetched once
  // the owner actually opens the drill-down, so the default summary view stays as light as before.
  const [showOrders, setShowOrders] = useState(false);
  const { data: ordersData, isLoading: ordersLoading } = useOrdersReport(
    { ...range, branchId: activeBranchId },
    { enabled: showOrders },
  );

  const runExport = async (format: 'pdf' | 'excel') => {
    if (!data) return;
    setExporting(format);
    try {
      const def = {
        title: 'Revenue Report',
        businessName: settings?.businessName ?? 'PrabandhOS',
        dateRangeLabel: `${rangeLabel} · ${activeBranchName}`,
        sections: [
          {
            title: 'Summary',
            columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value', align: 'right' as const }],
            rows: [
              { metric: 'Revenue', value: data.revenue },
              { metric: 'Previous period revenue', value: data.previousPeriodRevenue },
              { metric: 'Sales (paid tickets)', value: data.salesCount },
              { metric: 'Average order value', value: data.avgOrderValue },
              { metric: 'GST collected', value: data.gstCollected },
              { metric: 'Refunds', value: data.refundsTotal },
            ],
          },
          {
            title: 'Daily revenue',
            columns: [{ key: 'day', label: 'Day' }, { key: 'revenue', label: 'Revenue', align: 'right' as const }],
            rows: data.weekly.map((w) => ({ day: w.day, revenue: w.revenue })),
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
    return <View style={styles.container}><ErrorState title="Couldn't load revenue report" message="Check your connection and try again." onRetry={() => refetch()} /></View>;
  }

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="currency-inr" title="Revenue Report" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {!isDesktopWeb && (
          <>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="arrow-left" size={22} color={COLORS.heading} />
              </TouchableOpacity>
              <Text style={styles.title} numberOfLines={1}>Revenue Report</Text>
            </View>
            <Text style={styles.subtitle}>Revenue, sales, and GST collected for the selected period — same numbers as Dashboard.</Text>
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
                ['Revenue', `₹${data.revenue.toFixed(2)}`],
                ['Previous period revenue', `₹${data.previousPeriodRevenue.toFixed(2)}`],
                ['Sales (paid tickets)', String(data.salesCount)],
                ['Average order value', `₹${data.avgOrderValue.toFixed(2)}`],
                ['GST collected', `₹${data.gstCollected.toFixed(2)}`],
                ['Refunds', `₹${data.refundsTotal.toFixed(2)}`],
              ].map(([label, value], i, arr) => (
                <View key={label} style={[styles.row, i !== arr.length - 1 && styles.rowDivider]}>
                  <Text style={styles.rowLabel}>{label}</Text>
                  <Text style={styles.rowValue}>{value}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionHeading}>Daily Revenue</Text>
            <View style={styles.tableCard}>
              {data.weekly.length === 0 ? (
                <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No sales in this range.</Text>
              ) : (
                data.weekly.map((w, i) => (
                  <View key={`${w.day}-${i}`} style={[styles.row, i !== data.weekly.length - 1 && styles.rowDivider]}>
                    <Text style={styles.rowLabel}>{w.day}</Text>
                    <Text style={styles.rowValue}>₹{w.revenue.toFixed(2)}</Text>
                  </View>
                ))
              )}
            </View>

            <TouchableOpacity style={styles.drillToggle} activeOpacity={0.7} onPress={() => setShowOrders((v) => !v)}>
              <Icon name="receipt-text-outline" size={16} color={COLORS.heading} />
              <Text style={styles.drillToggleText}>
                {showOrders ? 'Hide bill-wise detail' : 'Show bill-wise detail'}
              </Text>
              <Icon name={showOrders ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.muted} />
            </TouchableOpacity>

            {showOrders && (
              ordersLoading || !ordersData ? (
                <View style={{ paddingHorizontal: 16 }}><SkeletonList rows={5} /></View>
              ) : (
                <View style={styles.tableCard}>
                  {ordersData.orders.length === 0 ? (
                    <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No bills in this range.</Text>
                  ) : (
                    <>
                      {ordersData.orders.slice(0, 50).map((o, i, arr) => (
                        <TouchableOpacity
                          key={o.orderId}
                          style={[styles.row, i !== arr.length - 1 && styles.rowDivider]}
                          activeOpacity={0.7}
                          onPress={() => navigation.navigate('OrderDetailReport')}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowLabel} numberOfLines={1}>{o.orderNumber} {o.title}</Text>
                            <Text style={styles.billMeta}>
                              {new Date(o.createdAt).toLocaleString()} · {o.orderType} · {o.customerName ?? 'Walk-in'}
                            </Text>
                          </View>
                          <Text style={styles.rowValue}>₹{o.total.toFixed(2)}</Text>
                        </TouchableOpacity>
                      ))}
                      {ordersData.orders.length > 50 && (
                        <TouchableOpacity style={styles.moreRow} onPress={() => navigation.navigate('OrderDetailReport')}>
                          <Text style={styles.moreText}>
                            Showing 50 of {ordersData.orderCount} — open the full Order Detail Report
                          </Text>
                          <Icon name="chevron-right" size={16} color={COLORS.accent} />
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              )
            )}

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
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 16 : 12 },
  branchLabel: { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
  sectionHeading: { fontSize: 12, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: 6, marginTop: 12 },
  tableCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingVertical: isDesktopWeb ? 12 : 9 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  rowLabel: { fontSize: 13, color: COLORS.heading, fontWeight: '600' },
  rowValue: { fontSize: 13, color: COLORS.heading, fontWeight: '700' },
  billMeta: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  drillToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingVertical: isDesktopWeb ? 12 : 9, marginTop: 12, marginBottom: 8,
  },
  drillToggleText: { flex: 1, fontSize: 12, fontWeight: '700', color: COLORS.heading },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingVertical: isDesktopWeb ? 12 : 9, borderTopWidth: 1, borderTopColor: COLORS.divider },
  moreText: { flex: 1, fontSize: 11, fontWeight: '700', color: COLORS.accent },
  exportRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 16 : 12, gap: 8, marginTop: 16 },
  exportPdfBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: 8 },
  exportPdfText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  exportExcelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.cardAlt, borderRadius: 6, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.divider },
  exportExcelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
});
