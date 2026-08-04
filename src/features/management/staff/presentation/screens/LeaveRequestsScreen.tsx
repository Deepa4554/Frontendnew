import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { InitialsAvatar } from '../../../../../shared/components/InitialsAvatar';
import { showToast } from '../../../../../core/store/uiSlice';
import { confirmAlert } from '../../../../../shared/components/ConfirmDialogHost';
import { isOwnerOrManager } from '../../../../../core/auth/permissions';
import { useStaff } from '../../../../../core/api/hooks/useStaff';
import {
  useLeaveRequests,
  useCreateLeaveRequest,
  useApproveLeaveRequest,
  useRejectLeaveRequest,
  useReturnToWork,
} from '../../../../../core/api/hooks/useStaff';
import { LeaveRequest, LeaveRequestStatus, LeaveType } from '../../../../../core/api/staffApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { DatePickerModal } from '../../../../../shared/components/atoms/DatePickerModal';
import { CategoryFilterModal, CategoryFilterTrigger } from '../../../../../shared/components/molecules/CategoryFilterModal';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const TABS: { key: LeaveRequestStatus | 'All'; label: string }[] = [
  { key: 'All', label: 'All' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Approved', label: 'Approved' },
  { key: 'Rejected', label: 'Rejected' },
];

const LEAVE_TYPES: LeaveType[] = ['Sick', 'Casual', 'Paid', 'Unpaid'];

const isValidIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim());

