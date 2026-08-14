import React, { useMemo, useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { InitialsAvatar } from '../../../../../shared/components/InitialsAvatar';
import { showToast } from '../../../../../core/store/uiSlice';
import { useStaff } from '../../../../../core/api/hooks/useStaff';
import { useAttendanceList, useCreateManualAttendance, useCorrectAttendance, useMarkAttendance } from '../../../../../core/api/hooks/useAttendance';
import { AttendanceRecord, AttendanceStatus, MarkAttendanceStatus } from '../../../../../core/api/attendanceApi';
import { ApiStaff } from '../../../../../core/api/staffApi';
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

/** The four one-tap roll-call buttons on every staff row, in the order a manager reads
 * them out. Late/Holiday deliberately aren't tappable — Late is derived from a real
 * punch-in time and Holiday is a whole-cafe thing; both remain settable through the
 * correction modal. */
const MARK_OPTIONS: { key: MarkAttendanceStatus; label: string; icon: string; matches: AttendanceStatus[] }[] = [
  { key: 'Present', label: 'Present', icon: 'check-circle-outline', matches: ['PRESENT', 'LATE'] },
  { key: 'HalfDay', label: 'Half Day', icon: 'circle-half-full', matches: ['HALF_DAY'] },
  { key: 'OnLeave', label: 'Leave', icon: 'palm-tree', matches: ['ON_LEAVE'] },
  { key: 'Absent', label: 'Absent', icon: 'close-circle-outline', matches: ['ABSENT'] },
];

const MARK_LABEL: Record<MarkAttendanceStatus, string> = {
  Present: 'present',
  HalfDay: 'half day',
  OnLeave: 'on leave',
  Absent: 'absent',
  Holiday: 'holiday',
};

/** A staff member who has left the roster can't have today's attendance marked, but
 * their existing records still need to show up on past dates — hence the record check
 * rather than a plain filter. */
const isOnRoster = (s: ApiStaff) => s.status !== 'TERMINATED';

export const AttendanceScreen = ({ navigation }: any) => {
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
  const { data: staff = [], isLoading: staffLoading } = useStaff();

  const shiftDate = (deltaDays: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    setDate(toDateInput(d));
  };

  const createManual = useCreateManualAttendance();
  const correctAttendance = useCorrectAttendance();
  const markAttendance = useMarkAttendance();

  /** One row per staff member on the roster — marked or not — so the day reads as a roll
   * call rather than as a list of whoever happened to punch. Records whose staff member
   * has since left the roster are appended so history stays visible. */
  const rows = useMemo(() => {
    const byStaffId = new Map(records.map((r) => [r.staffId, r]));
    const roster = staff.filter(isOnRoster).map((s) => ({ staff: s as ApiStaff | null, record: byStaffId.get(s.id) ?? null, name: s.name }));
    const rosterIds = new Set(staff.filter(isOnRoster).map((s) => s.id));
    const departed = records
      .filter((r) => !rosterIds.has(r.staffId))
      .map((r) => ({ staff: null as ApiStaff | null, record: r as AttendanceRecord | null, name: r.staffName }));
    return [...roster, ...departed];
  }, [staff, records]);

  const counts = useMemo(() => {
    const tally = { present: 0, halfDay: 0, leave: 0, absent: 0, unmarked: 0 };
    rows.forEach(({ record }) => {
      if (!record) tally.unmarked += 1;
      else if (record.status === 'PRESENT' || record.status === 'LATE') tally.present += 1;
      else if (record.status === 'HALF_DAY') tally.halfDay += 1;
      else if (record.status === 'ABSENT') tally.absent += 1;
      else tally.leave += 1;
    });
    return tally;
  }, [rows]);

  // The API rejects a future date outright (attendance that hasn't happened yet); grey
  // the controls out rather than letting a tap bounce off the server.
  const isFutureDate = date > toDateInput(new Date());
  const [markingStaffId, setMarkingStaffId] = useState<number | null>(null);

  const markOne = async (staffId: number, name: string, status: MarkAttendanceStatus) => {
    setMarkingStaffId(staffId);
    try {
      await markAttendance.mutateAsync({ date, entries: [{ staffId, status }] });
      dispatch(showToast({ message: `${name} marked ${MARK_LABEL[status]}.`, icon: 'check-circle-outline', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not mark attendance'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setMarkingStaffId(null);
    }
  };

  /** Only fills the blanks — anyone already marked (including manually corrected rows and
   * real punches) is left exactly as-is, so this is safe to tap twice. */
  const markRemainingPresent = async () => {
    const entries = rows
      .filter((row) => !row.record && row.staff)
      .map((row) => ({ staffId: row.staff!.id, status: 'Present' as const }));
    if (entries.length === 0) {
      dispatch(showToast({ message: 'Everyone is already marked for this day.', icon: 'information-outline', tone: 'info' }));
      return;
    }
    try {
      await markAttendance.mutateAsync({ date, entries });
      dispatch(showToast({ message: `${entries.length} staff marked present.`, icon: 'check-circle-outline', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not mark attendance'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

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

  const openManualModal = (staffId: number | null = null) => {
    setSelectedStaffId(staffId);
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

  const dateNav = (
    <View style={styles.dateRow}>
      <TouchableOpacity style={styles.dateArrow} onPress={() => shiftDate(-1)}>
        <Icon name="chevron-left" size={isDesktopWeb ? 16 : 22} color={COLORS.heading} />
      </TouchableOpacity>
      <Text style={styles.dateText}>{date}</Text>
      <TouchableOpacity style={styles.dateArrow} onPress={() => shiftDate(1)}>
        <Icon name="chevron-right" size={isDesktopWeb ? 16 : 22} color={COLORS.heading} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="clock-check-outline" title="Attendance" center={dateNav} />
      {!isDesktopWeb && (
        <>
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={() => navigation?.goBack?.()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="arrow-left" size={20} color={COLORS.heading} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Attendance</Text>
          </View>
          {dateNav}
        </>
      )}

      {!isLoading && !staffLoading && rows.length > 0 && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {counts.present} present · {counts.halfDay} half · {counts.leave} leave · {counts.absent} absent
            {counts.unmarked > 0 ? ` · ${counts.unmarked} not marked` : ''}
          </Text>
          {isFutureDate && <Text style={styles.hintText}>Future date — nothing to mark yet.</Text>}
          {counts.unmarked > 0 && !isFutureDate && (
            <TouchableOpacity testID="mark-rest-present" style={styles.markAllBtn} onPress={markRemainingPresent} disabled={markAttendance.isPending}>
              {markAttendance.isPending && markingStaffId === null ? (
                <ActivityIndicator size="small" color={COLORS.button} />
              ) : (
                <Icon name="check-all" size={14} color={COLORS.button} />
              )}
              <Text style={styles.markAllText}>Mark rest present</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {isError && records.length === 0 ? (
          <ErrorState title="Couldn't load attendance" message="Check your connection and try again." onRetry={() => refetch()} />
        ) : isLoading || staffLoading ? (
          <SkeletonList rows={5} />
        ) : rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="account-group-outline" size={28} color={COLORS.muted} />
            <Text style={styles.emptyText}>No staff on the roster yet — add your team first.</Text>
          </View>
        ) : (
          rows.map(({ staff: member, record: rec, name }) => {
            const variant = rec ? STATUS_STYLES[rec.status] : null;
            const isMarking = markingStaffId === member?.id;
            // A departed staff member's old record can still be corrected, just not re-marked.
            const canMark = !!member && !isFutureDate;
            return (
              <View
                key={member ? `staff-${member.id}` : `rec-${rec!.id}`}
                testID={member ? `attendance-row-${member.id}` : `attendance-row-record-${rec!.id}`}
                style={styles.card}
              >
                <TouchableOpacity
                  style={styles.cardTopRow}
                  onPress={() => (rec ? openEditModal(rec) : member && openManualModal(member.id))}
                >
                  <InitialsAvatar name={name} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.staffName}>{name}</Text>
                    <Text style={styles.metaText}>
                      {rec?.punchInAt || rec?.punchOutAt
                        ? `${rec.punchInAt ? toTimeInput(rec.punchInAt) : '--:--'} → ${rec.punchOutAt ? toTimeInput(rec.punchOutAt) : '--:--'}${
                            rec.workedMinutes != null ? ` · ${(rec.workedMinutes / 60).toFixed(1)}h worked` : ''
                          }`
                        : member?.role || 'Not marked yet'}
                    </Text>
                  </View>
                  {rec && variant && (
                    <View style={[styles.statusBadge, { backgroundColor: variant.bg }]}>
                      <Text testID="attendance-status-badge" style={[styles.statusBadgeText, { color: variant.text }]}>
                        {STATUS_LABEL[rec.status]}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {(rec?.lateMinutes || rec?.overtimeMinutes) ? (
                  <Text style={styles.subMeta}>
                    {rec.lateMinutes > 0 ? `${rec.lateMinutes} min late` : ''}
                    {rec.lateMinutes > 0 && rec.overtimeMinutes > 0 ? ' · ' : ''}
                    {rec.overtimeMinutes > 0 ? `${rec.overtimeMinutes} min overtime` : ''}
                  </Text>
                ) : null}

                {canMark && (
                  <View style={styles.markRow}>
                    {MARK_OPTIONS.map((option) => {
                      const selected = !!rec && option.matches.includes(rec.status);
                      const tone = STATUS_STYLES[option.matches[0]];
                      return (
                        <TouchableOpacity
                          key={option.key}
                          testID={`mark-${member!.id}-${option.key}`}
                          style={[styles.markChip, selected && { backgroundColor: tone.bg, borderColor: tone.text }]}
                          onPress={() => markOne(member!.id, name, option.key)}
                          disabled={isMarking}
                        >
                          <Icon name={option.icon} size={13} color={selected ? tone.text : COLORS.muted} />
                          <Text style={[styles.markChipText, selected && { color: tone.text }]}>{option.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {isMarking && <ActivityIndicator size="small" color={COLORS.button} style={styles.markSpinner} />}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => openManualModal()}>
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
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 6 : 12, paddingVertical: isDesktopWeb ? 0 : 6 },
  dateArrow: { width: isDesktopWeb ? 22 : 32, height: isDesktopWeb ? 22 : 32, alignItems: 'center', justifyContent: 'center' },
  dateText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
    gap: 8, paddingHorizontal: 16, paddingTop: isDesktopWeb ? 10 : 0, paddingBottom: 8,
  },
  summaryText: { fontSize: 11, fontWeight: '600', color: COLORS.muted, flexShrink: 1 },
  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14, backgroundColor: COLORS.cardAlt,
  },
  markAllText: { fontSize: 11, fontWeight: '700', color: COLORS.button },
  hintText: { fontSize: 11, fontWeight: '600', color: COLORS.accent },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 5, marginTop: isDesktopWeb ? 9 : 9 },
  markChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingVertical: isDesktopWeb ? 6 : 7, borderRadius: 8, borderWidth: 1,
    borderColor: COLORS.divider, backgroundColor: COLORS.background,
  },
  markChipText: { fontSize: 11, fontWeight: '700', color: COLORS.muted },
  markSpinner: { position: 'absolute', right: -2 },
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
