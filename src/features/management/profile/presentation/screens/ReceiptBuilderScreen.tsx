import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Switch, TextInput, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useSettings, useUpdateSettings } from '../../../../../core/api/hooks/useSettings';
import { ApiSettings, UpdateSettingsRequest } from '../../../../../core/api/settingsApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonBox, SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { LoadingOverlay } from '../../../../../shared/components/atoms/LoadingOverlay';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

type ReceiptToggleField =
  | 'receiptShowAddress'
  | 'receiptShowWaiterName'
  | 'receiptShowGuestPhone'
  | 'receiptShowItemNotes'
  | 'receiptShowFooter';

const ROWS: { field: ReceiptToggleField; title: string; desc: string; icon: string }[] = [
  { field: 'receiptShowAddress', title: 'Cafe Address', desc: 'Printed under the business name at the top', icon: 'map-marker-outline' },
  { field: 'receiptShowWaiterName', title: 'Waiter / Staff Name', desc: 'Who rang up or served this order', icon: 'account-outline' },
  { field: 'receiptShowGuestPhone', title: 'Guest Mobile Number', desc: 'Only prints when one was entered at order time', icon: 'phone-outline' },
  { field: 'receiptShowItemNotes', title: 'Item Notes', desc: 'Free-text instructions like "No onion" under each line', icon: 'note-text-outline' },
  { field: 'receiptShowFooter', title: 'Footer Message', desc: 'The thank-you line at the very bottom', icon: 'text-box-outline' },
];

