import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { InitialsAvatar } from '../../../../../shared/components/InitialsAvatar';
import { showToast } from '../../../../../core/store/uiSlice';
import { confirmAlert } from '../../../../../shared/components/ConfirmDialogHost';
import {
  usePayrollRun, useLockPayrollRun, useReopenPayrollRun, useMarkPayrollRunPaid, useDeletePayrollRun, useUpdatePayrollLine,
} from '../../../../../core/api/hooks/usePayroll';
import { PayrollLine } from '../../../../../core/api/payrollApi';
import { payrollApi } from '../../../../../core/api/payrollApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { downloadAndShare } from '../../../../../core/utils/fileDownload';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

export const PayrollRunDetailScreen = ({ navigation, route }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const role = useSelector((s: any) => s.auth.user?.role);
  const runId: number = route?.params?.runId;

  const { data: run, isLoading, isError, refetch } = usePayrollRun(runId ?? null);
  const lockRun = useLockPayrollRun();
  const reopenRun = useReopenPayrollRun();
  const markPaid = useMarkPayrollRunPaid();
  const deleteRun = useDeletePayrollRun();
  const updateLine = useUpdatePayrollLine();

  const [allowanceLine, setAllowanceLine] = useState<PayrollLine | null>(null);
  const [allowanceName, setAllowanceName] = useState('');
  const [allowanceAmount, setAllowanceAmount] = useState('');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);

  if (isLoading) return <View style={styles.container}><SkeletonList rows={5} /></View>;
  if (isError || !run) {
    return (
      <View style={styles.container}>
        <ErrorState title="Couldn't load this payroll run" message="Check your connection and try again." onRetry={() => refetch()} />
      </View>
    );
  }

  const isDraft = run.status === 'DRAFT';
  const isLocked = run.status === 'LOCKED';
  const isOwner = role === 'Owner';

  const handleLock = () => confirmAlert('Lock Payroll', 'Locking freezes every line — no further edits until reopened. Continue?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Lock', onPress: () => lockRun.mutate(run.id) },
  ]);

  const handleReopen = () => confirmAlert('Reopen Payroll', 'This unlocks the run for editing again.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reopen', onPress: () => reopenRun.mutate(run.id) },
  ]);

  const handleMarkPaid = () => confirmAlert('Mark Paid', 'This deducts each staff member\'s loan EMI for this period and can\'t be undone. Continue?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Mark Paid', onPress: () => markPaid.mutate(run.id) },
  ]);

  const handleDelete = () => confirmAlert('Delete Draft', 'Delete this draft payroll run? You can regenerate it later.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await deleteRun.mutateAsync(run.id); navigation?.goBack?.(); } },
  ]);

  const openAllowanceModal = (line: PayrollLine) => {
    setAllowanceLine(line);
    setAllowanceName('');
    setAllowanceAmount('');
  };

  const submitAllowance = async () => {
    if (!allowanceLine) return;
    const amount = parseFloat(allowanceAmount);
    if (!allowanceName.trim() || !amount || amount <= 0) {
      dispatch(showToast({ message: 'Enter a name and a positive amount.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await updateLine.mutateAsync({
        runId: run.id,
        lineId: allowanceLine.id,
        req: { allowances: [...allowanceLine.allowances, { name: allowanceName.trim(), amount }] },
      });
      setAllowanceLine(null);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add allowance'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const downloadPayslip = async (line: PayrollLine) => {
    setDownloadingId(line.id);
    try {
      await downloadAndShare(payrollApi.payslipPdfPath(run.id, line.id), `payslip-${line.staffName}-${run.periodStart}.pdf`, 'application/pdf');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not download payslip'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setDownloadingId(null);
    }
  };

  const exportBankCsv = async () => {
    setExportingCsv(true);
    try {
      await downloadAndShare(payrollApi.bankExportPath(run.id), `bank-export-${run.periodStart}.csv`, 'text/csv');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not export bank CSV'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setExportingCsv(false);
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="cash-multiple" title="Payroll Run" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{run.periodStart} → {run.periodEnd}</Text>
            <Text style={styles.headerSubtitle}>{run.status} · {run.staffCount} staff · ₹{run.totalNetSalary.toFixed(2)} net</Text>
          </View>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow}>
        {isDraft && (
          <TouchableOpacity style={styles.actionBtn} onPress={handleLock}>
            <Icon name="lock-outline" size={16} color={COLORS.heading} />
            <Text style={styles.actionBtnText}>Lock</Text>
          </TouchableOpacity>
        )}
        {isLocked && isOwner && (
          <TouchableOpacity style={styles.actionBtn} onPress={handleReopen}>
            <Icon name="lock-open-outline" size={16} color={COLORS.heading} />
            <Text style={styles.actionBtnText}>Reopen</Text>
          </TouchableOpacity>
        )}
        {isLocked && (
          <TouchableOpacity style={styles.actionBtnPrimary} onPress={handleMarkPaid}>
            <Icon name="check-circle-outline" size={16} color="#FFFFFF" />
            <Text style={styles.actionBtnPrimaryText}>Mark Paid</Text>
          </TouchableOpacity>
        )}
        {isDraft && (
          <TouchableOpacity style={styles.actionBtnDanger} onPress={handleDelete}>
            <Icon name="delete-outline" size={16} color={COLORS.dangerAccent} />
            <Text style={styles.actionBtnDangerText}>Delete</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.actionBtn} onPress={exportBankCsv} disabled={exportingCsv}>
          {exportingCsv ? <ActivityIndicator size="small" color={COLORS.heading} /> : <Icon name="bank-outline" size={16} color={COLORS.heading} />}
          <Text style={styles.actionBtnText}>Bank CSV</Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {(run.lines ?? []).map((line) => (
          <View key={line.id} style={styles.card}>
            <View style={styles.cardTopRow}>
              <InitialsAvatar name={line.staffName} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.staffName}>{line.staffName}</Text>
                <Text style={styles.metaText}>{line.presentDays} present · {line.lateDays} late · {line.unpaidLeaveDays} unpaid leave</Text>
              </View>
              <Text style={styles.netSalary}>₹{line.netSalary.toFixed(2)}</Text>
            </View>

            <View style={styles.breakdownGrid}>
              <Text style={styles.breakdownItem}>Basic ₹{line.basicSalary.toFixed(2)}</Text>
              <Text style={styles.breakdownItem}>OT ₹{line.overtimePay.toFixed(2)}</Text>
              <Text style={styles.breakdownItem}>Allowances ₹{line.allowancesTotal.toFixed(2)}</Text>
              <Text style={styles.breakdownItem}>Gross ₹{line.grossEarnings.toFixed(2)}</Text>
              <Text style={styles.breakdownItem}>PF ₹{line.pfDeduction.toFixed(2)}</Text>
              <Text style={styles.breakdownItem}>ESIC ₹{line.esicDeduction.toFixed(2)}</Text>
              <Text style={styles.breakdownItem}>PT ₹{line.professionalTaxDeduction.toFixed(2)}</Text>
              <Text style={styles.breakdownItem}>Loan ₹{line.loanDeduction.toFixed(2)}</Text>
              <Text style={styles.breakdownItem}>Deductions ₹{line.totalDeductions.toFixed(2)}</Text>
            </View>

            <View style={styles.lineActionRow}>
              {isDraft && (
                <TouchableOpacity style={styles.lineActionBtn} onPress={() => openAllowanceModal(line)}>
                  <Icon name="plus" size={14} color={COLORS.heading} />
                  <Text style={styles.lineActionText}>Allowance</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.lineActionBtn} onPress={() => downloadPayslip(line)} disabled={downloadingId === line.id}>
                {downloadingId === line.id ? <ActivityIndicator size="small" color={COLORS.heading} /> : <Icon name="file-pdf-box" size={14} color={COLORS.heading} />}
                <Text style={styles.lineActionText}>Payslip</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!allowanceLine} transparent animationType="fade" onRequestClose={() => setAllowanceLine(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>
                Add Allowance for {allowanceLine?.staffName}
              </Text>
              <TouchableOpacity onPress={() => setAllowanceLine(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>Name</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput style={styles.textInput} placeholder="e.g. Travel Allowance" placeholderTextColor={COLORS.placeholder} value={allowanceName} onChangeText={setAllowanceName} />
            </View>
            <Text style={styles.fieldLabel}>Amount</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput style={styles.textInput} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={COLORS.placeholder} value={allowanceAmount} onChangeText={setAllowanceAmount} />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAllowanceLine(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={submitAllowance} disabled={updateLine.isPending}>
                {updateLine.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="check" size={14} color="#FFFFFF" />}
                <Text style={styles.modalSaveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7.5 : 7.5, paddingHorizontal: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 9 : 9 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  headerSubtitle: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 1.5 : 1.5 },
  actionRow: { paddingHorizontal: isDesktopWeb ? 12 : 12, gap: isDesktopWeb ? 7.5 : 7.5, paddingBottom: isDesktopWeb ? 9 : 9 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4.5 : 4.5, paddingHorizontal: isDesktopWeb ? 10.5 : 10.5, paddingVertical: isDesktopWeb ? 6.75 : 6.75, borderRadius: 8, backgroundColor: COLORS.cardAlt },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  actionBtnPrimary: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4.5 : 4.5, paddingHorizontal: isDesktopWeb ? 10.5 : 10.5, paddingVertical: isDesktopWeb ? 6.75 : 6.75, borderRadius: 8, backgroundColor: COLORS.button },
  actionBtnPrimaryText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  actionBtnDanger: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4.5 : 4.5, paddingHorizontal: isDesktopWeb ? 10.5 : 10.5, paddingVertical: isDesktopWeb ? 6.75 : 6.75, borderRadius: 8, backgroundColor: COLORS.dangerBg },
  actionBtnDangerText: { fontSize: 12, fontWeight: '700', color: COLORS.dangerAccent },
  card: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 10.5 : 10.5, marginBottom: isDesktopWeb ? 9 : 9 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7.5 : 7.5 },
  staffName: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '700', color: COLORS.heading },
  metaText: { fontSize: 11, color: COLORS.muted, marginTop: isDesktopWeb ? 1.5 : 1.5 },
  netSalary: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: '800', color: COLORS.heading },
  breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 6 : 6, marginTop: isDesktopWeb ? 7.5 : 7.5 },
  breakdownItem: { fontSize: 11, color: COLORS.muted },
  lineActionRow: { flexDirection: 'row', gap: isDesktopWeb ? 7.5 : 7.5, marginTop: isDesktopWeb ? 9 : 9 },
  lineActionBtn: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4.5 : 4.5, paddingHorizontal: isDesktopWeb ? 9 : 9, paddingVertical: isDesktopWeb ? 6 : 6, borderRadius: 6, backgroundColor: COLORS.background },
  lineActionText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 15 : 15 },
  modalSheet: { backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 12 : 12, width: '100%', maxWidth: 440, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 6, flexShrink: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 3, marginTop: isDesktopWeb ? 4.5 : 4.5 },
  textInput: { backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingHorizontal: 7.5, paddingVertical: 6, fontSize: 16, color: COLORS.heading },
  modalActions: { flexDirection: 'row', gap: 6, marginTop: 9 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7.5, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4.5, paddingVertical: 7.5, borderRadius: 6, backgroundColor: COLORS.button },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
