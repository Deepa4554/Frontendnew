import React, { useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { InitialsAvatar } from '../../../../../shared/components/InitialsAvatar';
import { showToast } from '../../../../../core/store/uiSlice';
import { confirmAlert } from '../../../../../shared/components/ConfirmDialogHost';
import { useStaff } from '../../../../../core/api/hooks/useStaff';
import { useStaffLoans, useCreateStaffLoan, useCloseStaffLoan } from '../../../../../core/api/hooks/useLoans';
import { LoanStatus } from '../../../../../core/api/loansApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { CategoryFilterModal, CategoryFilterTrigger } from '../../../../../shared/components/molecules/CategoryFilterModal';
import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const TABS: { key: LoanStatus | 'All'; label: string }[] = [
  { key: 'All', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'CLOSED', label: 'Closed' },
];

type CreateLoanType = 'Advance' | 'Loan';
const LOAN_TYPES: { key: CreateLoanType; label: string }[] = [
  { key: 'Advance', label: 'Advance' },
  { key: 'Loan', label: 'Loan' },
];

export const LoansScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<LoanStatus | 'All'>('ACTIVE');
  const [tabPickerVisible, setTabPickerVisible] = useState(false);
  const { data: loans = [], isLoading, isError, refetch } = useStaffLoans(undefined, tab === 'All' ? undefined : tab);
  const { data: staff = [] } = useStaff();

  const createLoan = useCreateStaffLoan();
  const closeLoan = useCloseStaffLoan();

  const [modalVisible, setModalVisible] = useState(false);
  const [staffPickerVisible, setStaffPickerVisible] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [loanType, setLoanType] = useState<CreateLoanType>('Advance');
  const [principal, setPrincipal] = useState('');
  const [monthlyDeduction, setMonthlyDeduction] = useState('');
  const [reason, setReason] = useState('');

  const selectedStaff = staff.find((s) => s.id === selectedStaffId);

  const openModal = () => {
    setSelectedStaffId(null);
    setLoanType('Advance');
    setPrincipal('');
    setMonthlyDeduction('');
    setReason('');
    setModalVisible(true);
  };

  const submit = async () => {
    if (!selectedStaffId) {
      dispatch(showToast({ message: 'Choose which staff member this is for.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const principalNum = parseFloat(principal);
    const emiNum = parseFloat(monthlyDeduction);
    if (!principalNum || principalNum <= 0 || !emiNum || emiNum <= 0) {
      dispatch(showToast({ message: 'Enter a valid amount and monthly deduction.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await createLoan.mutateAsync({
        staffId: selectedStaffId,
        type: loanType,
        principalAmount: principalNum,
        monthlyDeduction: emiNum,
        reason: reason.trim() || undefined,
      });
      dispatch(showToast({ message: 'Recorded.', icon: 'check-circle-outline', tone: 'success' }));
      setModalVisible(false);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not record this'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleClose = (id: number, staffName: string) => {
    confirmAlert('Close Loan', `Mark this loan/advance for ${staffName} as fully settled?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close', onPress: () => closeLoan.mutate(id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="hand-coin-outline" title="Loans & Advances" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => navigation?.goBack?.()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Loans &amp; Advances</Text>
        </View>
      )}

      <CategoryFilterTrigger label={TABS.find((t) => t.key === tab)!.label} onPress={() => setTabPickerVisible(true)} />
      <CategoryFilterModal
        visible={tabPickerVisible}
        onClose={() => setTabPickerVisible(false)}
        title="Filter by Status"
        categories={TABS.map((t) => t.label)}
        activeCategory={TABS.find((t) => t.key === tab)!.label}
        onSelect={(label) => {
          const found = TABS.find((t) => t.label === label);
          if (found) setTab(found.key);
        }}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {isError && loans.length === 0 ? (
          <ErrorState title="Couldn't load loans" message="Check your connection and try again." onRetry={() => refetch()} />
        ) : isLoading ? (
          <SkeletonList rows={4} />
        ) : loans.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="hand-coin-outline" size={28} color={COLORS.muted} />
            <Text style={styles.emptyText}>No {tab === 'All' ? '' : tab.toLowerCase()} loans/advances.</Text>
          </View>
        ) : (
          loans.map((loan) => (
            <View key={loan.id} style={styles.card}>
              <View style={styles.cardTopRow}>
                <InitialsAvatar name={loan.staffName} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.staffName}>{loan.staffName}</Text>
                  <Text style={styles.metaText}>{loan.type === 'ADVANCE' ? 'Advance' : 'Loan'} · EMI {loan.monthlyDeduction.toFixed(2)}/mo</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: loan.status === 'ACTIVE' ? '#E3F3EA' : COLORS.cardAlt }]}>
                  <Text style={[styles.statusBadgeText, { color: loan.status === 'ACTIVE' ? COLORS.success : COLORS.muted }]}>{loan.status}</Text>
                </View>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Outstanding</Text>
                <Text style={styles.balanceValue}>₹{loan.outstandingBalance.toFixed(2)} / ₹{loan.principalAmount.toFixed(2)}</Text>
              </View>
              {!!loan.reason && <Text style={styles.reasonText}>{loan.reason}</Text>}
              {loan.status === 'ACTIVE' && (
                <TouchableOpacity style={styles.closeBtn} onPress={() => handleClose(loan.id, loan.staffName)}>
                  <Text style={styles.closeBtnText}>Mark Settled</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openModal}>
        <Icon name="plus" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>New Advance / Loan</Text>
              <CloseButton onPress={() => setModalVisible(false)} size={18} />
            </View>

            <Text style={styles.fieldLabel}>Staff Member</Text>
            <TouchableOpacity style={styles.staffSelect} onPress={() => setStaffPickerVisible(true)}>
              {selectedStaff ? (
                <>
                  <InitialsAvatar name={selectedStaff.name} size={28} />
                  <Text style={styles.staffSelectName}>{selectedStaff.name}</Text>
                </>
              ) : (
                <Text style={styles.placeholderText}>Choose staff member</Text>
              )}
              <View style={{ flex: 1 }} />
              <Icon name="chevron-down" size={14} color={COLORS.muted} />
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.typeRow}>
              {LOAN_TYPES.map((t) => (
                <TouchableOpacity key={t.key} style={[styles.typePill, loanType === t.key && styles.typePillActive]} onPress={() => setLoanType(t.key)}>
                  <Text style={[styles.typePillText, loanType === t.key && styles.typePillTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Amount</Text>
                <View style={{ borderRadius: 8 }}>
                  <TextInput style={styles.textInput} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={COLORS.placeholder} value={principal} onChangeText={setPrincipal} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Monthly Deduction</Text>
                <View style={{ borderRadius: 8 }}>
                  <TextInput style={styles.textInput} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={COLORS.placeholder} value={monthlyDeduction} onChangeText={setMonthlyDeduction} />
                </View>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Reason (optional)</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="e.g. Medical emergency"
                placeholderTextColor={COLORS.placeholder}
                value={reason}
                onChangeText={setReason}
                multiline
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={submit} disabled={createLoan.isPending}>
                {createLoan.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="check" size={14} color="#FFFFFF" />}
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={staffPickerVisible} transparent animationType="fade" onRequestClose={() => setStaffPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Choose Staff Member</Text>
              <CloseButton onPress={() => setStaffPickerVisible(false)} size={18} />
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {staff.map((s) => (
                <TouchableOpacity key={s.id} style={styles.staffOption} onPress={() => { setSelectedStaffId(s.id); setStaffPickerVisible(false); }}>
                  <InitialsAvatar name={s.name} size={32} />
                  <Text style={styles.staffSelectName}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7.5 : 7.5, paddingHorizontal: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 9 : 9 },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 37.5 : 37.5, gap: isDesktopWeb ? 6 : 6 },
  emptyText: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted },
  card: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 10.5 : 10.5, marginBottom: isDesktopWeb ? 9 : 9 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7.5 : 7.5 },
  staffName: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '700', color: COLORS.heading },
  metaText: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 1.5 : 1.5 },
  statusBadge: { paddingHorizontal: isDesktopWeb ? 7.5 : 7.5, paddingVertical: isDesktopWeb ? 3 : 3, borderRadius: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: isDesktopWeb ? 7.5 : 7.5 },
  balanceLabel: { fontSize: 12, color: COLORS.muted },
  balanceValue: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading },
  reasonText: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.heading, marginTop: isDesktopWeb ? 6 : 6 },
  closeBtn: { marginTop: isDesktopWeb ? 9 : 9, alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 7.5 : 7.5, borderRadius: 6, backgroundColor: COLORS.background },
  closeBtnText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading },
  fab: {
    position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.button, alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 15 : 15 },
  modalSheet: { backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 12 : 12, width: '100%', maxWidth: 440, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 6, flexShrink: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 3, marginTop: isDesktopWeb ? 4.5 : 4.5 },
  staffSelect: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 6, backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 7.5 : 7.5, paddingVertical: isDesktopWeb ? 6 : 6 },
  staffSelectName: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  placeholderText: { fontSize: 12, color: COLORS.placeholder },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 6 : 6 },
  typePill: { paddingHorizontal: isDesktopWeb ? 10.5 : 10.5, paddingVertical: isDesktopWeb ? 6 : 6, borderRadius: 20, backgroundColor: COLORS.cardAlt },
  typePillActive: { backgroundColor: COLORS.button },
  typePillText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  typePillTextActive: { color: '#FFFFFF' },
  rowFields: { flexDirection: 'row', gap: isDesktopWeb ? 4.5 : 4.5 },
  textInput: { backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 7.5 : 7.5, paddingVertical: isDesktopWeb ? 6 : 6, fontSize: isDesktopWeb ? 12 : 16, color: COLORS.heading },
  textArea: { minHeight: 60, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 6, marginTop: 9 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7.5, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4.5, paddingVertical: 7.5, borderRadius: 6, backgroundColor: COLORS.button },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  staffOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
});