/// Business name, items, and totals always print — there's no real bill without them,
/// so they're not toggleable here. Logo/QR-code printing need bitmap-to-ESC/POS raster
/// support the print pipeline doesn't have yet (thermal receipts are text-only right
/// now) — not offered here until that's built.
export const ReceiptBuilderScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [saving, setSaving] = useState<ReceiptToggleField | null>(null);
  const [gstDraft, setGstDraft] = useState('');
  const [savingGst, setSavingGst] = useState(false);
  const [upiDraft, setUpiDraft] = useState('');
  const [savingUpi, setSavingUpi] = useState(false);

  useEffect(() => {
    if (settings) setGstDraft(settings.gstNumber ?? '');
  }, [settings]);

  useEffect(() => {
    if (settings) setUpiDraft(settings.upiVpa ?? '');
  }, [settings]);

  const toggle = async (field: ReceiptToggleField) => {
    if (!settings || saving) return;
    try {
      setSaving(field);
      const req: UpdateSettingsRequest = { [field]: !settings[field] };
      await updateSettings.mutateAsync(req);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update receipt settings'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setSaving(null);
    }
  };

  const saveGst = async () => {
    if (!settings || gstDraft.trim() === (settings.gstNumber ?? '')) return;
    const trimmedGst = gstDraft.trim();
    if (trimmedGst && !/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/.test(trimmedGst)) {
      dispatch(showToast({ message: 'Enter a valid 15-character GSTIN.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      setSavingGst(true);
      await updateSettings.mutateAsync({ gstNumber: trimmedGst });
      dispatch(showToast({ message: 'GST number updated.', icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save GST number'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setSavingGst(false);
    }
  };

  const saveUpi = async () => {
    if (!settings || upiDraft.trim() === (settings.upiVpa ?? '')) return;
    const trimmedUpi = upiDraft.trim();
    // Same shape the API enforces (see SettingsController's UpiVpaPattern) — checked here
    // too so a typo is caught before the round trip, not after.
    if (trimmedUpi && !/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.]{1,63}$/.test(trimmedUpi)) {
      dispatch(showToast({ message: 'Enter a valid UPI ID, like cafename@okaxis.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      setSavingUpi(true);
      await updateSettings.mutateAsync({ upiVpa: trimmedUpi });
      dispatch(showToast({
        message: trimmedUpi ? 'UPI ID updated.' : 'UPI ID removed — bills will not show a payment QR.',
        icon: 'check-circle',
        tone: 'success',
      }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save UPI ID'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setSavingUpi(false);
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="receipt" title="Receipt Builder" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Receipt Builder</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={styles.subtitle}>
          Choose what prints on the customer bill — Print KOT/Generate Bill (Token Orders, Tables, Billing) all use this. Business name, items, and totals always print.
        </Text>

        <Text style={styles.fieldLabel}>GST / Tax Registration Number</Text>
        {isLoading ? (
          <SkeletonBox height={46} radius={8} style={{ marginBottom: 20 }} />
        ) : (
          <View style={styles.gstRow}>
            <View style={{ borderRadius: 4, flex: 1 }}>
              <TextInput
                style={[styles.gstInput, { flex: 1 }]}
                placeholder="e.g. 29ABCDE1234F1Z5 (leave blank to hide)"
                placeholderTextColor={COLORS.placeholder}
                value={gstDraft}
                onChangeText={setGstDraft}
                onBlur={saveGst}
                autoCapitalize="characters"
              />
            </View>
            {/* Only shows up once the field is dirty, so an untouched/already-saved GST
                number doesn't carry a permanent tick — tap it to save without needing to
                blur the field, or just tab/click away (onBlur above still covers that). */}
            {(savingGst || gstDraft.trim() !== (settings?.gstNumber ?? '')) && (
              <TouchableOpacity style={styles.gstSaveBtn} onPress={saveGst} disabled={savingGst} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                {savingGst ? (
                  <ActivityIndicator size="small" color={COLORS.accent} />
                ) : (
                  <Icon name="check" size={20} color={COLORS.accent} />
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        <Text style={styles.fieldLabel}>UPI ID for bill payments</Text>
        {isLoading ? (
          <SkeletonBox height={46} radius={8} style={{ marginBottom: 20 }} />
        ) : (
          <>
            <View style={styles.gstRow}>
              <View style={{ borderRadius: 4, flex: 1 }}>
                <TextInput
                  style={[styles.gstInput, { flex: 1 }]}
                  placeholder="e.g. cafename@okaxis (leave blank to hide)"
                  placeholderTextColor={COLORS.placeholder}
                  value={upiDraft}
                  onChangeText={setUpiDraft}
                  onBlur={saveUpi}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              </View>
              {(savingUpi || upiDraft.trim() !== (settings?.upiVpa ?? '')) && (
                <TouchableOpacity style={styles.gstSaveBtn} onPress={saveUpi} disabled={savingUpi} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  {savingUpi ? (
                    <ActivityIndicator size="small" color={COLORS.accent} />
                  ) : (
                    <Icon name="check" size={20} color={COLORS.accent} />
                  )}
                </TouchableOpacity>
              )}
            </View>
            {/* Says plainly what the QR does and does not do — a biller who assumes the app
                marks the order paid by itself would leave bills open all day. */}
            <Text style={styles.upiHint}>
              Adds a scan-to-pay QR for the exact bill amount, on the printed bill and behind Pay by UPI on the bill screen. Payment still has to be
              confirmed and marked paid by staff — the app is not told when a guest pays.
            </Text>
          </>
        )}

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
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: isDesktopWeb ? 6 : 6 },
  gstRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 6, marginBottom: isDesktopWeb ? 14 : 15 },
  // Sits directly under the UPI row, which already carries the section's bottom margin —
  // hence the negative pull-up rather than a second gap between field and explanation.
  upiHint: { fontSize: 11, lineHeight: 16, color: COLORS.muted, marginTop: -8, marginBottom: 20 },
  gstInput: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 4,
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    height: 46,
    fontSize: 16,
    color: COLORS.heading,
  },
  gstSaveBtn: { width: 36, height: 46, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 9 : 9, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 12 : 12, marginBottom: isDesktopWeb ? 9 : 9 },
  cardIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.heading },
  cardDesc: { fontSize: 12, color: COLORS.muted, marginTop: 1.5 },
});
