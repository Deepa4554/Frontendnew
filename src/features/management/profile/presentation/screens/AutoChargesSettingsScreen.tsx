import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Switch, ActivityIndicator } from 'react-native';
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

type ChargeId = 'service' | 'packing' | 'delivery';

type OrderTypeField = 'DineIn' | 'Takeaway' | 'Delivery' | 'Token';

const ORDER_TYPES: { field: OrderTypeField; label: string }[] = [
  { field: 'DineIn', label: 'Dine In' },
  { field: 'Takeaway', label: 'Takeaway' },
  { field: 'Delivery', label: 'Delivery' },
  { field: 'Token', label: 'Token' },
];

const CHARGES: {
  id: ChargeId;
  title: string;
  desc: string;
  icon: string;
  unit: '%' | '₹';
  defaultKey: 'serviceChargeDefaultPct' | 'packingChargeDefaultAmount' | 'deliveryChargeDefaultAmount';
  clearKey: 'serviceChargeClearDefault' | 'packingChargeClearDefault' | 'deliveryChargeClearDefault';
  autoApplyKey: (t: OrderTypeField) => keyof ApiSettings;
}[] = [
  {
    id: 'service', title: 'Service Charge', desc: 'Usually a % of the subtotal, most common on Dine In.',
    icon: 'room-service-outline', unit: '%', defaultKey: 'serviceChargeDefaultPct', clearKey: 'serviceChargeClearDefault',
    autoApplyKey: (t) => `serviceChargeAutoApply${t}` as keyof ApiSettings,
  },
  {
    id: 'packing', title: 'Packing Charge', desc: 'A flat amount, usually on Takeaway and Delivery.',
    icon: 'package-variant-closed', unit: '₹', defaultKey: 'packingChargeDefaultAmount', clearKey: 'packingChargeClearDefault',
    autoApplyKey: (t) => `packingChargeAutoApply${t}` as keyof ApiSettings,
  },
  {
    id: 'delivery', title: 'Delivery Charge', desc: 'A flat amount, usually only on Delivery.',
    icon: 'moped-outline', unit: '₹', defaultKey: 'deliveryChargeDefaultAmount', clearKey: 'deliveryChargeClearDefault',
    autoApplyKey: (t) => `deliveryChargeAutoApply${t}` as keyof ApiSettings,
  },
];

