import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useMyLeaveRequests, useCreateMyLeaveRequest } from '../../../../../core/api/hooks/useStaff';
import { LeaveRequestStatus, LeaveType } from '../../../../../core/api/staffApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { DatePickerModal } from '../../../../../shared/components/atoms/DatePickerModal';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const LEAVE_TYPES: LeaveType[] = ['Sick', 'Casual', 'Paid', 'Unpaid'];

const isValidIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim());

export const MyLeaveScreen = ({ navigation }: any) => {
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

  const { data: requests = [], isLoading, isError, refetch } = useMyLeaveRequests();
  const createLeave = useCreateMyLeaveRequest();

  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [datePickerType, setDatePickerType] = useState<'start' | 'end' | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('Casual');
  const [reason, setReason] = useState('');

  const openRequestModal = () => {
    setStartDate('');
    setEndDate('');
    setLeaveType('Casual');
    setReason('');
    setRequestModalVisible(true);
  };

  const submitRequest = async () => {
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

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="calendar-remove-outline" title="My Leave" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Leave</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {isError && requests.length === 0 ? (
          <ErrorState
            title="Couldn't load your leave requests"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <SkeletonList rows={5} />
        ) : requests.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="calendar-check-outline" size={28} color={COLORS.muted} />
            <Text style={styles.emptyText}>You haven't requested any leave yet.</Text>
          </View>
        ) : (
          requests.map((req) => {
            const variant = STATUS_STYLES[req.status];
            return (
              <View key={req.id} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.leaveType}>{req.type} Leave</Text>
                    <Text style={styles.leaveMeta}>{req.startDate} → {req.endDate}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: variant.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: variant.text }]}>{req.status}</Text>
                  </View>
                </View>
                {!!req.reason && <Text style={styles.reasonText}>{req.reason}</Text>}
                {req.reviewedByName && (
                  <Text style={styles.reviewedText}>Reviewed by {req.reviewedByName}</Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openRequestModal}>
        <Icon name="plus" size={26} color="#FFFFFF" />
      </TouchableOpacity>

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
  leaveType: { fontSize: 15, fontWeight: '700', color: COLORS.heading },
  leaveMeta: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 1.5 : 2 },
  statusBadge: { paddingHorizontal: isDesktopWeb ? 7.5 : 10, paddingVertical: isDesktopWeb ? 3 : 4, borderRadius: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  reasonText: { fontSize: 13, color: COLORS.heading, marginTop: isDesktopWeb ? 7 : 10 },
  reviewedText: { fontSize: 11, color: COLORS.muted, marginTop: isDesktopWeb ? 4.5 : 6, fontStyle: 'italic' },
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
});
