import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Switch } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useSettings, useUpdateSettings } from '../../../../../core/api/hooks/useSettings';
import { ApiSettings, UpdateSettingsRequest } from '../../../../../core/api/settingsApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { LoadingOverlay } from '../../../../../shared/components/atoms/LoadingOverlay';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

type ShiftField = 'morningShiftEnabled' | 'eveningShiftEnabled' | 'nightShiftEnabled' | 'generalShiftEnabled';

const ROWS: { field: ShiftField; title: string; desc: string; icon: string }[] = [
  { field: 'morningShiftEnabled', title: 'Morning', desc: 'Attendance roll-call for the morning shift', icon: 'weather-sunset-up' },
  { field: 'eveningShiftEnabled', title: 'Evening', desc: 'Attendance roll-call for the evening shift', icon: 'weather-sunset-down' },
  { field: 'nightShiftEnabled', title: 'Night', desc: 'Attendance roll-call for the night shift', icon: 'weather-night' },
  { field: 'generalShiftEnabled', title: 'General', desc: 'A single shift covering the whole day', icon: 'clock-outline' },
];

export const ShiftSettingsScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [saving, setSaving] = useState<ShiftField | null>(null);

  const enabledCount = (s: ApiSettings) => ROWS.filter((r) => s[r.field]).length;

  const toggle = async (field: ShiftField) => {
    if (!settings || saving) return;
    const turningOff = settings[field];
    if (turningOff && enabledCount(settings) <= 1) {
      dispatch(showToast({ message: 'At least one shift must stay enabled.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      setSaving(field);
      const req: UpdateSettingsRequest = { [field]: !settings[field] };
      await updateSettings.mutateAsync(req);
      dispatch(showToast({ message: 'Shifts updated.', icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update shifts'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="clock-outline" title="Shifts" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shifts</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={styles.subtitle}>
          Choose which shifts this cafe runs. The Attendance screen only shows roll-call tabs for shifts turned on here — turn on more than
          one if the same staff member can be marked present for, say, both Morning and Evening on the same day. At least one must stay
          enabled.
        </Text>

        {isLoading ? (
          <SkeletonList rows={ROWS.length} avatarShape="circle" />
        ) : (
          ROWS.map((row) => (
            <View key={row.field} style={styles.card}>
              <View style={styles.cardIcon}>
                <Icon name={row.icon} size={20} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{row.title}</Text>
                <Text style={styles.cardDesc}>{row.desc}</Text>
              </View>
              <Switch
                value={settings ? settings[row.field] : true}
                onValueChange={() => toggle(row.field)}
                disabled={!settings || saving === row.field}
                trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                thumbColor="#FFFFFF"
              />
            </View>
          ))
        )}
      </ScrollView>

      <LoadingOverlay visible={saving !== null} message="Saving…" />
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 9 : 9, paddingTop: isDesktopWeb ? 9 : 9, paddingBottom: isDesktopWeb ? 6 : 6, gap: isDesktopWeb ? 4.5 : 4.5 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  subtitle: { fontSize: 12, color: COLORS.muted, lineHeight: 18, marginBottom: isDesktopWeb ? 14 : 15 },
  card: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 9 : 9, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 12 : 12, marginBottom: isDesktopWeb ? 9 : 9 },
  cardIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.heading },
  cardDesc: { fontSize: 12, color: COLORS.muted, marginTop: 1.5 },
});
