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

type OrderTypeField = 'dineInEnabled' | 'takeawayEnabled' | 'deliveryEnabled' | 'qsrEnabled' | 'cashEnabled';

const ROWS: { field: OrderTypeField; title: string; desc: string; icon: string }[] = [
  { field: 'dineInEnabled', title: 'Dine In', desc: 'Table-based orders from the Tables screen', icon: 'silverware-fork-knife' },
  { field: 'takeawayEnabled', title: 'Takeaway', desc: 'Counter pickup, no table needed', icon: 'bag-personal-outline' },
  { field: 'deliveryEnabled', title: 'Delivery', desc: 'Orders going out for delivery', icon: 'moped-outline' },
  { field: 'qsrEnabled', title: 'Token', desc: 'Counter/QSR orders with a daily token number', icon: 'ticket-confirmation-outline' },
  { field: 'cashEnabled', title: 'Cash Sale', desc: 'No kitchen at all — rings up and goes straight to a payable bill', icon: 'cash' },
];

export const OrderTypesSettingsScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [saving, setSaving] = useState<OrderTypeField | null>(null);

  const enabledCount = (s: ApiSettings) => ROWS.filter((r) => s[r.field]).length;

  const toggle = async (field: OrderTypeField) => {
    if (!settings || saving) return;
    const turningOff = settings[field];
    if (turningOff && enabledCount(settings) <= 1) {
      dispatch(showToast({ message: 'At least one order type must stay enabled.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      setSaving(field);
      const req: UpdateSettingsRequest = { [field]: !settings[field] };
      await updateSettings.mutateAsync(req);
      dispatch(showToast({ message: 'Order types updated.', icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update order types'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="format-list-bulleted-type" title="Order Types" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Types</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={styles.subtitle}>
          Choose which order types POS offers at this cafe. Turned-off types won't show up as a pill on POS. At least one must stay enabled.
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
