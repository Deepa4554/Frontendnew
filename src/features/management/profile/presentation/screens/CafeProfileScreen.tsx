import React, { useEffect, useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Switch, Image, Modal, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useSettings, useUpdateSettings } from '../../../../../core/api/hooks/useSettings';
import { pickImageAsDataUri } from '../../../../../core/utils/imagePicker';
import { getCurrentLocation } from '../../../../../core/utils/geolocation';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonProfileHeader, SkeletonText } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { TimePickerModal, TIME_12H_RE } from '../../../../../shared/components/atoms/TimePickerModal';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

interface DayHours {
  day: string;
  open: boolean;
  from: string;
  to: string;
}

const DEFAULT_HOURS: DayHours[] = [
  { day: 'Monday', open: true, from: '07:00 AM', to: '06:00 PM' },
  { day: 'Tuesday', open: true, from: '07:00 AM', to: '06:00 PM' },
  { day: 'Wednesday', open: true, from: '07:00 AM', to: '06:00 PM' },
  { day: 'Thursday', open: true, from: '07:00 AM', to: '06:00 PM' },
  { day: 'Friday', open: true, from: '07:00 AM', to: '08:00 PM' },
  { day: 'Saturday', open: true, from: '08:00 AM', to: '08:00 PM' },
  { day: 'Sunday', open: false, from: '08:00 AM', to: '04:00 PM' },
];

type FieldId = 'businessName' | 'phone' | 'address' | 'licenceNumber';

const FIELD_META: Record<FieldId, { label: string; placeholder: string; icon: string }> = {
  businessName: { label: 'Business Name', placeholder: 'e.g. Downtown Espresso', icon: 'storefront-outline' },
  phone: { label: 'Phone', placeholder: 'e.g. +91 98765 43210', icon: 'phone-outline' },
  address: { label: 'Location', placeholder: 'e.g. 123 Brew St, Metro City', icon: 'map-marker-outline' },
  // Free text, not digits-only: FSSAI numbers are 14 digits but a state shop licence can
  // carry letters and slashes, and rejecting those would just lock a cafe out of its own number.
  licenceNumber: { label: 'Licence Number', placeholder: 'e.g. FSSAI 12345678901234', icon: 'certificate-outline' },
};

