import React, { useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Image, TextInput, Modal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { InitialsAvatar } from '../../../../../shared/components/InitialsAvatar';
import { confirmAlert } from '../../../../../shared/components/ConfirmDialogHost';
import { showToast } from '../../../../../core/store/uiSlice';
import { useStaff, useCreateShift, useDeleteShift } from '../../../../../core/api/hooks/useStaff';
import { ShiftWithStaff } from '../../../../../core/api/staffApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { DatePickerModal } from '../../../../../shared/components/atoms/DatePickerModal';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const pad = (n: number) => n.toString().padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Passed an existing `shift` (via route params) → view/delete mode for that real
 * shift. Passed only a `defaultDate` → create mode with a real staff picker.
 * The backend has no update-shift endpoint (see StaffController.cs), so editing an
 * existing shift isn't offered here — only creating a new one or deleting one.
 */
export const EditShiftScreen = ({ navigation, route }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const existingShift: ShiftWithStaff | undefined = route?.params?.shift;
  const defaultDate: string = route?.params?.defaultDate ?? toDateInput(new Date());

  const { data: staff = [] } = useStaff();
  const createShift = useCreateShift();
  const deleteShift = useDeleteShift();

  const [staffPickerVisible, setStaffPickerVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekly'>('none');
  const [repeatUntil, setRepeatUntil] = useState(defaultDate);
  const [repeatUntilPickerVisible, setRepeatUntilPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedStaff = staff.find((s) => s.id === selectedStaffId);

  const handleSave = async () => {
    if (!selectedStaffId) {
      dispatch(showToast({ message: 'Choose who this shift is for.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const startsAt = new Date(`${date}T${startTime}:00`);
    const endsAt = new Date(`${date}T${endTime}:00`);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      dispatch(showToast({ message: 'Check the date and time fields.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (endsAt <= startsAt) {
      dispatch(showToast({ message: 'Shift end must be after start.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (repeat !== 'none' && repeatUntil < date) {
      dispatch(showToast({ message: 'Repeat until date must be on or after the shift date.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    setSaving(true);
    try {
      await createShift.mutateAsync({
        staffId: selectedStaffId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        notes: notes.trim() || undefined,
        repeatUntil: repeat !== 'none' ? new Date(`${repeatUntil}T00:00:00`).toISOString() : undefined,
        repeatWeekly: repeat === 'weekly',
      });
      navigation?.goBack?.();
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save shift'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existingShift) return;
    confirmAlert('Delete shift', `Remove this shift for ${existingShift.staffName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteShift.mutateAsync(existingShift.id);
            navigation?.goBack?.();
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not delete shift'), icon: 'alert-circle-outline', tone: 'danger' }));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  if (existingShift) {
    const start = new Date(existingShift.startsAt);
    const end = new Date(existingShift.endsAt);
    const hours = ((end.getTime() - start.getTime()) / 3600000).toFixed(1);
    return (
      <View style={styles.container}>
        <DesktopPageHeader icon="calendar-edit" title="Add Shift" onBack={() => navigation?.goBack?.()} />
        {!isDesktopWeb && (
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
              <Icon name="arrow-left" size={22} color={COLORS.heading} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Shift Details</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          <View style={styles.card}>
            <View style={styles.cardLabelRow}>
              <Icon name="card-account-details-outline" size={16} color={COLORS.accent} />
              <Text style={styles.cardLabel}>STAFF MEMBER</Text>
            </View>
            <View style={styles.staffSelect}>
              {staff.find((s) => s.id === existingShift.staffId)?.photoUrl ? (
                <Image source={{ uri: staff.find((s) => s.id === existingShift.staffId)!.photoUrl! }} style={styles.staffSelectImg} />
              ) : (
                <InitialsAvatar name={existingShift.staffName} size={32} />
              )}
              <View>
                <Text style={styles.staffSelectName}>{existingShift.staffName}</Text>
                <Text style={styles.fieldLabel}>{existingShift.staffRole}</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardLabelRow}>
              <Icon name="clock-outline" size={16} color={COLORS.accent} />
              <Text style={styles.cardLabel}>SHIFT TIME</Text>
            </View>
            <Text style={styles.inputValue}>{start.toLocaleDateString()} · {toTimeInput(start)} – {toTimeInput(end)} ({hours} hrs)</Text>
          </View>

          {!!existingShift.notes && (
            <View style={styles.card}>
              <View style={styles.cardLabelRow}>
                <Icon name="text" size={16} color={COLORS.accent} />
                <Text style={styles.cardLabel}>NOTES</Text>
              </View>
              <Text style={styles.notesText}>{existingShift.notes}</Text>
            </View>
          )}

          <View style={styles.dangerCard}>
            <View style={styles.cardLabelRow}>
              <Icon name="alert-octagon-outline" size={16} color={COLORS.dangerAccent} />
              <Text style={styles.dangerLabel}>DANGER ZONE</Text>
            </View>
            <Text style={styles.dangerText}>Deleting this shift removes it from the schedule immediately.</Text>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={deleting}>
              {deleting ? <ActivityIndicator size="small" color={COLORS.dangerAccent} /> : <Text style={styles.deleteText}>DELETE SHIFT</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="calendar-edit" title="Add Shift" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Shift</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View style={styles.card}>
          <View style={styles.cardLabelRow}>
            <Icon name="card-account-details-outline" size={16} color={COLORS.accent} />
            <Text style={styles.cardLabel}>ASSIGNMENT DETAILS</Text>
          </View>
          <Text style={styles.fieldLabel}>Staff Member</Text>
          <TouchableOpacity style={styles.staffSelect} onPress={() => setStaffPickerVisible(true)}>
            {selectedStaff ? (
              <>
                {selectedStaff.photoUrl ? (
                  <Image source={{ uri: selectedStaff.photoUrl }} style={styles.staffSelectImg} />
                ) : (
                  <InitialsAvatar name={selectedStaff.name} size={32} />
                )}
                <Text style={styles.staffSelectName}>{selectedStaff.name}</Text>
              </>
            ) : (
              <Text style={styles.placeholderText}>Choose staff member</Text>
            )}
            <View style={{ flex: 1 }} />
            <Icon name="chevron-down" size={20} color={COLORS.muted} />
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardLabelRow}>
            <Icon name="calendar-outline" size={16} color={COLORS.accent} />
            <Text style={styles.cardLabel}>DATE</Text>
          </View>
          <TouchableOpacity style={[styles.textInput, { justifyContent: 'center' }]} onPress={() => setDatePickerVisible(true)}>
            <Text style={{ fontSize: 16, color: COLORS.heading, paddingTop: 4 }}>{date}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardLabelRow}>
            <Icon name="clock-outline" size={16} color={COLORS.accent} />
            <Text style={styles.cardLabel}>SHIFT DURATION</Text>
          </View>
          <View style={styles.durationRow}>
            <View style={styles.durationCol}>
              <Text style={styles.fieldLabel}>START TIME (24h)</Text>
              <View style={styles.startTimeInputWrap}>
                <TextInput style={styles.textInput} value={startTime} onChangeText={setStartTime} placeholder="09:00" placeholderTextColor={COLORS.placeholder} />
              </View>
            </View>
            <Icon name="arrow-right" size={18} color={COLORS.muted} style={{ marginTop: 24 }} />
            <View style={styles.durationCol}>
              <Text style={styles.fieldLabel}>END TIME (24h)</Text>
              <View style={styles.endTimeInputWrap}>
                <TextInput style={styles.textInput} value={endTime} onChangeText={setEndTime} placeholder="17:00" placeholderTextColor={COLORS.placeholder} />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardLabelRow}>
            <Icon name="repeat" size={16} color={COLORS.accent} />
            <Text style={styles.cardLabel}>REPEAT</Text>
          </View>
          <View style={styles.repeatRow}>
            {([['none', 'Does not repeat'], ['daily', 'Daily'], ['weekly', 'Weekly']] as const).map(([opt, label]) => (
              <TouchableOpacity
                key={opt}
                style={[styles.repeatChip, repeat === opt && styles.repeatChipActive]}
                onPress={() => setRepeat(opt)}
              >
                <Text style={[styles.repeatChipText, repeat === opt && styles.repeatChipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {repeat !== 'none' && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: isDesktopWeb ? 10.5 : 14 }]}>Until</Text>
              <TouchableOpacity style={[styles.textInput, { justifyContent: 'center' }]} onPress={() => setRepeatUntilPickerVisible(true)}>
                <Text style={{ fontSize: 16, color: COLORS.heading, paddingTop: 4 }}>{repeatUntil}</Text>
              </TouchableOpacity>
              <Text style={styles.repeatHint}>
                Creates a separate shift every {repeat === 'weekly' ? 'week' : 'day'} from {date} through {repeatUntil}.
              </Text>
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardLabelRow}>
            <Icon name="text" size={16} color={COLORS.accent} />
            <Text style={styles.cardLabel}>NOTES (OPTIONAL)</Text>
          </View>
          <View style={styles.notesInputWrap}>
            <TextInput
              style={[styles.textInput, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Cover the opening rush"
              placeholderTextColor={COLORS.placeholder}
              multiline
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Icon name="content-save-outline" size={18} color="#FFFFFF" />
              <Text style={styles.saveText}>SAVE SHIFT</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={staffPickerVisible} transparent animationType="fade" onRequestClose={() => setStaffPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Choose Staff Member</Text>
              <CloseButton onPress={() => setStaffPickerVisible(false)} size={18} />
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {staff.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.staffOption}
                  onPress={() => { setSelectedStaffId(s.id); setStaffPickerVisible(false); }}
                >
                  {s.photoUrl ? (
                    <Image source={{ uri: s.photoUrl }} style={styles.staffSelectImg} />
                  ) : (
                    <InitialsAvatar name={s.name} size={32} />
                  )}
                  <View>
                    <Text style={styles.staffSelectName}>{s.name}</Text>
                    <Text style={styles.fieldLabel}>{s.role}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {staff.length === 0 && <Text style={styles.placeholderText}>No staff yet — add one from Team Portal first.</Text>}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setStaffPickerVisible(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DatePickerModal
        visible={datePickerVisible}
        value={date}
        title="Select Shift Date"
        onCancel={() => setDatePickerVisible(false)}
        onConfirm={(selectedDate) => {
          setDate(selectedDate);
          setRepeatUntil((prev) => (prev < selectedDate ? selectedDate : prev));
          setDatePickerVisible(false);
        }}
      />

      <DatePickerModal
        visible={repeatUntilPickerVisible}
        value={repeatUntil}
        title="Repeat Until"
        onCancel={() => setRepeatUntilPickerVisible(false)}
        onConfirm={(selectedDate) => {
          setRepeatUntil(selectedDate);
          setRepeatUntilPickerVisible(false);
        }}
      />
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 9 : 12, paddingTop: isDesktopWeb ? 9 : 12, paddingBottom: isDesktopWeb ? 6 : 8, gap: isDesktopWeb ? 4.5 : 6 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 17, fontWeight: 'bold', color: COLORS.heading },
  card: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 13 : 18, marginBottom: isDesktopWeb ? 10.5 : 14 },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 8, marginBottom: isDesktopWeb ? 10.5 : 14 },
  cardLabel: { fontSize: 12, fontWeight: '700', color: COLORS.heading, letterSpacing: 0.5 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted, marginBottom: isDesktopWeb ? 6 : 8 },
  placeholderText: { fontSize: 14, color: COLORS.placeholder },
  staffSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 7 : 10,
    backgroundColor: COLORS.inputTint,
    borderRadius: 8,
    padding: isDesktopWeb ? 9 : 12,
  },
  staffOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 8,
    paddingVertical: isDesktopWeb ? 6 : 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  staffSelectImg: { width: 32, height: 32, borderRadius: 16 },
  staffSelectName: { fontSize: 15, fontWeight: '600', color: COLORS.heading },
  textInput: {
    backgroundColor: COLORS.inputTint,
    borderRadius: 8,
    paddingHorizontal: 14,
    height: isDesktopWeb ? undefined : 50,
    paddingVertical: isDesktopWeb ? 12 : undefined,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.heading,
  },
  notesInput: { height: isDesktopWeb ? 66 : 90, paddingTop: isDesktopWeb ? 9 : 12, textAlignVertical: 'top' },
  startTimeInputWrap: { borderRadius: 8 },
  endTimeInputWrap: { borderRadius: 8 },
  notesInputWrap: { borderRadius: 8 },
  inputValue: { fontSize: 15, fontWeight: '600', color: COLORS.heading },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7 : 10 },
  durationCol: { flex: 1 },
  notesText: { fontSize: 15, color: COLORS.heading, lineHeight: 22 },
  repeatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 7 : 8 },
  repeatChip: { backgroundColor: COLORS.inputTint, borderRadius: 20, paddingVertical: isDesktopWeb ? 7 : 9, paddingHorizontal: isDesktopWeb ? 13 : 16 },
  repeatChipActive: { backgroundColor: COLORS.button },
  repeatChipText: { fontSize: 13, fontWeight: '600', color: COLORS.heading },
  repeatChipTextActive: { color: '#FFFFFF' },
  repeatHint: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 6 : 8, lineHeight: 17 },
  dangerCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#E8A9A0',
    borderRadius: 8,
    padding: isDesktopWeb ? 13 : 18,
    marginBottom: isDesktopWeb ? 10.5 : 14,
  },
  dangerLabel: { fontSize: 12, fontWeight: '700', color: COLORS.dangerAccent, letterSpacing: 0.5 },
  dangerText: { fontSize: 13, color: COLORS.muted, lineHeight: 19, marginBottom: isDesktopWeb ? 12 : 16 },
  deleteBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.dangerAccent,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 10 : 13,
    alignItems: 'center',
  },
  deleteText: { fontSize: 14, fontWeight: '700', color: COLORS.dangerAccent, letterSpacing: 0.5 },
  footer: {
    paddingHorizontal: isDesktopWeb ? 12 : 16,
    paddingTop: isDesktopWeb ? 9 : 12,
    paddingBottom: isDesktopWeb ? 15 : 20,
    backgroundColor: COLORS.cardAlt,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 8,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 11 : 15,
  },
  saveText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 18 : 24 },
  modalSheet: { width: '100%', maxWidth: 460, backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 12 : 16, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 8 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 8, flexShrink: 1 },
  modalCancelBtn: { alignItems: 'center', paddingVertical: isDesktopWeb ? 7.5 : 10, borderRadius: 6, backgroundColor: COLORS.cardAlt, marginTop: isDesktopWeb ? 4.5 : 6 },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
});