export const AutoChargesSettingsScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  const [drafts, setDrafts] = useState<Record<ChargeId, string>>({ service: '', packing: '', delivery: '' });
  const [savingToggle, setSavingToggle] = useState<string | null>(null);
  // Lets each Switch flip the instant it's tapped instead of waiting on the settings-save
  // round trip + refetch — otherwise the thumb just sits still until the network responds,
  // which reads as "the toggle doesn't work". Cleared once the real settings value catches
  // up (see the effect below) or reverted immediately if the save fails.
  const [toggleOverride, setToggleOverride] = useState<Partial<Record<string, boolean>>>({});
  // updateSettings.isPending is shared across every Save button and every switch on this
  // screen (one mutation hook instance) — tracking which SPECIFIC charge's value-save is
  // in flight separately keeps a toggle in one card from making every other card's Save
  // button spin too.
  const [savingValue, setSavingValue] = useState<ChargeId | null>(null);

  // Seeds the value inputs from whatever's saved server-side — re-runs whenever settings
  // refetches so a save from elsewhere (or another tab) doesn't leave a stale draft behind.
  useEffect(() => {
    if (!settings) return;
    setDrafts({
      service: settings.serviceChargeDefaultPct != null ? String(settings.serviceChargeDefaultPct) : '',
      packing: settings.packingChargeDefaultAmount != null ? String(settings.packingChargeDefaultAmount) : '',
      delivery: settings.deliveryChargeDefaultAmount != null ? String(settings.deliveryChargeDefaultAmount) : '',
    });
  }, [settings]);

  // Once the real settings value matches whatever a Switch was optimistically flipped to,
  // drop the override — it's a no-op visually since they already read the same, it just
  // stops shadowing the server truth once that's actually confirmed.
  useEffect(() => {
    if (!settings) return;
    setToggleOverride((cur) => {
      const keys = Object.keys(cur);
      if (keys.length === 0) return cur;
      const next = { ...cur };
      let changed = false;
      for (const k of keys) {
        if (next[k] === !!(settings as any)[k]) { delete next[k]; changed = true; }
      }
      return changed ? next : cur;
    });
  }, [settings]);

  const warn = (message: string) => dispatch(showToast({ message, icon: 'alert-circle-outline', tone: 'warning' }));
  const fail = (err: unknown) => dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save'), icon: 'alert-circle-outline', tone: 'danger' }));

  const saveValue = async (charge: typeof CHARGES[number]) => {
    const raw = drafts[charge.id].trim();
    if (raw === '') {
      try {
        setSavingValue(charge.id);
        await updateSettings.mutateAsync({ [charge.clearKey]: true } as UpdateSettingsRequest);
        dispatch(showToast({ message: `${charge.title} default turned off.`, icon: 'check-circle', tone: 'success' }));
      } catch (err) {
        fail(err);
      } finally {
        setSavingValue(null);
      }
      return;
    }
    const val = parseFloat(raw);
    if (isNaN(val) || val < 0 || (charge.unit === '%' && val > 100)) {
      warn(charge.unit === '%' ? 'Enter a percentage between 0 and 100.' : 'Enter a valid amount.');
      return;
    }
    try {
      setSavingValue(charge.id);
      await updateSettings.mutateAsync({ [charge.defaultKey]: val } as UpdateSettingsRequest);
      dispatch(showToast({ message: `${charge.title} default saved.`, icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      fail(err);
    } finally {
      setSavingValue(null);
    }
  };

  const toggleAutoApply = async (charge: typeof CHARGES[number], orderType: OrderTypeField) => {
    if (!settings) return;
    const key = charge.autoApplyKey(orderType);
    const toggleId = `${charge.id}-${orderType}`;
    const newVal = !(toggleOverride[key] ?? !!settings[key]);

    // Turning this on without a saved default value is a silent no-op server-side (see
    // OrderBuildingService.ComputeDefaultCharges — no default means 0 gets applied). Save
    // whatever's already typed in the field along with the toggle, or block and ask for one.
    let payload: UpdateSettingsRequest = { [key]: newVal } as UpdateSettingsRequest;
    if (newVal && settings[charge.defaultKey] == null) {
      const raw = drafts[charge.id].trim();
      const val = raw === '' ? NaN : parseFloat(raw);
      if (isNaN(val) || val < 0 || (charge.unit === '%' && val > 100)) {
        warn(`Set a default ${charge.unit === '%' ? 'percentage' : 'amount'} for ${charge.title} first, then turn this on.`);
        return;
      }
      payload = { ...payload, [charge.defaultKey]: val };
    }

    setToggleOverride((o) => ({ ...o, [key]: newVal }));
    try {
      setSavingToggle(toggleId);
      await updateSettings.mutateAsync(payload);
    } catch (err) {
      setToggleOverride((o) => ({ ...o, [key]: !newVal }));
      fail(err);
    } finally {
      setSavingToggle(null);
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="cash-plus" title="Auto Charges" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Auto Charges</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={styles.subtitle}>
          Set a default Service, Packing, and Delivery charge once — the right one applies
          automatically based on the order type, so a biller doesn't retype it on every
          bill. Leave the value blank to turn a charge off. A biller can still remove or
          change any auto-applied charge on an individual bill.
        </Text>

        {isLoading || !settings ? (
          <SkeletonList rows={CHARGES.length} avatarShape="circle" />
        ) : (
          CHARGES.map((charge) => (
            <View key={charge.id} style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardIcon}>
                  <Icon name={charge.icon} size={20} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{charge.title}</Text>
                  <Text style={styles.cardDesc}>{charge.desc}</Text>
                </View>
              </View>

              <View style={styles.valueRow}>
                <Text style={styles.fieldLabel}>Default {charge.unit === '%' ? 'Percentage' : 'Amount'}</Text>
                <View style={styles.valueInputRow}>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      value={drafts[charge.id]}
                      onChangeText={(t) => setDrafts((d) => ({ ...d, [charge.id]: t.replace(/[^0-9.]/g, '') }))}
                      placeholder={charge.unit === '%' ? 'e.g. 5' : 'e.g. 20'}
                      placeholderTextColor={COLORS.placeholder}
                    />
                    <Text style={styles.inputUnit}>{charge.unit}</Text>
                  </View>
                  <TouchableOpacity style={styles.saveBtn} onPress={() => saveValue(charge)} disabled={savingValue === charge.id}>
                    {savingValue === charge.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.fieldLabel}>Auto-apply to</Text>
              {ORDER_TYPES.map((ot) => {
                const key = charge.autoApplyKey(ot.field);
                const toggleId = `${charge.id}-${ot.field}`;
                return (
                  <View key={ot.field} style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>{ot.label}</Text>
                    <Switch
                      value={toggleOverride[key] ?? !!settings[key]}
                      onValueChange={() => toggleAutoApply(charge, ot.field)}
                      disabled={savingToggle === toggleId}
                      trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      {/* Only the toggles — the Save buttons already spin in place, so an overlay there
          would be a second loader for the same request. */}
      <LoadingOverlay visible={savingToggle !== null} message="Saving…" />
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 9 : 9, paddingTop: isDesktopWeb ? 9 : 9, paddingBottom: isDesktopWeb ? 6 : 6, gap: isDesktopWeb ? 4.5 : 4.5 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  subtitle: { fontSize: 12, color: COLORS.muted, lineHeight: 18, marginBottom: isDesktopWeb ? 14 : 15 },
  card: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 12 : 12, marginBottom: isDesktopWeb ? 9 : 9, gap: isDesktopWeb ? 8 : 8 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 9 : 9 },
  cardIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.heading },
  cardDesc: { fontSize: 12, color: COLORS.muted, marginTop: 1.5 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: COLORS.muted, letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 4 },
  valueRow: { gap: 6 },
  valueInputRow: { flexDirection: 'row', gap: 8 },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background,
    borderRadius: 8, paddingHorizontal: 10, height: 38,
  },
  input: { flex: 1, fontSize: 14, color: COLORS.heading },
  inputUnit: { fontSize: 13, fontWeight: '700', color: COLORS.muted },
  saveBtn: { paddingHorizontal: 16, height: 38, borderRadius: 8, backgroundColor: COLORS.button, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  toggleLabel: { fontSize: 13, color: COLORS.heading },
});