export const LeaveRequestsScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const STATUS_STYLES: Record<LeaveRequestStatus, { bg: string; text: string }> = {
    Pending: { bg: COLORS.proTipBg, text: COLORS.accent },
    Approved: { bg: '#E3F3EA', text: COLORS.success },
    Rejected: { bg: COLORS.dangerBg, text: COLORS.dangerAccent },
  };
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const role = useSelector((s: any) => s.auth.user?.role);
  const canReview = isOwnerOrManager(role);

  const [tab, setTab] = useState<LeaveRequestStatus | 'All'>('Pending');
  const [tabPickerVisible, setTabPickerVisible] = useState(false);
  const { data: requests = [], isLoading, isError, refetch } = useLeaveRequests(tab === 'All' ? undefined : tab);
  const { data: staff = [] } = useStaff();

  const createLeave = useCreateLeaveRequest();
  const approveLeave = useApproveLeaveRequest();
  const rejectLeave = useRejectLeaveRequest();
  const returnToWork = useReturnToWork();

  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [staffPickerVisible, setStaffPickerVisible] = useState(false);
  const [datePickerType, setDatePickerType] = useState<'start' | 'end' | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('Casual');
  const [reason, setReason] = useState('');

  const selectedStaff = staff.find((s) => s.id === selectedStaffId);

  const openRequestModal = () => {
    setSelectedStaffId(null);
    setStartDate('');
    setEndDate('');
    setLeaveType('Casual');
    setReason('');
    setRequestModalVisible(true);
  };

  const submitRequest = async () => {
    if (!selectedStaffId) {
      dispatch(showToast({ message: 'Choose which staff member this leave is for.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
      dispatch(showToast({ message: 'Enter both dates as YYYY-MM-DD.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (endDate < startDate) {
      dispatch(showToast({ message: 'End date must be on or after the start date.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await createLeave.mutateAsync({
        staffId: selectedStaffId,
        startDate: startDate.trim(),
        endDate: endDate.trim(),
        type: leaveType,
        reason: reason.trim() || undefined,
      });
      dispatch(showToast({ message: 'Leave request submitted.', icon: 'check-circle-outline', tone: 'success' }));
      setRequestModalVisible(false);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not submit leave request'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleApprove = (req: LeaveRequest) => {
    confirmAlert('Approve Leave', `Approve ${req.staffName}'s leave (${req.startDate} to ${req.endDate})? They'll be marked On Leave immediately.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => approveLeave.mutate(req.id) },
    ]);
  };

  const handleReject = (req: LeaveRequest) => {
    confirmAlert('Reject Leave', `Reject ${req.staffName}'s leave request?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => rejectLeave.mutate({ id: req.id }) },
    ]);
  };

  const handleReturnToWork = (req: LeaveRequest) => {
    confirmAlert('Return to Work', `Mark ${req.staffName} as back at work?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => returnToWork.mutate(req.id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="calendar-remove-outline" title="Leave Requests" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Leave Requests</Text>
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
        {isError && requests.length === 0 ? (
          <ErrorState
            title="Couldn't load leave requests"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <SkeletonList rows={5} />
        ) : requests.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="calendar-check-outline" size={28} color={COLORS.muted} />
            <Text style={styles.emptyText}>No {tab === 'All' ? '' : tab.toLowerCase()} leave requests.</Text>
          </View>
        ) : (
          requests.map((req) => {
            const variant = STATUS_STYLES[req.status];
            return (
              <View key={req.id} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <InitialsAvatar name={req.staffName} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.staffName}>{req.staffName}</Text>
                    <Text style={styles.leaveMeta}>{req.type} · {req.startDate} → {req.endDate}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: variant.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: variant.text }]}>{req.status}</Text>
                  </View>
                </View>
                {!!req.reason && <Text style={styles.reasonText}>{req.reason}</Text>}
                {req.reviewedByName && (
                  <Text style={styles.reviewedText}>Reviewed by {req.reviewedByName}</Text>
                )}

                {canReview && req.status === 'Pending' && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => handleReject(req)}>
                      <Icon name="close" size={16} color={COLORS.dangerAccent} />
                      <Text style={styles.rejectBtnText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(req)}>
                      <Icon name="check" size={16} color="#FFFFFF" />
                      <Text style={styles.approveBtnText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {canReview && req.status === 'Approved' && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.returnBtn} onPress={() => handleReturnToWork(req)}>
                      <Icon name="briefcase-check-outline" size={16} color={COLORS.heading} />
                      <Text style={styles.returnBtnText}>Mark Back at Work</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* On-behalf-of filing (arbitrary staff picker) is Owner/Manager only — matches
          the backend's CreateLeaveRequest gate. Everyone else uses "My Leave" instead. */}
      {canReview && (
        <TouchableOpacity style={styles.fab} onPress={openRequestModal}>
          <Icon name="plus" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* ---------- Request Leave Modal ---------- */}
      <Modal visible={requestModalVisible} transparent animationType="fade" onRequestClose={() => setRequestModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Request Leave</Text>
              <TouchableOpacity onPress={() => setRequestModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
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

            <Text style={styles.fieldLabel}>Leave Type</Text>
            <View style={styles.typeRow}>
              {LEAVE_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typePill, leaveType === t && styles.typePillActive]}
                  onPress={() => setLeaveType(t)}
                >
                  <Text style={[styles.typePillText, leaveType === t && styles.typePillTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>From</Text>
                <TouchableOpacity style={[styles.textInput, { justifyContent: 'center' }]} onPress={() => setDatePickerType('start')}>
                  <Text style={{ fontSize: 12, color: startDate ? COLORS.heading : COLORS.placeholder, paddingTop: 2 }}>
                    {startDate || 'YYYY-MM-DD'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>To</Text>
                <TouchableOpacity style={[styles.textInput, { justifyContent: 'center' }]} onPress={() => setDatePickerType('end')}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: endDate ? COLORS.heading : COLORS.placeholder, paddingTop: 2 }}>
                    {endDate || 'YYYY-MM-DD'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Reason (optional)</Text>
            <View style={styles.reasonInputWrap}>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="e.g. Family function"
                placeholderTextColor={COLORS.placeholder}
                value={reason}
                onChangeText={setReason}
                multiline
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRequestModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={submitRequest} disabled={createLeave.isPending}>
                {createLeave.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Icon name="check" size={14} color="#FFFFFF" />
                )}
                <Text style={styles.modalSaveText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Staff Picker ---------- */}
      <Modal visible={staffPickerVisible} transparent animationType="fade" onRequestClose={() => setStaffPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Choose Staff Member</Text>
              <TouchableOpacity onPress={() => setStaffPickerVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {staff.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.staffOption}
                  onPress={() => { setSelectedStaffId(s.id); setStaffPickerVisible(false); }}
                >
                  <InitialsAvatar name={s.name} size={32} />
                  <View>
                    <Text style={styles.staffSelectName}>{s.name}</Text>
                    <Text style={styles.fieldLabel}>{s.role}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {staff.length === 0 && <Text style={styles.placeholderText}>No staff yet — add one from Team Portal first.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <DatePickerModal
        visible={datePickerType === 'start'}
        value={startDate}
        title="Select Start Date"
        onCancel={() => setDatePickerType(null)}
        onConfirm={(selectedDate) => {
          setStartDate(selectedDate);
          setDatePickerType(null);
        }}
      />

      <DatePickerModal
        visible={datePickerType === 'end'}
        value={endDate}
        title="Select End Date"
        onCancel={() => setDatePickerType(null)}
        onConfirm={(selectedDate) => {
          setEndDate(selectedDate);
          setDatePickerType(null);
        }}
      />
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 7.5 : 10,
    paddingHorizontal: isDesktopWeb ? 12 : 16,
    paddingTop: 12,
    paddingBottom: isDesktopWeb ? 9 : 12,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.heading },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: isDesktopWeb ? 37.5 : 50,
    gap: isDesktopWeb ? 6 : 8,
  },
  emptyText: { fontSize: 13, color: COLORS.muted },
  card: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 10.5 : 14,
    marginBottom: isDesktopWeb ? 9 : 12,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7.5 : 10 },
  staffName: { fontSize: 15, fontWeight: '700', color: COLORS.heading },
  leaveMeta: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 1.5 : 2 },
  statusBadge: { paddingHorizontal: isDesktopWeb ? 7.5 : 10, paddingVertical: isDesktopWeb ? 3 : 4, borderRadius: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  reasonText: { fontSize: 13, color: COLORS.heading, marginTop: isDesktopWeb ? 7 : 10 },
  reviewedText: { fontSize: 11, color: COLORS.muted, marginTop: isDesktopWeb ? 4.5 : 6, fontStyle: 'italic' },
  actionRow: { flexDirection: 'row', gap: isDesktopWeb ? 7.5 : 10, marginTop: isDesktopWeb ? 9 : 12 },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 4.5 : 6,
    backgroundColor: COLORS.dangerBg,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 7.5 : 10,
  },
  rejectBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.dangerAccent },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 4.5 : 6,
    backgroundColor: COLORS.success,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 7.5 : 10,
  },
  approveBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  returnBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 4.5 : 6,
    backgroundColor: COLORS.background,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 7.5 : 10,
  },
  returnBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.heading },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.button,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isDesktopWeb ? 14 : 20,
  },
  modalSheet: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: isDesktopWeb ? 12 : 16,
    width: '100%',
    maxWidth: 440,
    overflow: 'hidden',
  },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 8 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 8, flexShrink: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 4, marginTop: isDesktopWeb ? 4.5 : 6 },
  staffSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 8,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 7.5 : 10,
    paddingVertical: isDesktopWeb ? 6 : 8,
  },
  staffSelectName: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  placeholderText: { fontSize: 12, color: COLORS.placeholder },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 6 : 8 },
  typePill: {
    paddingHorizontal: isDesktopWeb ? 10.5 : 14,
    paddingVertical: isDesktopWeb ? 6 : 8,
    borderRadius: 20,
    backgroundColor: COLORS.cardAlt,
  },
  typePillActive: { backgroundColor: COLORS.button },
  typePillText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  typePillTextActive: { color: '#FFFFFF' },
  dateRow: { flexDirection: 'row', gap: isDesktopWeb ? 4.5 : 6 },
  reasonInputWrap: { borderRadius: 8 },
  textInput: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: isDesktopWeb ? 6 : undefined,
    height: isDesktopWeb ? undefined : 34,
    fontSize: 12,
    color: COLORS.heading,
  },
  textArea: { height: 60, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: isDesktopWeb ? 6 : 8, marginTop: isDesktopWeb ? 9 : 12 },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: isDesktopWeb ? 7.5 : 10,
    borderRadius: 6,
    backgroundColor: COLORS.cardAlt,
  },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 4.5 : 6,
    paddingVertical: isDesktopWeb ? 7.5 : 10,
    borderRadius: 6,
    backgroundColor: COLORS.button,
  },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  staffOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 8,
    paddingVertical: isDesktopWeb ? 6 : 8,
  },
});
