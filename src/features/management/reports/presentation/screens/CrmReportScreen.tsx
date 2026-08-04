import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector, useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useCrmReport } from '../../../../../core/api/hooks/useReports';
import { useBranches } from '../../../../../core/api/hooks/useBranches';
import { useSettings } from '../../../../../core/api/hooks/useSettings';
import { RootState } from '../../../../../core/store/rootReducer';
import { showToast } from '../../../../../core/store/uiSlice';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { SearchClearButton } from '../../../../../shared/components/atoms/SearchClearButton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';
import { DateRangeFilter, RangePreset, rangeForPreset, rangeLabelFor } from '../../../../../shared/components/reports/DateRangeFilter';
import { ReportExportService } from '../../../../../core/utils/reportExport';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

export const CrmReportScreen = () => {
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
  const { data, isLoading, isError, refetch } = useCrmReport({ ...range, branchId: activeBranchId });
  const { data: settings } = useSettings();

  const q = search.trim().toLowerCase();
  const filtered = (data?.customers ?? []).filter(
    (c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q),
  );

  const runExport = async (format: 'pdf' | 'excel') => {
    if (!data) return;
    setExporting(format);
    try {
      const def = {
        title: 'Customer (CRM) Report',
        businessName: settings?.businessName ?? 'PrabandhOS',
        dateRangeLabel: `${rangeLabel} · ${activeBranchName}`,
        sections: [
          {
            title: 'Summary',
            columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value', align: 'right' as const }],
            rows: [
              { metric: 'Active customers', value: data.activeCustomers },
              { metric: 'New customers', value: data.newCustomers },
              { metric: 'Returning customers', value: data.returningCustomers },
              { metric: 'Repeat rate %', value: data.repeatRatePct },
              { metric: 'Lapsed customers (60+ days, all time)', value: data.lapsedCustomers },
              { metric: 'Revenue from identified customers', value: data.revenueFromCustomers },
              { metric: 'Revenue from walk-ins', value: data.revenueFromWalkIns },
              { metric: 'Identified revenue %', value: data.identifiedRevenuePct },
              { metric: 'Average spend per customer', value: data.avgSpendPerCustomer },
              { metric: 'Average visits per customer', value: data.avgVisitsPerCustomer },
              { metric: 'Loyalty points redeemed (in period)', value: data.pointsRedeemedInPeriod },
              { metric: 'Loyalty points outstanding (liability, all time)', value: data.pointsOutstanding },
            ],
          },
          {
            title: 'Customer detail',
            columns: [
              { key: 'name', label: 'Customer' },
              { key: 'phone', label: 'Phone' },
              { key: 'tier', label: 'Tier' },
              { key: 'visits', label: 'Visits', align: 'right' as const },
              { key: 'spent', label: 'Spent', align: 'right' as const },
              { key: 'aov', label: 'Avg Order', align: 'right' as const },
              { key: 'lifetimeVisits', label: 'Lifetime Visits', align: 'right' as const },
              { key: 'lifetimeSpent', label: 'Lifetime Spent', align: 'right' as const },
              { key: 'points', label: 'Points', align: 'right' as const },
              { key: 'lastVisit', label: 'Last Visit' },
              { key: 'status', label: 'Status' },
            ],
            rows: filtered.map((c) => ({
              name: c.name,
              phone: c.phone ?? '—',
              tier: c.tier,
              visits: c.visitsInPeriod,
              spent: c.spentInPeriod,
              aov: c.avgOrderValueInPeriod,
              lifetimeVisits: c.lifetimeVisits,
              lifetimeSpent: c.lifetimeSpent,
              points: c.availablePoints,
              lastVisit: fmtDate(c.lastVisitAt),
              status: c.isNewInPeriod ? 'New' : 'Returning',
            })),
            totalsRow: {
              name: 'Total', phone: '', tier: '', visits: filtered.reduce((s, c) => s + c.visitsInPeriod, 0),
              spent: filtered.reduce((s, c) => s + c.spentInPeriod, 0), aov: '', lifetimeVisits: '', lifetimeSpent: '',
              points: filtered.reduce((s, c) => s + c.availablePoints, 0), lastVisit: '', status: '',
            },
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
    return <View style={styles.container}><ErrorState title="Couldn't load customer report" message="Check your connection and try again." onRetry={() => refetch()} /></View>;
  }

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="account-heart-outline" title="Customer (CRM) Report" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {!isDesktopWeb && (
          <>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="arrow-left" size={22} color={COLORS.heading} />
              </TouchableOpacity>
              <Text style={styles.title} numberOfLines={1}>Customer (CRM) Report</Text>
            </View>
            <Text style={styles.subtitle}>
              Who your customers are and what they're worth. Walk-in orders aren't tied to a customer, so they
              count in revenue but never appear in the customer list below.
            </Text>
          </>
        )}

        <View style={styles.filterRow}>
          <DateRangeFilter preset={preset} customFrom={customFrom} customTo={customTo} onChange={(p, f, t) => { setPreset(p); setCustomFrom(f); setCustomTo(t); }} />
          <Text style={styles.branchLabel}>{activeBranchName}</Text>
        </View>

        {isLoading || !data ? (
          <View style={{ paddingHorizontal: 16 }}><SkeletonList rows={8} /></View>
        ) : (
          <>
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>ACTIVE CUSTOMERS</Text>
                <Text style={styles.kpiValue}>{data.activeCustomers}</Text>
                <Text style={styles.kpiSub}>{data.newCustomers} new · {data.returningCustomers} returning</Text>
              </View>
              <View style={[styles.kpiCard, styles.kpiAccent]}>
                <Text style={[styles.kpiLabel, { color: COLORS.accent }]}>IDENTIFIED REVENUE</Text>
                <Text style={[styles.kpiValue, { color: COLORS.accent }]}>{data.identifiedRevenuePct}%</Text>
                <Text style={styles.kpiSub}>₹{data.revenueFromCustomers.toFixed(2)} of ₹{(data.revenueFromCustomers + data.revenueFromWalkIns).toFixed(2)}</Text>
              </View>
            </View>

            <Text style={styles.sectionHeading}>Summary</Text>
            <View style={styles.tableCard}>
              {[
                ['Repeat rate', `${data.repeatRatePct}%`],
                ['Average spend per customer', `₹${data.avgSpendPerCustomer.toFixed(2)}`],
                ['Average visits per customer', String(data.avgVisitsPerCustomer)],
                ['Revenue from walk-ins', `₹${data.revenueFromWalkIns.toFixed(2)}`],
                ['Loyalty points redeemed', String(data.pointsRedeemedInPeriod)],
              ].map(([label, value], i, arr) => (
                <View key={label} style={[styles.row, i !== arr.length - 1 && styles.rowDivider]}>
                  <Text style={styles.rowLabel}>{label}</Text>
                  <Text style={styles.rowValue}>{value}</Text>
                </View>
              ))}
            </View>

            {/* Both are all-time, not period figures — labelled so they can't be misread as
                "this month's" churn or points cost. */}
            <View style={styles.liabilityCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.liabilityLabel}>POINTS OUTSTANDING (ALL TIME)</Text>
                <Text style={styles.liabilityValue}>{data.pointsOutstanding} pts</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.liabilityLabel}>LAPSED 60+ DAYS</Text>
                <Text style={styles.liabilityValue}>{data.lapsedCustomers}</Text>
              </View>
            </View>

            <Text style={styles.sectionHeading}>Customer Detail ({filtered.length})</Text>
            <View style={styles.searchWrapper}>
              <Icon name="magnify" size={18} color={COLORS.muted} style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search name or phone..."
                  placeholderTextColor={COLORS.placeholder}
                  value={search}
                  onChangeText={setSearch}
                />
                {!!search && <SearchClearButton onPress={() => setSearch('')} />}
              </View>
            </View>

            <View style={styles.tableCard}>
              {filtered.length === 0 ? (
                <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>
                  {data.customers.length === 0 ? 'No identified customers ordered in this range.' : 'No customer matches that search.'}
                </Text>
              ) : (
                filtered.map((c, i) => (
                  <TouchableOpacity
                    key={c.customerId}
                    style={[styles.custRow, i !== filtered.length - 1 && styles.rowDivider]}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('CRM', { screen: 'CustomerProfile', params: { customerId: c.customerId } })}
                  >
                    <View style={styles.custHeader}>
                      <Text style={styles.custName} numberOfLines={1}>{c.name}</Text>
                      {c.isNewInPeriod && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
                      <Text style={styles.custSpent}>₹{c.spentInPeriod.toFixed(2)}</Text>
                    </View>
                    <Text style={styles.custMeta}>
                      {c.phone ?? 'No phone'} · {c.tier} · {c.visitsInPeriod} visit(s) · avg ₹{c.avgOrderValueInPeriod.toFixed(2)}
                    </Text>
                    <Text style={styles.custMetaDim}>
                      Lifetime: {c.lifetimeVisits} visits · ₹{c.lifetimeSpent.toFixed(2)} · {c.availablePoints} pts · last {fmtDate(c.lastVisitAt)}
                    </Text>
                  </TouchableOpacity>
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
  kpiRow: { flexDirection: 'row', gap: 8, marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 12 : 9 },
  kpiCard: { flex: 1, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 14 : 10.5 },
  kpiAccent: { backgroundColor: COLORS.aiCardBg },
  kpiLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 },
  kpiValue: { fontSize: isDesktopWeb ? 22 : 18, fontWeight: 'bold', color: COLORS.heading, marginTop: 4 },
  kpiSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  sectionHeading: { fontSize: 12, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: 6, marginTop: 12 },
  tableCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingVertical: isDesktopWeb ? 12 : 9 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  rowLabel: { fontSize: 13, color: COLORS.heading, fontWeight: '600' },
  rowValue: { fontSize: 13, color: COLORS.heading, fontWeight: '700' },
  liabilityCard: { flexDirection: 'row', gap: 12, backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: isDesktopWeb ? 14 : 10.5, marginTop: isDesktopWeb ? 12 : 9 },
  liabilityLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.4 },
  liabilityValue: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: 'bold', color: COLORS.heading, marginTop: 3 },
  searchWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardAlt, borderRadius: 8, marginHorizontal: isDesktopWeb ? 16 : 12, paddingHorizontal: isDesktopWeb ? 14 : 10.5, height: 46, marginBottom: isDesktopWeb ? 12 : 9 },
  searchInput: { width: '100%', fontSize: 16, color: COLORS.heading, paddingRight: 24 },
  custRow: { paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingVertical: isDesktopWeb ? 12 : 9 },
  custHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  custName: { flex: 1, fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: COLORS.heading },
  custSpent: { fontSize: 13, fontWeight: '700', color: COLORS.heading },
  newBadge: { backgroundColor: COLORS.aiCardBg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  newBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.accent },
  custMeta: { fontSize: 11, color: COLORS.muted },
  custMetaDim: { fontSize: 10, color: COLORS.muted, marginTop: 1.5, opacity: 0.85 },
  exportRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 16 : 12, gap: 8, marginTop: 16 },
  exportPdfBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: 8 },
  exportPdfText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  exportExcelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.cardAlt, borderRadius: 6, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.divider },
  exportExcelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
});
