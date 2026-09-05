import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector, useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useTaxGstReport, useTaxInputReport } from '../../../../../core/api/hooks/useReports';
import { useBranches } from '../../../../../core/api/hooks/useBranches';
import { RootState } from '../../../../../core/store/rootReducer';
import { showToast } from '../../../../../core/store/uiSlice';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';
import { DateRangeFilter, RangePreset, rangeForPreset, rangeLabelFor } from '../../../../../shared/components/reports/DateRangeFilter';
import { ReportExportService } from '../../../../../core/utils/reportExport';

export const TaxGstReportScreen = () => {
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
  const { data, isLoading, isError, refetch } = useTaxGstReport({ ...range, branchId: activeBranchId });
  // Input tax is deliberately NOT branch-filtered — expenses and purchase orders carry no
  // branch of their own, so a branch-scoped output figure sits beside a whole-cafe credit.
  // The net-position card says so rather than implying the two were filtered alike.
  const { data: input } = useTaxInputReport(range);

  const runExport = async (format: 'pdf' | 'excel') => {
    if (!data) return;
    setExporting(format);
    try {
      const def = {
        title: 'Tax / GST Report',
        businessName: activeBranchName,
        dateRangeLabel: `${rangeLabel} · ${activeBranchName}`,
        sections: [{
          title: 'Tax collected by rate',
          columns: [
            { key: 'rate', label: 'Rate' },
            { key: 'taxable', label: 'Taxable Amount', align: 'right' as const },
            { key: 'tax', label: 'Tax Collected', align: 'right' as const },
            { key: 'lines', label: 'Line Items', align: 'right' as const },
          ],
          rows: data.byRate.map((r) => ({ rate: `${r.ratePct}%`, taxable: r.taxableAmount, tax: r.taxAmount, lines: r.lineCount })),
          totalsRow: { rate: 'Total', taxable: data.totalTaxableAmount, tax: data.totalTaxCollected, lines: '' },
        },
        // Only when codes exist — a sheet of "Not set" rows is worse than no sheet.
        ...(data.byHsn.some((h) => h.hsnCode) ? [{
          title: 'HSN / SAC summary',
          columns: [
            { key: 'hsn', label: 'HSN/SAC' },
            { key: 'rate', label: 'Rate' },
            { key: 'taxable', label: 'Taxable Amount', align: 'right' as const },
            { key: 'tax', label: 'Tax', align: 'right' as const },
            { key: 'lines', label: 'Line Items', align: 'right' as const },
          ],
          rows: data.byHsn.map((h) => ({
            hsn: h.hsnCode ?? 'Not set',
            rate: `${h.ratePct}%`,
            taxable: h.taxableAmount,
            tax: h.taxAmount,
            lines: h.lineCount,
          })),
          totalsRow: { hsn: 'Total', rate: '', taxable: data.totalTaxableAmount, tax: data.totalTaxCollected, lines: '' },
        }] : []),
        // The credit side, and the net position it leaves. Skipped when nothing in the period
        // had a rate recorded, since an all-zero sheet reads as "no credit due" rather than
        // "nobody entered the rates".
        ...(input && input.bySource.length > 0 ? [{
          title: 'Input tax (ITC) on purchases and expenses',
          columns: [
            { key: 'source', label: 'Source' },
            { key: 'gross', label: 'Amount Paid', align: 'right' as const },
            { key: 'taxable', label: 'Taxable Amount', align: 'right' as const },
            { key: 'tax', label: 'Input Tax', align: 'right' as const },
          ],
          rows: [
            ...input.bySource.map((s) => ({
              source: s.source, gross: s.grossAmount, taxable: s.taxableAmount, tax: s.taxAmount,
            })),
            // Called out as its own row rather than left implicit: it is spend that may be
            // hiding claimable credit, not spend that was exempt.
            ...(input.unrecordedGrossAmount > 0
              ? [{ source: 'No GST rate recorded', gross: input.unrecordedGrossAmount, taxable: '', tax: '' }]
              : []),
            { source: 'Output tax collected', gross: '', taxable: '', tax: input.outputTaxCollected },
          ],
          totalsRow: { source: 'Net GST payable', gross: '', taxable: '', tax: input.netTaxPayable },
        }] : []),
        {
          title: 'Bill-wise detail',
          columns: [
            { key: 'bill', label: 'Bill' },
            { key: 'date', label: 'Date' },
            { key: 'taxable', label: 'Taxable Amount', align: 'right' as const },
            { key: 'tax', label: 'Tax', align: 'right' as const },
            { key: 'refunded', label: 'Reversed by Refund', align: 'right' as const },
          ],
          rows: data.bills.map((b) => ({
            bill: `${b.orderNumber} ${b.title}`,
            date: new Date(b.createdAt).toLocaleDateString(),
            taxable: b.taxableAmount,
            tax: b.taxAmount,
            refunded: b.refundedTaxAmount || '',
          })),
          totalsRow: {
            bill: 'Total', date: '',
            taxable: data.totalTaxableAmount, tax: data.totalTaxCollected,
            refunded: data.refundedTaxAmount,
          },
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

  if (isError && !data) {
    return <View style={styles.container}><ErrorState title="Couldn't load tax/GST report" message="Check your connection and try again." onRetry={() => refetch()} /></View>;
  }

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="percent-outline" title="Tax / GST Report" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {!isDesktopWeb && (
          <>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="arrow-left" size={22} color={COLORS.heading} />
              </TouchableOpacity>
              <Text style={styles.title} numberOfLines={1}>Tax / GST Report</Text>
            </View>
            <Text style={styles.subtitle}>Tax collected, broken down by rate — for filing.</Text>
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
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>OUTPUT TAX COLLECTED</Text>
              <Text style={styles.totalValue}>₹{data.totalTaxCollected.toFixed(2)}</Text>
              <Text style={styles.totalSub}>on ₹{data.totalTaxableAmount.toFixed(2)} taxable amount</Text>
              {/* Refunds are shown as their own reversal rather than netted into the slabs
                  above — a return states supplies and credit notes separately. Hidden entirely
                  when nothing was refunded, which is the ordinary period. */}
              {data.refundedTaxAmount > 0 && (
                <>
                  <Text style={styles.reversalText}>
                    less ₹{data.refundedTaxAmount.toFixed(2)} reversed by refunds
                  </Text>
                  <Text style={styles.netText}>
                    Net tax on sales: ₹{data.netTaxAmount.toFixed(2)}
                  </Text>
                </>
              )}
            </View>

            {/* The one figure an accountant is actually after: output minus input. Rendered only
                once the input report has loaded, so the card never flashes a net position that
                is really just the output tax with no credit taken off it yet. */}
            {input && (
              <View style={styles.netCard}>
                <Text style={styles.netCardLabel}>NET GST PAYABLE</Text>
                <Text style={styles.netCardValue}>₹{input.netTaxPayable.toFixed(2)}</Text>
                <Text style={styles.totalSub}>
                  ₹{input.outputTaxCollected.toFixed(2)} output − ₹{input.totalInputTax.toFixed(2)} input credit
                </Text>
                {/* Spend whose rate nobody recorded is NOT counted as exempt — flagged, because
                    every rupee of it may be hiding credit the cafe could have claimed. */}
                {input.unrecordedGrossAmount > 0 && (
                  <Text style={styles.warnText}>
                    ₹{input.unrecordedGrossAmount.toFixed(2)} of spend has no GST rate recorded — not counted as credit.
                  </Text>
                )}
                {activeBranchId !== null && (
                  <Text style={styles.warnText}>
                    Input credit is cafe-wide; expenses and purchases aren't branch-scoped.
                  </Text>
                )}
              </View>
            )}

            <View style={styles.tableCard}>
              {data.byRate.length === 0 ? (
                <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No taxed sales in this range.</Text>
              ) : (
                data.byRate.map((r, i) => (
                  <View key={r.ratePct} style={[styles.row, i !== data.byRate.length - 1 && styles.rowDivider]}>
                    <View style={styles.rowHeader}>
                      <Text style={styles.itemName}>{r.ratePct}% GST</Text>
                      <Text style={styles.itemValue}>₹{r.taxAmount.toFixed(2)}</Text>
                    </View>
                    <Text style={styles.metaText}>₹{r.taxableAmount.toFixed(2)} taxable · {r.lineCount} line item(s)</Text>
                  </View>
                ))
              )}
            </View>

            {/* Only when the cafe has entered codes — the whole section is noise otherwise,
                and a list of "Not set" rows tells nobody anything. */}
            {data.byHsn.some((h) => h.hsnCode) && (
              <>
                <Text style={styles.sectionHeading}>HSN / SAC Summary</Text>
                <View style={styles.tableCard}>
                  {data.byHsn.map((h, i) => (
                    <View key={`${h.hsnCode ?? 'none'}-${h.ratePct}`} style={[styles.row, i !== data.byHsn.length - 1 && styles.rowDivider]}>
                      <View style={styles.rowHeader}>
                        <Text style={styles.itemName}>{h.hsnCode ?? 'Not set'} · {h.ratePct}%</Text>
                        <Text style={styles.itemValue}>₹{h.taxAmount.toFixed(2)}</Text>
                      </View>
                      <Text style={styles.metaText}>₹{h.taxableAmount.toFixed(2)} taxable · {h.lineCount} line item(s)</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {input && input.bySource.length > 0 && (
              <>
                <Text style={styles.sectionHeading}>Input Tax (ITC)</Text>
                <View style={styles.tableCard}>
                  {input.bySource.map((s, i) => (
                    <View key={s.source} style={[styles.row, i !== input.bySource.length - 1 && styles.rowDivider]}>
                      <View style={styles.rowHeader}>
                        <Text style={styles.itemName}>{s.source}</Text>
                        <Text style={styles.itemValue}>₹{s.taxAmount.toFixed(2)}</Text>
                      </View>
                      <Text style={styles.metaText}>
                        ₹{s.grossAmount.toFixed(2)} paid · ₹{s.taxableAmount.toFixed(2)} taxable · {s.lineCount} entr{s.lineCount === 1 ? 'y' : 'ies'}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.sectionHeading}>Bill-wise Detail ({data.bills.length})</Text>
            <View style={styles.tableCard}>
              {data.bills.length === 0 ? (
                <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No taxed bills in this range.</Text>
              ) : (
                data.bills.map((b, i) => (
                  <View key={b.orderId} style={[styles.row, i !== data.bills.length - 1 && styles.rowDivider]}>
                    <View style={styles.rowHeader}>
                      <Text style={styles.itemName} numberOfLines={1}>{b.orderNumber} {b.title}</Text>
                      <Text style={styles.itemValue}>₹{b.taxAmount.toFixed(2)}</Text>
                    </View>
                    <Text style={styles.metaText}>
                      {new Date(b.createdAt).toLocaleDateString()} · ₹{b.taxableAmount.toFixed(2)} taxable
                      {b.refundedTaxAmount > 0 ? ` · ₹${b.refundedTaxAmount.toFixed(2)} reversed by refund` : ''}
                    </Text>
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
  totalCard: { backgroundColor: COLORS.aiCardBg, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: isDesktopWeb ? 14 : 10.5, marginBottom: isDesktopWeb ? 12 : 9 },
  totalLabel: { fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 0.5 },
  totalValue: { fontSize: isDesktopWeb ? 20 : 16, fontWeight: 'bold', color: COLORS.accent, marginTop: 4 },
  totalSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  reversalText: { fontSize: 11, color: COLORS.muted, marginTop: 4 },
  netText: { fontSize: 13, fontWeight: '700', color: COLORS.accent, marginTop: 2 },
  netCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: isDesktopWeb ? 14 : 10.5, marginBottom: isDesktopWeb ? 12 : 9, borderWidth: 1, borderColor: COLORS.divider },
  netCardLabel: { fontSize: 11, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 },
  netCardValue: { fontSize: isDesktopWeb ? 20 : 16, fontWeight: 'bold', color: COLORS.heading, marginTop: 4 },
  warnText: { fontSize: 11, color: COLORS.muted, marginTop: 6, fontStyle: 'italic' },
  sectionHeading: { fontSize: 12, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: 6, marginTop: 12 },
  tableCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, overflow: 'hidden' },
  row: { paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingVertical: isDesktopWeb ? 12 : 9 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  itemName: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: COLORS.heading },
  itemValue: { fontSize: 13, fontWeight: '700', color: COLORS.heading },
  metaText: { fontSize: 11, color: COLORS.muted },
  exportRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 16 : 12, gap: 8, marginTop: 12 },
  exportPdfBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: 8 },
  exportPdfText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  exportExcelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.cardAlt, borderRadius: 6, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.divider },
  exportExcelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
});
