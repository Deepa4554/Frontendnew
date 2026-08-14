import React, { useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { confirmAlert } from '../../../../../shared/components/ConfirmDialogHost';
import { showToast } from '../../../../../core/store/uiSlice';
import { useShiftTypes, useCreateShiftType, useDeleteShiftType } from '../../../../../core/api/hooks/useStaff';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const toHHmm = (hhmmss: string) => hhmmss.slice(0, 5);
const isValidTime = (t: string) => !Number.isNaN(new Date(`2000-01-01T${t}:00`).getTime()) && /^\d{2}:\d{2}$/.test(t);

/**
 * Reusable, cafe-wide shift patterns (e.g. "Morning" 09:00-13:00), created once here
 * so Team Schedule's day view can one-tap assign staff to a day instead of filling
 * the full Add Shift form every time (see TeamScheduleScreen's quick-assign chips).
 */
export const ShiftTypesScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();

  const { data: shiftTypes = [], isLoading } = useShiftTypes();
  const createShiftType = useCreateShiftType();
  const deleteShiftType = useDeleteShiftType();

  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('13:00');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const openAddModal = () => {
    setName('');
    setStartTime('09:00');
    setEndTime('13:00');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      dispatch(showToast({ message: 'Give this shift type a name.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      dispatch(showToast({ message: 'Check the start and end times (HH:mm).', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (startTime === endTime) {
      dispatch(showToast({ message: 'Start and end time cannot be the same.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await createShiftType.mutateAsync({ name: name.trim(), startTime: `${startTime}:00`, endTime: `${endTime}:00` });
      setModalVisible(false);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save shift type'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleDelete = (id: number, label: string) => {
    confirmAlert('Delete shift type', `Remove "${label}"? Staff already assigned to it keep their existing shifts.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(id);
          try {
            await deleteShiftType.mutateAsync(id);
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not delete shift type'), icon: 'alert-circle-outline', tone: 'danger' }));
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="clock-outline" title="Shift Types" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shift Types</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <Text style={styles.hint}>
          Set up your cafe's usual shift patterns once (e.g. "Morning" or "Evening") — Team Schedule can then one-tap
          assign staff to a shift each day instead of filling a form.
        </Text>

        {isLoading ? (
          <SkeletonList rows={3} />
        ) : shiftTypes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="clock-plus-outline" size={28} color={COLORS.muted} />
            <Text style={styles.emptyText}>No shift types yet.</Text>
            <Text style={styles.emptyHint}>Tap the + button to add one.</Text>
          </View>
        ) : (
          shiftTypes.map((t) => (
            <View key={t.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{t.name}</Text>
                <Text style={styles.cardTime}>{toHHmm(t.startTime)} – {toHHmm(t.endTime)}</Text>
              </View>
              <TouchableOpacity
                style={styles.deleteIconBtn}
                onPress={() => handleDelete(t.id, t.name)}
                disabled={deletingId === t.id}
              >
                {deletingId === t.id ? (
                  <ActivityIndicator size="small" color={COLORS.dangerAccent} />
                ) : (
                  <Icon name="trash-can-outline" size={18} color={COLORS.dangerAccent} />
                )}
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <Icon name="plus" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Add Shift Type</Text>
              <CloseButton onPress={() => setModalVisible(false)} size={18} />
            </View>

            <Text style={styles.fieldLabel}>Name</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Morning"
                placeholderTextColor={COLORS.placeholder}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Start Time (24h)</Text>
                <View style={{ borderRadius: 8 }}>
                  <TextInput style={styles.textInput} placeholder="09:00" placeholderTextColor={COLORS.placeholder} value={startTime} onChangeText={setStartTime} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>End Time (24h)</Text>
                <View style={{ borderRadius: 8 }}>
                  <TextInput style={styles.textInput} placeholder="13:00" placeholderTextColor={COLORS.placeholder} value={endTime} onChangeText={setEndTime} />
                </View>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSave} disabled={createShiftType.isPending}>
                {createShiftType.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="check" size={14} color="#FFFFFF" />}
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 9 : 12, paddingTop: isDesktopWeb ? 9 : 12, paddingBottom: isDesktopWeb ? 6 : 8, gap: isDesktopWeb ? 4.5 : 6 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 17, fontWeight: 'bold', color: COLORS.heading },
  hint: { fontSize: 12, color: COLORS.muted, lineHeight: 18, marginBottom: isDesktopWeb ? 12 : 16 },
  emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 35 : 37.5, gap: isDesktopWeb ? 6 : 6 },
  emptyText: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  emptyHint: { fontSize: 12, color: COLORS.muted },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 10 : 12, marginBottom: isDesktopWeb ? 9 : 9, gap: 9 },
  cardName: { fontSize: isDesktopWeb ? 15 : 13, fontWeight: '700', color: COLORS.heading },
  cardTime: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  deleteIconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.button, alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 14 : 15 },
  modalSheet: { backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 12 : 12, width: '100%', maxWidth: 440, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 6, flexShrink: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 3, marginTop: isDesktopWeb ? 4 : 4.5 },
  textInput: { backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: isDesktopWeb ? 6 : undefined, height: isDesktopWeb ? undefined : 34, fontSize: 12, color: COLORS.heading },
  rowFields: { flexDirection: 'row', gap: isDesktopWeb ? 4 : 4.5 },
  modalActions: { flexDirection: 'row', gap: isDesktopWeb ? 6 : 6, marginTop: isDesktopWeb ? 9 : 9 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7.5, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4.5, paddingVertical: 7.5, borderRadius: 6, backgroundColor: COLORS.button },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
