import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Switch, Alert, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useStations, useCreateStation, useUpdateStation, useDeleteStation } from '../../../../../core/api/hooks/useStations';
import { Station } from '../../../../../core/api/stationsApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { LoadingOverlay } from '../../../../../shared/components/atoms/LoadingOverlay';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

/** Kitchen Stations — manages the master list menu items assign to (see MenuScreen's
 * station picker) and that KDS/KOT printing route by. Add/rename/reorder/deactivate;
 * delete is blocked server-side while any menu item still points at a station. */
export const StationManagementScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  const { data: stations, isLoading } = useStations();
  const createStation = useCreateStation();
  const updateStation = useUpdateStation();
  const deleteStation = useDeleteStation();

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const sorted = [...(stations ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createStation.mutateAsync({ name });
      setNewName('');
      dispatch(showToast({ message: `"${name}" station added.`, icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add station'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const startEdit = (station: Station) => {
    setEditingId(station.id);
    setEditingName(station.name);
  };

  const commitEdit = async () => {
    if (editingId == null) return;
    const name = editingName.trim();
    const id = editingId;
    setEditingId(null);
    if (!name) return;
    try {
      setBusyId(id);
      await updateStation.mutateAsync({ id, req: { name } });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not rename station'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (station: Station) => {
    try {
      setBusyId(station.id);
      await updateStation.mutateAsync({ id: station.id, req: { active: !station.active } });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update station'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setBusyId(null);
    }
  };

  const move = async (station: Station, direction: -1 | 1) => {
    const idx = sorted.findIndex((s) => s.id === station.id);
    const swapWith = sorted[idx + direction];
    if (!swapWith) return;
    try {
      setBusyId(station.id);
      await Promise.all([
        updateStation.mutateAsync({ id: station.id, req: { sortOrder: swapWith.sortOrder } }),
        updateStation.mutateAsync({ id: swapWith.id, req: { sortOrder: station.sortOrder } }),
      ]);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not reorder stations'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = (station: Station) => {
    Alert.alert('Delete station?', `Remove "${station.name}"? This only works if no menu item is still assigned to it.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setBusyId(station.id);
            await deleteStation.mutateAsync(station.id);
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not delete station'), icon: 'alert-circle-outline', tone: 'danger' }));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const openPrinterSettings = (station: Station) => {
    navigation?.navigate?.('PrinterSettings', { stationKey: station.name, stationLabel: station.name });
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="silverware-variant" title="Kitchen Stations" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Kitchen Stations</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={styles.subtitle}>
          Set up the prep stations this cafe uses (e.g. Main Kitchen, Bar, Dessert). Assign menu items to a station from the
          Menu screen — KDS can then filter by station, and KOTs route to each station's own printer.
        </Text>

        <View style={styles.addRow}>
          <View style={{ borderRadius: 8, flex: 1 }}>
            <TextInput
              style={styles.addInput}
              placeholder="New station name"
              placeholderTextColor={COLORS.placeholder}
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={handleAdd}
              returnKeyType="done"
            />
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={handleAdd} disabled={createStation.isPending || !newName.trim()}>
            {createStation.isPending ? <ActivityIndicator size="small" color="#FFF" /> : <Icon name="plus" size={20} color="#FFF" />}
          </TouchableOpacity>
        </View>

        {isLoading && <SkeletonList rows={4} avatarShape="square" />}

        {!isLoading && sorted.map((station, idx) => (
          <View key={station.id} style={[styles.card, !station.active && styles.cardInactive]}>
            <View style={styles.reorderCol}>
              <TouchableOpacity disabled={idx === 0 || busyId != null} onPress={() => move(station, -1)}>
                <Icon name="chevron-up" size={18} color={idx === 0 ? COLORS.placeholder : COLORS.muted} />
              </TouchableOpacity>
              <TouchableOpacity disabled={idx === sorted.length - 1 || busyId != null} onPress={() => move(station, 1)}>
                <Icon name="chevron-down" size={18} color={idx === sorted.length - 1 ? COLORS.placeholder : COLORS.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.cardIcon}>
              <Icon name={station.icon || 'chef-hat'} size={20} color={COLORS.accent} />
            </View>

            <View style={{ flex: 1 }}>
              {editingId === station.id ? (
                <TextInput
                  style={styles.editInput}
                  value={editingName}
                  onChangeText={setEditingName}
                  onBlur={commitEdit}
                  onSubmitEditing={commitEdit}
                  autoFocus
                  returnKeyType="done"
                />
              ) : (
                <TouchableOpacity onPress={() => startEdit(station)}>
                  <Text style={styles.cardTitle}>{station.name}</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.cardDesc}>{station.active ? 'Active' : 'Deactivated — hidden from menu picker'}</Text>
            </View>

            {busyId === station.id ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <>
                <TouchableOpacity style={styles.printerBtn} onPress={() => openPrinterSettings(station)}>
                  <Icon name="printer-outline" size={18} color={COLORS.accent} />
                </TouchableOpacity>
                <Switch
                  value={station.active}
                  onValueChange={() => toggleActive(station)}
                  trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                  thumbColor="#FFFFFF"
                />
                <TouchableOpacity style={styles.deleteBtn} onPress={() => confirmDelete(station)}>
                  <Icon name="trash-can-outline" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              </>
            )}
          </View>
        ))}

        {!isLoading && sorted.length === 0 && (
          <Text style={styles.emptyText}>No stations yet — add one above (e.g. "Kitchen").</Text>
        )}
      </ScrollView>

      <LoadingOverlay visible={busyId !== null} message="Saving…" />
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 9 : 9, paddingTop: isDesktopWeb ? 9 : 9, paddingBottom: isDesktopWeb ? 6 : 6, gap: isDesktopWeb ? 4.5 : 4.5 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  subtitle: { fontSize: 12, color: COLORS.muted, lineHeight: 18, marginBottom: isDesktopWeb ? 12 : 12 },
  addRow: { flexDirection: 'row', gap: isDesktopWeb ? 6 : 6, marginBottom: isDesktopWeb ? 12 : 12 },
  addInput: { flex: 1, backgroundColor: COLORS.inputBg, borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 10.5 : 10.5, paddingVertical: isDesktopWeb ? 7.5 : 7.5, fontSize: 16, color: COLORS.heading },
  addBtn: { width: 44, height: 44, borderRadius: 6, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7.5 : 7.5, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 10.5 : 10.5, marginBottom: isDesktopWeb ? 7.5 : 7.5 },
  cardInactive: { opacity: 0.55 },
  reorderCol: { alignItems: 'center', gap: isDesktopWeb ? 1.5 : 1.5 },
  cardIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.heading },
  cardDesc: { fontSize: 11, color: COLORS.muted, marginTop: isDesktopWeb ? 1.5 : 1.5 },
  editInput: { fontSize: 16, fontWeight: '700', color: COLORS.heading, borderBottomWidth: 1, borderBottomColor: COLORS.accent, paddingVertical: isDesktopWeb ? 1.5 : 1.5 },
  printerBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 12, color: COLORS.muted, textAlign: 'center', marginTop: 24 },
});
