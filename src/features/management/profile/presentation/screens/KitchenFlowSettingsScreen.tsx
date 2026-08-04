import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useSettings, useUpdateSettings } from '../../../../../core/api/hooks/useSettings';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonCard } from '../../../../../shared/components/atoms/Skeleton';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const OPTIONS: { value: 'TWO_STAGE' | 'THREE_STAGE'; title: string; desc: string; flow: string }[] = [
  {
    value: 'THREE_STAGE',
    title: '3-step (New → Preparing → Ready)',
    desc: 'Kitchen taps once to start cooking, once when it’s ready. Best when prep time varies a lot per dish.',
    flow: 'New → Preparing → Ready',
  },
  {
    value: 'TWO_STAGE',
    title: '2-step (New → Ready)',
    desc: 'One tap takes an item straight to Ready — no separate "started cooking" step. Faster for simple/fast-turnaround kitchens.',
    flow: 'New → Ready',
  },
];

export const KitchenFlowSettingsScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [saving, setSaving] = useState(false);

  const current = settings?.kdsStageMode === 'TWO_STAGE' ? 'TWO_STAGE' : 'THREE_STAGE';

  const choose = async (value: 'TWO_STAGE' | 'THREE_STAGE') => {
    if (value === current || saving) return;
    try {
      setSaving(true);
      await updateSettings.mutateAsync({ kdsStageMode: value });
      dispatch(showToast({ message: 'Kitchen flow updated.', icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update kitchen flow'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="chef-hat" title="Kitchen Flow" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Kitchen Flow</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={styles.subtitle}>
          Choose how many steps the kitchen taps through on the KDS screen for every item and KOT. This only changes how many taps it takes — every order's stage is still tracked the same way underneath.
        </Text>

        {isLoading ? (
          <>
            <SkeletonCard height={80} style={{ marginBottom: 14 }} />
            <SkeletonCard height={80} />
          </>
        ) : (
          OPTIONS.map((opt) => {
            const active = current === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.card, active && styles.cardActive]}
                onPress={() => choose(opt.value)}
                disabled={saving}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.cardTitle, active && styles.cardTitleActive]}>{opt.title}</Text>
                  {active ? (
                    saving ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Icon name="check-circle" size={20} color={COLORS.accent} />
                  ) : (
                    <Icon name="circle-outline" size={20} color={COLORS.muted} />
                  )}
                </View>
                <Text style={styles.cardFlow}>{opt.flow}</Text>
                <Text style={styles.cardDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 9 : 9, paddingTop: isDesktopWeb ? 9 : 9, paddingBottom: isDesktopWeb ? 6 : 6, gap: isDesktopWeb ? 4.5 : 4.5 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  subtitle: { fontSize: 12, color: COLORS.muted, lineHeight: 18, marginBottom: isDesktopWeb ? 15 : 15 },
  card: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 12 : 12, marginBottom: isDesktopWeb ? 10.5 : 10.5, borderWidth: 1.5, borderColor: 'transparent' },
  cardActive: { borderColor: COLORS.accent },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.heading, flexShrink: 1, marginRight: isDesktopWeb ? 7.5 : 7.5 },
  cardTitleActive: { color: COLORS.accent },
  cardFlow: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginTop: 6 },
  cardDesc: { fontSize: 12, color: COLORS.muted, lineHeight: 17, marginTop: 4.5 },
});
