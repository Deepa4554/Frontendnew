import React, { useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { InitialsAvatar } from '../../../../../shared/components/InitialsAvatar';
import { showToast } from '../../../../../core/store/uiSlice';
import { useStaff } from '../../../../../core/api/hooks/useStaff';
import { useAttendanceList, useCreateManualAttendance, useCorrectAttendance } from '../../../../../core/api/hooks/useAttendance';
import { AttendanceRecord, AttendanceStatus } from '../../../../../core/api/attendanceApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const pad = (n: number) => n.toString().padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  HALF_DAY: 'Half Day',
  ABSENT: 'Absent',
  ON_LEAVE: 'On Leave',
  HOLIDAY: 'Holiday',
};

export const AttendanceScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const STATUS_STYLES: Record<AttendanceStatus, { bg: string; text: string }> = {
    PRESENT: { bg: '#E3F3EA', text: COLORS.success },
    LATE: { bg: COLORS.proTipBg, text: COLORS.accent },
    HALF_DAY: { bg: COLORS.proTipBg, text: COLORS.accent },
    ABSENT: { bg: COLORS.dangerBg, text: COLORS.dangerAccent },
    ON_LEAVE: { bg: COLORS.cardAlt, text: COLORS.muted },
    HOLIDAY: { bg: COLORS.cardAlt, text: COLORS.muted },
  };
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  const [date, setDate] = useState(toDateInput(new Date()));
  const { data: records = [], isLoading, isError, refetch } = useAttendanceList({ date });
  const { data: staff = [] } = useStaff();

  const shiftDate = (deltaDays: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    setDate(toDateInput(d));
  };

  const createManual = useCreateManualAttendance();
  const correctAttendance = useCorrectAttendance();

  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [staffPickerVisible, setStaffPickerVisible] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [punchInTime, setPunchInTime] = useState('09:00');
  const [punchOutTime, setPunchOutTime] = useState('17:00');
  const [breakMinutes, setBreakMinutes] = useState('0');
  const [editNote, setEditNote] = useState('');

  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editPunchIn, setEditPunchIn] = useState('');
  const [editPunchOut, setEditPunchOut] = useState('');
  const [editBreak, setEditBreak] = useState('0');
  const [editCorrectionNote, setEditCorrectionNote] = useState('');

  const selectedStaff = staff.find((s) => s.id === selectedStaffId);

  const openManualModal = () => {
    setSelectedStaffId(null);
    setPunchInTime('09:00');
    setPunchOutTime('17:00');
    setBreakMinutes('0');
    setEditNote('');
    setManualModalVisible(true);
  };

  const submitManual = async () => {
    if (!selectedStaffId) {
      dispatch(showToast({ message: 'Choose which staff member this entry is for.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (!editNote.trim()) {
      dispatch(showToast({ message: 'Add a note explaining this manual entry.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const parsedBreakMinutes = parseInt(breakMinutes, 10) || 0;
    if (parsedBreakMinutes < 0) {
      dispatch(showToast({ message: 'Break minutes cannot be negative.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await createManual.mutateAsync({
        staffId: selectedStaffId,
        date,
        punchInAt: punchInTime ? new Date(`${date}T${punchInTime}:00`).toISOString() : undefined,
        punchOutAt: punchOutTime ? new Date(`${date}T${punchOutTime}:00`).toISOString() : undefined,
        breakMinutes: parsedBreakMinutes,
        editNote: editNote.trim(),
      });
      dispatch(showToast({ message: 'Attendance recorded.', icon: 'check-circle-outline', tone: 'success' }));
      setManualModalVisible(false);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not record attendance'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const openEditModal = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setEditPunchIn(toTimeInput(rec.punchInAt));
    setEditPunchOut(toTimeInput(rec.punchOutAt));
    setEditBreak(String(rec.breakMinutes));
    setEditCorrectionNote('');
  };

  const submitCorrection = async () => {
    if (!editingRecord) return;
    if (!editCorrectionNote.trim()) {
      dispatch(showToast({ message: 'Add a note explaining this correction.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const parsedEditBreak = parseInt(editBreak, 10) || 0;
    if (parsedEditBreak < 0) {
      dispatch(showToast({ message: 'Break minutes cannot be negative.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await correctAttendance.mutateAsync({
        id: editingRecord.id,
        req: {
          punchInAt: editPunchIn ? new Date(`${editingRecord.date}T${editPunchIn}:00`).toISOString() : undefined,
          punchOutAt: editPunchOut ? new Date(`${editingRecord.date}T${editPunchOut}:00`).toISOString() : undefined,
          breakMinutes: parsedEditBreak,
          editNote: editCorrectionNote.trim(),
        },
      });
      dispatch(showToast({ message: 'Attendance corrected.', icon: 'check-circle-outline', tone: 'success' }));
      setEditingRecord(null);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not correct attendance'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="clock-check-outline" title="Attendance" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.headerTitle}>Attendance</Text>
        </View>
      )}

      <View style={styles.dateRow}>
        <TouchableOpacity style={styles.dateArrow} onPress={() => shiftDate(-1)}>
          <Icon name="chevron-left" size={22} color={COLORS.heading} />
        </TouchableOpacity>
        <Text style={styles.dateText}>{date}</Text>
        <TouchableOpacity style={styles.dateArrow} onPress={() => shiftDate(1)}>
          <Icon name="chevron-right" size={22} color={COLORS.heading} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {isError && records.length === 0 ? (
          <ErrorState title="Couldn't load attendance" message="Check your connection and try again." onRetry={() => refetch()} />
        ) : isLoading ? (
          <SkeletonList rows={5} />
        ) : records.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="clock-outline" size={28} color={COLORS.muted} />
            <Text style={styles.emptyText}>No attendance recorded for this day yet.</Text>
          </View>
        ) : (
          records.map((rec) => {
            const variant = STATUS_STYLES[rec.status];
            return (
              <TouchableOpacity key={rec.id} style={styles.card} onPress={() => openEditModal(rec)}>
                <View style={styles.cardTopRow}>
                  <InitialsAvatar name={rec.staffName} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.staffName}>{rec.staffName}</Text>
                    <Text style={styles.metaText}>
                      {rec.punchInAt ? toTimeInput(rec.punchInAt) : '--:--'} → {rec.punchOutAt ? toTimeInput(rec.punchOutAt) : '--:--'}
                      {rec.workedMinutes != null ? ` · ${(rec.workedMinutes / 60).toFixed(1)}h worked` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: variant.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: variant.text }]}>{STATUS_LABEL[rec.status]}</Text>
                  </View>
                </View>
                {(rec.lateMinutes > 0 || rec.overtimeMinutes > 0) && (
                  <Text style={styles.subMeta}>
                    {rec.lateMinutes > 0 ? `${rec.lateMinutes} min late` : ''}
                    {rec.lateMinutes > 0 && rec.overtimeMinutes > 0 ? ' · ' : ''}
                    {rec.overtimeMinutes > 0 ? `${rec.overtimeMinutes} min overtime` : ''}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openManualModal}>
        <Icon name="plus" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ---------- Manual Entry Modal ---------- */}
      <Modal visible={manualModalVisible} transparent animationType="fade" onRequestClose={() => setManualModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Record Attendance</Text>
              <CloseButton onPress={() => setManualModalVisible(false)} size={18} />
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

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Punch In</Text>
                <View style={{ borderRadius: 8 }}>
                  <TextInput style={styles.textInput} placeholder="HH:mm" placeholderTextColor={COLORS.placeholder} value={punchInTime} onChangeText={setPunchInTime} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Punch Out</Text>
                <View style={{ borderRadius: 8 }}>
                  <TextInput style={styles.textInput} placeholder="HH:mm" placeholderTextColor={COLORS.placeholder} value={punchOutTime} onChangeText={setPunchOutTime} />
                </View>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Break Minutes</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput style={styles.textInput} keyboardType="number-pad" value={breakMinutes} onChangeText={setBreakMinutes} />
            </View>

            <Text style={styles.fieldLabel}>Note (required)</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Why is this being entered manually?"
                placeholderTextColor={COLORS.placeholder}
                value={editNote}
                onChangeText={setEditNote}
                multiline
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setManualModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={submitManual} disabled={createManual.isPending}>
                {createManual.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="check" size={14} color="#FFFFFF" />}
                <Text style={styles.modalSaveText}>Save</Text>
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

      {/* ---------- Correction Modal ---------- */}
      <Modal visible={!!editingRecord} transparent animationType="fade" onRequestClose={() => setEditingRecord(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>
                Correct {editingRecord?.staffName}'s Attendance
              </Text>
              <CloseButton onPress={() => setEditingRecord(null)} size={18} />
            </View>

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Punch In</Text>
                <View style={{ borderRadius: 8 }}>
                  <TextInput style={styles.textInput} placeholder="HH:mm" placeholderTextColor={COLORS.placeholder} value={editPunchIn} onChangeText={setEditPunchIn} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Punch Out</Text>
                <View style={{ borderRadius: 8 }}>
                  <TextInput style={styles.textInput} placeholder="HH:mm" placeholderTextColor={COLORS.placeholder} value={editPunchOut} onChangeText={setEditPunchOut} />
                </View>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Break Minutes</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput style={styles.textInput} keyboardType="number-pad" value={editBreak} onChangeText={setEditBreak} />
            </View>

            <Text style={styles.fieldLabel}>Note (required)</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Why is this being corrected?"
                placeholderTextColor={COLORS.placeholder}
                value={editCorrectionNote}
                onChangeText={setEditCorrectionNote}
                multiline
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditingRecord(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={submitCorrection} disabled={correctAttendance.isPending}>
                {correctAttendance.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="check" size={14} color="#FFFFFF" />}
                <Text style={styles.modalSaveText}>Save</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7 : 7.5, paddingHorizontal: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 6 : 6 },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 12 : 12, paddingVertical: isDesktopWeb ? 6 : 6 },
  dateArrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dateText: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '700', color: COLORS.heading },
  emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 35 : 37.5, gap: isDesktopWeb ? 6 : 6 },
  emptyText: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted },
  card: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 10 : 10.5, marginBottom: isDesktopWeb ? 9 : 9 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7 : 7.5 },
  staffName: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '700', color: COLORS.heading },
  metaText: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  subMeta: { fontSize: 11, color: COLORS.accent, marginTop: isDesktopWeb ? 6 : 6 },
  statusBadge: { paddingHorizontal: isDesktopWeb ? 10 : 7.5, paddingVertical: isDesktopWeb ? 4 : 3, borderRadius: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  fab: {
    position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.button, alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 14 : 15 },
  modalSheet: { backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 12 : 12, width: '100%', maxWidth: 440, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 6, flexShrink: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 3, marginTop: isDesktopWeb ? 4 : 4.5 },
  staffSelect: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 6, backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 7 : 7.5, paddingVertical: isDesktopWeb ? 6 : 6 },
  staffSelectName: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  placeholderText: { fontSize: 12, color: COLORS.placeholder },
  rowFields: { flexDirection: 'row', gap: isDesktopWeb ? 4 : 4.5 },
  textInput: { backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: isDesktopWeb ? 6 : undefined, height: isDesktopWeb ? undefined : 34, fontSize: 12, color: COLORS.heading },
  textArea: { minHeight: 60, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: isDesktopWeb ? 6 : 6, marginTop: isDesktopWeb ? 9 : 9 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7.5, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4.5, paddingVertical: 7.5, borderRadius: 6, backgroundColor: COLORS.button },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  staffOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
});
