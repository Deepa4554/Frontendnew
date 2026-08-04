import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { useStaffKitchenAssignment, useUpdateStaffKitchenAssignment } from '../../../../../core/api/hooks/useStaff';
import { useStations } from '../../../../../core/api/hooks/useStations';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

/**
 * Lets an Owner/Manager pin one staff login to a single kitchen station — so a
 * Chef/KitchenStaff login always opens the KDS already showing just their own kitchen,
 * on any device, with no manual station-tab switching every time they log in. "No
 * assignment" falls back to whatever that device itself remembers (see
 * core/kds/kdsDeviceSettings.ts) — the same per-device behavior KDS has always had.
 * Owner logins can't be pinned here at all (see StaffProfileScreen, which hides this
 * row for an Owner login) — an Owner always sees every kitchen.
 */
export const StaffKitchenAssignmentScreen = ({ navigation, route }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const staffId: number | undefined = route?.params?.staffId;
  const staffName: string = route?.params?.staffName ?? 'this staff member';

  const { data: stations = [], isLoading: stationsLoading } = useStations();
  const activeStations = stations.filter((s) => s.active);
  const { data, isLoading, isError, refetch } = useStaffKitchenAssignment(staffId ?? null);
  const updateAssignment = useUpdateStaffKitchenAssignment();

  const [selected, setSelected] = useState<number | null>(null);
  const hydrated = useRef(false);

  // Only hydrate once per screen visit — same reasoning as StaffAccessScreen: don't let
  // a background refetch stomp on a choice the owner hasn't saved yet.
  useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    setSelected(data.assignedStationId);
  }, [data]);

  const handleSave = async () => {
    if (!staffId) return;
    try {
      await updateAssignment.mutateAsync({ id: staffId, req: { assignedStationId: selected } });
      dispatch(showToast({ message: `Kitchen assignment updated for ${staffName}.`, icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update kitchen assignment'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  if (!staffId) return null;
  const loading = isLoading || stationsLoading;

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="chef-hat" title="Kitchen Assignment" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Kitchen Assignment</Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      {loading ? (
        <View style={{ padding: 16 }}>
          <SkeletonList rows={4} />
        </View>
      ) : isError ? (
        <ErrorState
          title="Couldn't load kitchen assignment"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.subtitle}>
              {staffName} — pin this login to one kitchen so their KDS always opens straight to it, on any device.
            </Text>

            <View style={styles.listCard}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => setSelected(null)}
                activeOpacity={0.7}
              >
                <View style={[styles.radio, selected === null && styles.radioChecked]}>
                  {selected === null && <View style={styles.radioDot} />}
                </View>
                <View style={styles.rowIconBox}>
                  <Icon name="apps" size={16} color={COLORS.heading} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>No assignment</Text>
                  <Text style={styles.rowHint}>Follows whatever this device itself remembers</Text>
                </View>
              </TouchableOpacity>

              {activeStations.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.row}
                  onPress={() => setSelected(s.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.radio, selected === s.id && styles.radioChecked]}>
                    {selected === s.id && <View style={styles.radioDot} />}
                  </View>
                  <View style={styles.rowIconBox}>
                    <Icon name="chef-hat" size={16} color={COLORS.heading} />
                  </View>
                  <Text style={styles.rowLabel}>{s.name}</Text>
                </TouchableOpacity>
              ))}

              {activeStations.length === 0 && (
                <View style={styles.emptyRow}>
                  <Text style={styles.rowHint}>No kitchen stations set up yet (Profile → Kitchen Stations).</Text>
                </View>
              )}
            </View>
          </ScrollView>

          <View style={[styles.saveBar, { paddingBottom: insets.bottom + 14 }]}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={updateAssignment.isPending} activeOpacity={0.8}>
              {updateAssignment.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Kitchen Assignment</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 12 : 9,
    paddingBottom: isDesktopWeb ? 12 : 9,
  },
  iconBtn: { padding: isDesktopWeb ? 8 : 6 },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading, marginLeft: isDesktopWeb ? 4 : 3 },
  scrollContent: { padding: isDesktopWeb ? 16 : 12, paddingBottom: isDesktopWeb ? 100 : 75 },
  subtitle: { fontSize: 13, color: COLORS.muted, marginBottom: isDesktopWeb ? 16 : 12, lineHeight: 19 },
  listCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 10 : 7.5,
    paddingHorizontal: isDesktopWeb ? 14 : 10.5,
    paddingVertical: isDesktopWeb ? 12 : 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  emptyRow: { paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingVertical: isDesktopWeb ? 16 : 12 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioChecked: { borderColor: COLORS.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent },
  rowIconBox: { width: 22, alignItems: 'center' },
  rowLabel: { flex: 1, fontSize: isDesktopWeb ? 14 : 12, fontWeight: '600', color: COLORS.heading },
  rowHint: { fontSize: 11, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    paddingTop: isDesktopWeb ? 12 : 9,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 6,
    paddingVertical: 10.5,
    alignItems: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
