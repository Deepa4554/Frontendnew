import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector, useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useOrdersReport } from '../../../../../core/api/hooks/useReports';
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

const ORDER_TYPES: { key: string | undefined; label: string }[] = [
  { key: undefined, label: 'All' },
  { key: 'DINE_IN', label: 'Dine-in' },
  { key: 'TAKEAWAY', label: 'Takeaway' },
  { key: 'DELIVERY', label: 'Delivery' },
  { key: 'QSR', label: 'Token' },
];

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const billLabel = (o: { orderNumber: string; tableCode: string | null; tokenNumber: number | null }) =>
  o.tokenNumber != null ? `Token #${o.tokenNumber}` : o.tableCode ? `Table ${o.tableCode}` : `Bill ${o.orderNumber}`;

export const OrderDetailReportScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const [search, setSearch] = useState('');
  const [orderType, setOrderType] = useState<string | undefined>(undefined);
  const [preset, setPreset] = useState<RangePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const activeBranchId = useSelector((s: RootState) => s.branch.activeBranchId);
  const { data: branches = [] } = useBranches();
  const activeBranchName = activeBranchId === null ? 'All Branches' : branches.find((b) => b.id === activeBranchId)?.name ?? 'All Branches';
  const range = rangeForPreset(preset, customFrom, customTo);
  const rangeLabel = rangeLabelFor(preset, customFrom, customTo);
  const { data, isLoading, isError, refetch } = useOrdersReport({ ...range, branchId: activeBranchId, orderType });
  const { data: settings } = useSettings();

  const q = search.trim().toLowerCase();
  const filtered = (data?.orders ?? []).filter(
    (o) =>
      o.orderNumber.toLowerCase().includes(q) ||
      o.title.toLowerCase().includes(q) ||
      (o.customerName ?? '').toLowerCase().includes(q) ||
      (o.customerPhone ?? '').toLowerCase().includes(q) ||
      (o.tableCode ?? '').toLowerCase().includes(q),
  );

  const statusOf = (o: { paid: boolean; refunded: boolean }) => (o.refunded ? 'Refunded' : o.paid ? 'Paid' : 'Unpaid');

  const runExport = async (format: 'pdf' | 'excel') => {
    if (!data) return;
    setExporting(format);
    try {
      const def = {
        title: 'Order Detail Report',
        businessName: settings?.businessName ?? 'PrabandhOS',
        dateRangeLabel: `${rangeLabel} · ${activeBranchName}${orderType ? ` · ${orderType}` : ''}`,
        sections: [
          {
            title: 'Summary',
            columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value', align: 'right' as const }],
            rows: [
              { metric: 'Orders', value: data.orderCount },
              { metric: 'Gross (subtotal)', value: data.grossTotal },
              { metric: 'Discounts', value: data.discountTotal },
              { metric: 'Tax', value: data.taxTotal },
              { metric: 'Net total', value: data.netTotal },
              { metric: 'Refunds', value: data.refundTotal },
            ],
          },
          {
            title: 'Bill-wise register',
            columns: [
              { key: 'bill', label: 'Bill' },
              { key: 'date', label: 'Date & Time' },
              { key: 'type', label: 'Type' },
              { key: 'customer', label: 'Customer' },
              { key: 'items', label: 'Items', align: 'right' as const },
              { key: 'gross', label: 'Gross', align: 'right' as const },
              { key: 'discount', label: 'Discount', align: 'right' as const },
              { key: 'tax', label: 'Tax', align: 'right' as const },
              { key: 'total', label: 'Total', align: 'right' as const },
              { key: 'payment', label: 'Payment' },
              { key: 'status', label: 'Status' },
            ],
            rows: filtered.map((o) => ({
              bill: billLabel(o),
              date: fmtDateTime(o.createdAt),
              type: o.orderType,
              customer: o.customerName ?? 'Walk-in',
              items: o.itemCount,
              gross: o.subtotal,
              discount: o.discountTotal,
              tax: o.tax,
              total: o.total,
              payment: o.paymentMethod ?? '—',
              status: statusOf(o),
            })),
            totalsRow: {
              bill: 'Total', date: '', type: '', customer: '',
              items: filtered.reduce((s, o) => s + o.itemCount, 0),
              gross: filtered.reduce((s, o) => s + o.subtotal, 0),
              discount: filtered.reduce((s, o) => s + o.discountTotal, 0),
              tax: filtered.reduce((s, o) => s + o.tax, 0),
              total: filtered.reduce((s, o) => s + o.total, 0),
              payment: '', status: '',
            },
          },
          {
            // Flattened one row per line so the sheet stays sortable/pivotable — a nested
            // layout would look right in the PDF but be useless in Excel.
            title: 'Line items',
            columns: [
              { key: 'bill', label: 'Bill' },
              { key: 'item', label: 'Item' },
              { key: 'qty', label: 'Qty', align: 'right' as const },
              { key: 'price', label: 'Rate', align: 'right' as const },
              { key: 'lineTotal', label: 'Amount', align: 'right' as const },
              { key: 'tax', label: 'Tax', align: 'right' as const },
              { key: 'voided', label: 'Voided' },
            ],
            rows: filtered.flatMap((o) =>
              o.items.map((it) => ({
                bill: billLabel(o),
                item: it.variantName ? `${it.name} (${it.variantName})` : it.name,
                qty: it.qty,
                price: it.price,
                lineTotal: it.lineTotal,
                tax: it.taxAmount,
                voided: it.voided ? 'VOIDED' : '',
              })),
            ),
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
    return <View style={styles.container}><ErrorState title="Couldn't load order detail report" message="Check your connection and try again." onRetry={() => refetch()} /></View>;
  }

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="receipt" title="Order Detail Report" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {!isDesktopWeb && (
          <>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="arrow-left" size={22} color={COLORS.heading} />
              </TouchableOpacity>
              <Text style={styles.title} numberOfLines={1}>Order Detail Report</Text>
            </View>
            <Text style={styles.subtitle}>
              Every bill in the range, tap one to see its line items. Unpaid and refunded bills are included so a
              day can be audited in full.
            </Text>
          </>
        )}

        <View style={styles.filterRow}>
          <DateRangeFilter preset={preset} customFrom={customFrom} customTo={customTo} onChange={(p, f, t) => { setPreset(p); setCustomFrom(f); setCustomTo(t); }} />
          <Text style={styles.branchLabel}>{activeBranchName}</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {ORDER_TYPES.map((t) => (
            <TouchableOpacity
              key={t.label}
              style={[styles.chip, orderType === t.key && styles.chipActive]}
              onPress={() => setOrderType(t.key)}
            >
              <Text style={[styles.chipText, orderType === t.key && styles.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isLoading || !data ? (
          <View style={{ paddingHorizontal: 16 }}><SkeletonList rows={8} /></View>
        ) : (
          <>
            <View style={styles.tableCard}>
              {[
                ['Orders', String(data.orderCount)],
                ['Gross (subtotal)', `₹${data.grossTotal.toFixed(2)}`],
                ['Discounts', `−₹${data.discountTotal.toFixed(2)}`],
                ['Tax', `₹${data.taxTotal.toFixed(2)}`],
                ['Net total', `₹${data.netTotal.toFixed(2)}`],
                ['Refunds', `−₹${data.refundTotal.toFixed(2)}`],
              ].map(([label, value], i, arr) => (
                <View key={label} style={[styles.row, i !== arr.length - 1 && styles.rowDivider]}>
                  <Text style={styles.rowLabel}>{label}</Text>
                  <Text style={styles.rowValue}>{value}</Text>
                </View>
              ))}
            </View>

            {data.truncated && (
              <View style={styles.warnCard}>
                <Icon name="information-outline" size={16} color={COLORS.warning} />
                <Text style={styles.warnText}>
                  Showing the newest {data.orders.length} of {data.orderCount} bills. Narrow the date range to see the rest.
                </Text>
              </View>
            )}

            <Text style={styles.sectionHeading}>Bill-wise Register ({filtered.length})</Text>
            <View style={styles.searchWrapper}>
              <Icon name="magnify" size={18} color={COLORS.muted} style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search bill no, customer, table..."
                  placeholderTextColor={COLORS.placeholder}
                  value={search}
                  onChangeText={setSearch}
                />
                {!!search && <SearchClearButton onPress={() => setSearch('')} />}
              </View>
            </View>

            <View style={styles.tableCard}>
              {filtered.length === 0 ? (
                <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No bills match these filters.</Text>
              ) : (
                filtered.map((o, i) => {
                  const isOpen = expanded === o.orderId;
                  const status = statusOf(o);
                  return (
                    <View key={o.orderId} style={i !== filtered.length - 1 ? styles.rowDivider : undefined}>
                      <TouchableOpacity style={styles.billRow} activeOpacity={0.7} onPress={() => setExpanded(isOpen ? null : o.orderId)}>
                        <View style={styles.billHeader}>
                          <Text style={styles.billNo} numberOfLines={1}>{billLabel(o)}</Text>
                          <View style={[styles.statusBadge, status === 'Refunded' ? styles.statusRefunded : status === 'Unpaid' ? styles.statusUnpaid : styles.statusPaid]}>
                            <Text style={styles.statusText}>{status.toUpperCase()}</Text>
                          </View>
                          <Text style={styles.billTotal}>₹{o.total.toFixed(2)}</Text>
                          <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.muted} />
                        </View>
                        <Text style={styles.billMeta}>
                          {fmtDateTime(o.createdAt)} · {o.orderType} · {o.itemCount} item(s) · {o.paymentMethod ?? 'unpaid'}
                        </Text>
                        <Text style={styles.billMetaDim}>
                          {o.customerName ?? 'Walk-in'}{o.customerPhone ? ` · ${o.customerPhone}` : ''}
                          {o.discountTotal > 0 ? ` · discount ₹${o.discountTotal.toFixed(2)}` : ''}
                        </Text>
                      </TouchableOpacity>

                      {isOpen && (
                        <View style={styles.itemsBox}>
                          {o.items.map((it, idx) => (
                            <View key={idx} style={styles.itemRow}>
                              <Text style={[styles.itemName, it.voided && styles.itemVoided]} numberOfLines={1}>
                                {it.qty}× {it.variantName ? `${it.name} (${it.variantName})` : it.name}
                                {it.voided ? '  — VOIDED' : ''}
                              </Text>
                              <Text style={[styles.itemAmt, it.voided && styles.itemVoided]}>₹{it.lineTotal.toFixed(2)}</Text>
                            </View>
                          ))}
                          <View style={styles.itemTotalRow}>
                            <Text style={styles.itemTotalLabel}>Gross ₹{o.subtotal.toFixed(2)} · Tax ₹{o.tax.toFixed(2)}</Text>
                            <Text style={styles.itemTotalValue}>₹{o.total.toFixed(2)}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })
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
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 10 : 7.5 },
  branchLabel: { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
  chipRow: { flexDirection: 'row', gap: 6, paddingHorizontal: isDesktopWeb ? 16 : 12, paddingBottom: isDesktopWeb ? 12 : 9 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: COLORS.cardAlt },
  chipActive: { backgroundColor: COLORS.button },
  chipText: { fontSize: 11, fontWeight: '700', color: COLORS.heading },
  chipTextActive: { color: '#FFFFFF' },
  sectionHeading: { fontSize: 12, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: 6, marginTop: 12 },
  tableCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingVertical: isDesktopWeb ? 12 : 9 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  rowLabel: { fontSize: 13, color: COLORS.heading, fontWeight: '600' },
  rowValue: { fontSize: 13, color: COLORS.heading, fontWeight: '700' },
  warnCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: isDesktopWeb ? 12 : 9, marginTop: isDesktopWeb ? 12 : 9 },
  warnText: { flex: 1, fontSize: 11, fontWeight: '600', color: COLORS.warning },
  searchWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardAlt, borderRadius: 8, marginHorizontal: isDesktopWeb ? 16 : 12, paddingHorizontal: isDesktopWeb ? 14 : 10.5, height: 46, marginBottom: isDesktopWeb ? 12 : 9 },
  searchInput: { width: '100%', fontSize: 16, color: COLORS.heading, paddingRight: 24 },
  billRow: { paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingVertical: isDesktopWeb ? 12 : 9 },
  billHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  billNo: { flex: 1, fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: COLORS.heading },
  billTotal: { fontSize: 13, fontWeight: '700', color: COLORS.heading },
  billMeta: { fontSize: 11, color: COLORS.muted },
  billMetaDim: { fontSize: 10, color: COLORS.muted, marginTop: 1.5, opacity: 0.85 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  statusPaid: { backgroundColor: COLORS.aiCardBg },
  statusUnpaid: { backgroundColor: COLORS.dangerBg },
  statusRefunded: { backgroundColor: COLORS.dangerBg },
  statusText: { fontSize: 9, fontWeight: '700', color: COLORS.heading },
  itemsBox: { backgroundColor: COLORS.background, paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingVertical: isDesktopWeb ? 10 : 7.5 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 3 },
  itemName: { flex: 1, fontSize: 12, color: COLORS.heading },
  itemAmt: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  itemVoided: { textDecorationLine: 'line-through', color: COLORS.muted },
  itemTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.divider },
  itemTotalLabel: { fontSize: 11, color: COLORS.muted },
  itemTotalValue: { fontSize: 13, fontWeight: '700', color: COLORS.heading },
  exportRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 16 : 12, gap: 8, marginTop: 16 },
  exportPdfBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: 8 },
  exportPdfText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  exportExcelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.cardAlt, borderRadius: 6, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.divider },
  exportExcelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
});
