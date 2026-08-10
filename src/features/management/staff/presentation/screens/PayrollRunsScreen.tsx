import React, { useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { usePayrollRuns, useGeneratePayrollRun } from '../../../../../core/api/hooks/usePayroll';
import { PayrollRunStatus } from '../../../../../core/api/payrollApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { DatePickerModal } from '../../../../../shared/components/atoms/DatePickerModal';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const pad = (n: number) => n.toString().padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const STATUS_LABEL: Record<PayrollRunStatus, string> = { DRAFT: 'Draft', LOCKED: 'Locked', PAID: 'Paid' };

const defaultMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toDateInput(start), end: toDateInput(end) };
};

export const PayrollRunsScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const STATUS_STYLES: Record<PayrollRunStatus, { bg: string; text: string }> = {
    DRAFT: { bg: COLORS.proTipBg, text: COLORS.accent },
    LOCKED: { bg: COLORS.cardAlt, text: COLORS.heading },
    PAID: { bg: '#E3F3EA', text: COLORS.success },
  };
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  const { data: runs = [], isLoading, isError, refetch } = usePayrollRuns();
  const generateRun = useGeneratePayrollRun();

  const [modalVisible, setModalVisible] = useState(false);
  const [datePickerType, setDatePickerType] = useState<'start' | 'end' | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const openModal = () => {
    const range = defaultMonthRange();
    setPeriodStart(range.start);
    setPeriodEnd(range.end);
    setModalVisible(true);
  };

  const submitGenerate = async () => {
    if (!periodStart || !periodEnd || periodEnd < periodStart) {
      dispatch(showToast({ message: 'Enter a valid period (end on or after start).', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      const run = await generateRun.mutateAsync({ periodStart, periodEnd });
      dispatch(showToast({ message: 'Payroll generated.', icon: 'check-circle-outline', tone: 'success' }));
      setModalVisible(false);
      navigation?.navigate?.('PayrollRunDetail', { runId: run.id });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not generate payroll'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="cash-multiple" title="Payroll" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.headerTitle}>Payroll</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {isError && runs.length === 0 ? (
          <ErrorState title="Couldn't load payroll runs" message="Check your connection and try again." onRetry={() => refetch()} />
        ) : isLoading ? (
          <SkeletonList rows={4} />
        ) : runs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="cash-multiple" size={28} color={COLORS.muted} />
            <Text style={styles.emptyText}>No payroll generated yet.</Text>
          </View>
        ) : (
          runs.map((run) => {
            const variant = STATUS_STYLES[run.status];
            return (
              <TouchableOpacity key={run.id} style={styles.card} onPress={() => navigation?.navigate?.('PayrollRunDetail', { runId: run.id })}>
                <View style={styles.cardTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.periodText}>{run.periodStart} → {run.periodEnd}</Text>
                    <Text style={styles.metaText}>{run.staffCount} staff · ₹{run.totalNetSalary.toFixed(2)} net</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: variant.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: variant.text }]}>{STATUS_LABEL[run.status]}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openModal}>
        <Icon name="plus" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Generate Payroll</Text>
              <CloseButton onPress={() => setModalVisible(false)} size={18} />
            </View>

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Period Start</Text>
                <TouchableOpacity style={[styles.textInput, { justifyContent: 'center' }]} onPress={() => setDatePickerType('start')}>
                  <Text style={{ fontSize: 12, color: periodStart ? COLORS.heading : COLORS.placeholder, paddingTop: 2 }}>{periodStart || 'YYYY-MM-DD'}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Period End</Text>
                <TouchableOpacity style={[styles.textInput, { justifyContent: 'center' }]} onPress={() => setDatePickerType('end')}>
                  <Text style={{ fontSize: 12, color: periodEnd ? COLORS.heading : COLORS.placeholder, paddingTop: 2 }}>{periodEnd || 'YYYY-MM-DD'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={submitGenerate} disabled={generateRun.isPending}>
                {generateRun.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="check" size={14} color="#FFFFFF" />}
                <Text style={styles.modalSaveText}>Generate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <DatePickerModal
        visible={datePickerType === 'start'}
        value={periodStart}
        title="Select Period Start"
        onCancel={() => setDatePickerType(null)}
        onConfirm={(selectedDate) => {
          setPeriodStart(selectedDate);
          setDatePickerType(null);
        }}
      />

      <DatePickerModal
        visible={datePickerType === 'end'}
        value={periodEnd}
        title="Select Period End"
        onCancel={() => setDatePickerType(null)}
        onConfirm={(selectedDate) => {
          setPeriodEnd(selectedDate);
          setDatePickerType(null);
        }}
      />
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7 : 10, paddingHorizontal: isDesktopWeb ? 12 : 16, paddingBottom: isDesktopWeb ? 9 : 12 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.heading },
  emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 37 : 50, gap: isDesktopWeb ? 6 : 8 },
  emptyText: { fontSize: 13, color: COLORS.muted },
  card: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 10.5 : 14, marginBottom: isDesktopWeb ? 9 : 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7 : 10 },
  periodText: { fontSize: 15, fontWeight: '700', color: COLORS.heading },
  metaText: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 1.5 : 2 },
  statusBadge: { paddingHorizontal: isDesktopWeb ? 7.5 : 10, paddingVertical: isDesktopWeb ? 3 : 4, borderRadius: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  fab: {
    position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.button, alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 15 : 20 },
  modalSheet: { backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 12 : 16, width: '100%', maxWidth: 440, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 8 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 8, flexShrink: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 4, marginTop: isDesktopWeb ? 4.5 : 6 },
  rowFields: { flexDirection: 'row', gap: isDesktopWeb ? 4.5 : 6 },
  textInput: { backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: isDesktopWeb ? 6 : 8, fontSize: 12, color: COLORS.heading },
  modalActions: { flexDirection: 'row', gap: isDesktopWeb ? 6 : 8, marginTop: isDesktopWeb ? 9 : 12 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 7.5 : 10, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 4.5 : 6, paddingVertical: isDesktopWeb ? 7.5 : 10, borderRadius: 6, backgroundColor: COLORS.button },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