export const CafeProfileScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const { data: settings, isLoading, isError, refetch } = useSettings();
  const updateSettings = useUpdateSettings();

  const [hours, setHours] = useState<DayHours[]>(DEFAULT_HOURS);
  const [editingField, setEditingField] = useState<FieldId | null>(null);
  const [fieldDraft, setFieldDraft] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [editingTime, setEditingTime] = useState<{ idx: number; field: 'from' | 'to' } | null>(null);

  const handleUseCurrentLocation = async () => {
    setCapturingLocation(true);
    try {
      const loc = await getCurrentLocation();
      if (!loc.ok) {
        dispatch(showToast({ message: loc.message, icon: 'map-marker-off-outline', tone: 'danger' }));
        return;
      }
      await updateSettings.mutateAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      dispatch(showToast({ message: 'Cafe location saved — staff must now punch in/out within 500m of here.', icon: 'check-circle-outline', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save location'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setCapturingLocation(false);
    }
  };

  useEffect(() => {
    if (!settings) return;
    try {
      const parsed = settings.storeHoursJson ? JSON.parse(settings.storeHoursJson) : null;
      if (Array.isArray(parsed) && parsed.length === 7) setHours(parsed);
    } catch {
      // Malformed/empty JSON — keep the sensible default rather than crashing the screen.
    }
  }, [settings]);

  const openFieldEditor = (field: FieldId) => {
    if (!settings) return;
    setFieldDraft(settings[field] ?? '');
    setEditingField(field);
  };

  const saveField = async () => {
    if (!editingField) return;
    const value = fieldDraft.trim();

    if (editingField === 'businessName' && !value) {
      dispatch(showToast({ message: 'Business name cannot be empty.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (editingField === 'phone' && value && !/^\d{7,15}$/.test(value)) {
      dispatch(showToast({ message: 'Enter a valid phone number (7-15 digits).', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }

    try {
      await updateSettings.mutateAsync({ [editingField]: value });
      setEditingField(null);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleFieldDraftChange = (text: string) => {
    // Phone gets digit-only input as you type — the field-editor TextInput is
    // shared across businessName/phone/address with no keyboardType/filter of
    // its own today, so letters were freely typeable into a phone number.
    setFieldDraft(editingField === 'phone' ? text.replace(/[^0-9]/g, '').slice(0, 15) : text);
  };

  const handleUploadLogo = async () => {
    try {
      setUploadingLogo(true);
      const dataUri = await pickImageAsDataUri();
      if (!dataUri) return;
      await updateSettings.mutateAsync({ logoUrl: dataUri });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not upload logo'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setUploadingLogo(false);
    }
  };

  const toggleDay = (idx: number) => {
    setHours((prev) => prev.map((h, i) => (i === idx ? { ...h, open: !h.open } : h)));
  };

  const applyPickedTime = (value: string) => {
    if (!editingTime) return;
    const { idx, field } = editingTime;
    setHours((prev) => prev.map((h, i) => (i === idx ? { ...h, [field]: value } : h)));
    setEditingTime(null);
  };

  const saveHours = async () => {
    // Times now only come from the picker, so this can't normally fail — it's a guard
    // against hours rows that predate the picker (storeHoursJson used to accept free
    // text, so old rows can hold anything). Only checked for days toggled open.
    const invalidDay = hours.find((h) => h.open && (!TIME_12H_RE.test(h.from.trim()) || !TIME_12H_RE.test(h.to.trim())));
    if (invalidDay) {
      dispatch(showToast({
        message: `${invalidDay.day}: enter times like "07:00 AM" / "06:00 PM".`,
        icon: 'alert-circle-outline',
        tone: 'warning',
      }));
      return;
    }
    try {
      setSavingHours(true);
      await updateSettings.mutateAsync({ storeHoursJson: JSON.stringify(hours) });
      dispatch(showToast({ message: 'Store hours updated.', icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save hours'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setSavingHours(false);
    }
  };

  if (isError && !settings) {
    return (
      <View style={styles.container}>
        <ErrorState
          title="Couldn't load cafe profile"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  if (isLoading || !settings) {
    return (
      <View style={styles.container}>
        <View style={{ padding: 16 }}>
          <SkeletonProfileHeader style={{ marginBottom: 24 }} />
          <SkeletonText lines={2} style={{ marginBottom: 16 }} />
          <SkeletonText lines={2} style={{ marginBottom: 16 }} />
          <SkeletonText lines={2} style={{ marginBottom: 16 }} />
          <SkeletonText lines={3} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="storefront-outline" title="Cafe Profile" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Cafe Settings</Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Profile hero */}
        <View style={styles.heroCard}>
          <View style={styles.logoWrap}>
            {settings.logoUrl ? (
              <Image source={{ uri: settings.logoUrl }} style={styles.logoImage} />
            ) : (
              <View style={styles.logoCircle}>
                <Icon name="coffee" size={30} color="#FFFFFF" />
              </View>
            )}
            <TouchableOpacity style={styles.logoEdit} onPress={handleUploadLogo} disabled={uploadingLogo}>
              {uploadingLogo ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="pencil" size={12} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
          <Text style={styles.cafeName}>{settings.businessName}</Text>
          <Text style={styles.cafeMeta}>{settings.tenantSlug ? `prabandhos.app/${settings.tenantSlug}` : 'Your cafe profile'}</Text>
        </View>

        {(['businessName', 'phone', 'address', 'licenceNumber'] as FieldId[]).map((field) => (
          <TouchableOpacity key={field} style={styles.fieldCard} onPress={() => openFieldEditor(field)}>
            <View style={styles.fieldHeaderRow}>
              <Text style={styles.fieldLabel}>{FIELD_META[field].label.toUpperCase()}</Text>
              <Icon name="pencil-outline" size={14} color={COLORS.muted} />
            </View>
            <View style={styles.inputField}>
              <Icon name={FIELD_META[field].icon} size={18} color={COLORS.muted} />
              <Text style={[styles.inputValue, !settings[field] && styles.inputValuePlaceholder]}>
                {settings[field] || FIELD_META[field].placeholder}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Punch in/out geofence anchor — see AttendanceController.EnsureWithinGeofenceAsync */}
        <View style={styles.fieldCard}>
          <View style={styles.fieldHeaderRow}>
            <Text style={styles.fieldLabel}>PUNCH-IN LOCATION</Text>
          </View>
          <View style={styles.inputField}>
            <Icon name="crosshairs-gps" size={18} color={COLORS.muted} />
            <Text style={[styles.inputValue, settings.latitude == null && styles.inputValuePlaceholder]}>
              {settings.latitude != null && settings.longitude != null
                ? `${settings.latitude.toFixed(5)}, ${settings.longitude.toFixed(5)}`
                : 'Not set — staff can punch in/out from anywhere'}
            </Text>
          </View>
          <TouchableOpacity style={styles.locationBtn} onPress={handleUseCurrentLocation} disabled={capturingLocation}>
            {capturingLocation ? <ActivityIndicator size="small" color={COLORS.heading} /> : <Icon name="crosshairs-gps" size={16} color={COLORS.heading} />}
            <Text style={styles.locationBtnText}>Use Current Location</Text>
          </TouchableOpacity>
          <Text style={styles.locationHint}>Stand at the cafe and tap this — staff will then need to be within 500m of here to punch in or out.</Text>
        </View>

        {/* Store hours */}
        <View style={styles.hoursCard}>
          <View style={styles.hoursHeader}>
            <View style={styles.cardLabelRow}>
              <Icon name="clock-outline" size={16} color={COLORS.heading} />
              <Text style={styles.hoursTitle}>Store Hours</Text>
            </View>
            <TouchableOpacity onPress={saveHours} disabled={savingHours}>
              {savingHours ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Text style={styles.saveHoursText}>Save</Text>}
            </TouchableOpacity>
          </View>

          {hours.map((h, idx) => (
            <View key={h.day} style={[styles.dayRow, idx !== hours.length - 1 && styles.dayDivider]}>
              <View style={styles.dayNameRow}>
                <Switch
                  value={h.open}
                  onValueChange={() => toggleDay(idx)}
                  trackColor={{ false: '#DDD1C6', true: COLORS.button }}
                  thumbColor="#FFFFFF"
                  style={styles.daySwitch}
                />
                <Text style={[styles.dayName, !h.open && styles.dayNameOff]}>{h.day}</Text>
              </View>
              {/* Own row, full width — cramming these inline next to the day
                  name left too little room for "HH:MM AM/PM" and clipped it
                  at the screen edge. */}
              <View style={styles.timeRow}>
                {(['from', 'to'] as const).map((field, i) => (
                  <React.Fragment key={field}>
                    {i === 1 && <Text style={[styles.toText, !h.open && styles.dayNameOff]}>to</Text>}
                    <TouchableOpacity
                      style={[styles.timeChip, !h.open && styles.timeChipOff]}
                      disabled={!h.open}
                      onPress={() => setEditingTime({ idx, field })}
                    >
                      <Icon name="clock-outline" size={13} color={h.open ? COLORS.muted : COLORS.placeholder} />
                      <Text style={[styles.timeChipText, !h.open && styles.timeChipTextOff]} numberOfLines={1}>
                        {h[field]}
                      </Text>
                    </TouchableOpacity>
                  </React.Fragment>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ---------- Field editor modal ---------- */}
      <Modal visible={!!editingField} transparent animationType="fade" onRequestClose={() => setEditingField(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>{editingField ? FIELD_META[editingField].label : ''}</Text>
              <CloseButton onPress={() => setEditingField(null)} size={18} />
            </View>
            <View style={{ borderRadius: 12 }}>
              <TextInput
                style={styles.modalInput}
                value={fieldDraft}
                onChangeText={handleFieldDraftChange}
                placeholder={editingField ? FIELD_META[editingField].placeholder : ''}
                placeholderTextColor={COLORS.placeholder}
                keyboardType={editingField === 'phone' ? 'phone-pad' : 'default'}
                maxLength={editingField === 'phone' ? 15 : undefined}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditingField(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveField} disabled={updateSettings.isPending}>
                {updateSettings.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                  <>
                    <Icon name="check" size={14} color="#FFFFFF" />
                    <Text style={styles.modalSaveText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Store-hours time picker ---------- */}
      <TimePickerModal
        visible={!!editingTime}
        value={editingTime ? hours[editingTime.idx][editingTime.field] : ''}
        title={editingTime ? `${hours[editingTime.idx].day} — ${editingTime.field === 'from' ? 'Opens At' : 'Closes At'}` : ''}
        onCancel={() => setEditingTime(null)}
        onConfirm={applyPickedTime}
      />
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 9 : 9, paddingTop: isDesktopWeb ? 9 : 9, paddingBottom: isDesktopWeb ? 6 : 6, gap: isDesktopWeb ? 3 : 3 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  heroCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 16 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 16 : 16.5,
    alignItems: 'center',
    marginBottom: isDesktopWeb ? 10 : 10.5,
    marginTop: isDesktopWeb ? 6 : 6,
  },
  logoWrap: { position: 'relative', marginBottom: isDesktopWeb ? 9 : 9 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: { width: 72, height: 72, borderRadius: 36 },
  logoEdit: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.heading,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.cardAlt,
  },
  cafeName: { fontSize: 22, fontWeight: 'bold', color: COLORS.heading },
  cafeMeta: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, marginTop: isDesktopWeb ? 3 : 3 },
  fieldCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: isDesktopWeb ? 12 : 12, marginBottom: isDesktopWeb ? 10 : 10.5 },
  fieldHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 7 : 7.5 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 },
  inputField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 7 : 7.5,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    height: 50,
  },
  inputValue: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '600', color: COLORS.heading },
  inputValuePlaceholder: { color: COLORS.placeholder, fontWeight: '400' },
  locationBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.background, borderRadius: 8, paddingVertical: isDesktopWeb ? 9 : 9, marginTop: isDesktopWeb ? 9 : 9,
  },
  locationBtnText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading },
  locationHint: { fontSize: 11, color: COLORS.muted, marginTop: isDesktopWeb ? 6 : 6, lineHeight: 15 },
  hoursCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: isDesktopWeb ? 12 : 12, marginBottom: isDesktopWeb ? 12 : 12 },
  hoursHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 9 : 9 },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 6 },
  hoursTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '700', color: COLORS.heading },
  saveHoursText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.accent },
  dayRow: { gap: isDesktopWeb ? 6 : 6, paddingVertical: isDesktopWeb ? 9 : 9 },
  dayDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  dayNameRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 6 },
  daySwitch: { transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] },
  dayName: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading },
  dayNameOff: { color: COLORS.placeholder },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 6 },
  timeChip: {
    flex: 1,
    // Web gives flex children an implicit min-width of "auto" — they refuse to shrink
    // below their own content's natural width no matter what flex:1 says, which is
    // exactly what was pushing "06:00 PM" past the screen edge on narrow phones.
    // minWidth: 0 overrides that so flex:1 can actually size both chips down to fit.
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 4 : 3.75,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 8,
    paddingVertical: isDesktopWeb ? 8 : 7.5,
    paddingHorizontal: isDesktopWeb ? 3 : 3,
  },
  timeChipOff: { borderColor: COLORS.divider, backgroundColor: COLORS.background },
  timeChipText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '600', color: COLORS.heading },
  timeChipTextOff: { color: COLORS.placeholder },
  toText: { fontSize: 12, color: COLORS.muted, flexShrink: 0 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43,24,16,0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 16 : 16.5 },
  modalSheet: { width: '100%', backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 12 : 12, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 6, flexShrink: 1 },
  modalInput: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: isDesktopWeb ? 9 : 8,
    paddingHorizontal: isDesktopWeb ? 7.5 : 10,
    height: 34,
    fontSize: isDesktopWeb ? 16 : 12,
    color: COLORS.heading,
    marginBottom: 6,
  },
  modalActions: { flexDirection: 'row', gap: 6, marginTop: 6 },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 6,
    paddingVertical: 7.5,
  },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: 7.5,
  },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
