import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Switch, ActivityIndicator, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useDeliverySettings, useUpdateDeliverySettings } from '../../../../../core/api/hooks/useDelivery';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

/**
 * Sets up Borzo, the courier service that puts a real rider on a delivery order.
 *
 * Two things here are money-safe by design and shouldn't be "simplified" away. The auth token
 * is write-only — the screen can say one is saved but never shows it back, because a token on
 * screen is a token someone photographs. And Test mode starts ON, so the first booking anyone
 * makes goes to Borzo's sandbox; turning it off is a deliberate act with its own warning,
 * since from then on every booking hires a real person and spends real money.
 */
export const DeliveryPartnerScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  const { data: settings, isLoading } = useDeliverySettings();
  const { mutate: save, isPending } = useUpdateDeliverySettings();

  // Typed but not yet saved. Kept out of `settings` so an in-progress paste is never confused
  // with what the server actually holds.
  const [tokenDraft, setTokenDraft] = useState('');
  const [callbackTokenDraft, setCallbackTokenDraft] = useState('');
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const patch = (req: Parameters<typeof save>[0], successMessage: string) =>
    save(req, {
      onSuccess: () => dispatch(showToast({ message: successMessage, icon: 'check-circle', tone: 'success' })),
      onError: (err: any) =>
        dispatch(showToast({
          message: err?.response?.data?.title || err?.message || 'Could not save. Try again.',
          icon: 'alert-circle-outline',
          tone: 'danger',
        })),
    });

  /**
   * Pins where the rider collects from. Uses this device's own location, which is right because
   * the person setting this up is standing in the cafe — but only if they are: doing it from
   * home would send every rider to the wrong address, which is why the hint says so.
   */
  const pinPickupLocation = () => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.geolocation) {
      dispatch(showToast({ message: 'Location isn’t available on this device. Open the app in a browser at the cafe to pin it.', icon: 'information-outline', tone: 'info' }));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        patch(
          { pickupLatitude: position.coords.latitude, pickupLongitude: position.coords.longitude },
          'Pickup location pinned.',
        );
      },
      () => {
        setLocating(false);
        dispatch(showToast({ message: 'Couldn’t get this device’s location. Allow location access and try again.', icon: 'alert-circle-outline', tone: 'warning' }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const saveToken = () => {
    if (!tokenDraft.trim()) {
      dispatch(showToast({ message: 'Paste the token from your Borzo account first.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    patch({ authToken: tokenDraft.trim() }, 'Borzo token saved.');
    // Cleared immediately — it's saved server-side now, and leaving it in the box would put a
    // live credential on screen for as long as the page stays open.
    setTokenDraft('');
  };

  const saveCallbackToken = () => {
    if (!callbackTokenDraft.trim()) {
      dispatch(showToast({ message: 'Paste the callback token Borzo shows in its cabinet first.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    patch({ callbackToken: callbackTokenDraft.trim() }, 'Callback token saved — copy the URL below into Borzo.');
    setCallbackTokenDraft('');
  };

  const copyCallbackUrl = async () => {
    if (!settings?.callbackUrl) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(settings.callbackUrl);
      dispatch(showToast({ message: 'Callback URL copied.', icon: 'check-circle', tone: 'success' }));
    } else {
      dispatch(showToast({ message: 'Copy isn’t available here — select the URL below manually.', icon: 'information-outline', tone: 'info' }));
    }
  };

  const title = 'Delivery Partner';

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="moped" title={title} onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={styles.subtitle}>
          Book a Borzo rider for home-delivery orders. Nothing is ever dispatched automatically —
          you set a prep time and press Book rider on the order itself.
        </Text>

        {isLoading && <ActivityIndicator size="small" color={COLORS.accent} />}

        {settings && (
          <>
            <View style={styles.card}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Enable Borzo</Text>
                  <Text style={styles.hint}>Off means no rider can be booked at all.</Text>
                </View>
                <Switch
                  value={settings.enabled}
                  disabled={isPending}
                  onValueChange={(v) => patch({ enabled: v }, v ? 'Borzo enabled.' : 'Borzo disabled.')}
                />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Borzo auth token</Text>
              <Text style={styles.hint}>
                {settings.hasAuthToken
                  ? 'A token is saved. Paste a new one to replace it — it’s never shown back.'
                  : 'From your Borzo account → Integration tab.'}
              </Text>
              <TextInput
                style={styles.fieldInput}
                placeholder={settings.hasAuthToken ? '•••••••• (saved)' : 'Paste token here'}
                placeholderTextColor={COLORS.placeholder}
                value={tokenDraft}
                onChangeText={setTokenDraft}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={saveToken} disabled={isPending}>
                <Icon name="content-save" size={15} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Save token</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Callback verification</Text>
              <Text style={styles.hint}>
                Optional, but recommended. Borzo's cabinet shows a "callback token" when you set
                up the Integration URL — paste it here first, then copy the URL below into
                Borzo's Callback URL field. This lets the app tell a real Borzo status update
                apart from anything else that might hit this address.
              </Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Paste the callback token from Borzo"
                placeholderTextColor={COLORS.placeholder}
                value={callbackTokenDraft}
                onChangeText={setCallbackTokenDraft}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={saveCallbackToken} disabled={isPending}>
                <Icon name="content-save" size={15} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Save callback token</Text>
              </TouchableOpacity>

              {settings.callbackUrl ? (
                <>
                  <Text style={[styles.hint, { marginTop: 12 }]}>Paste this exact URL into Borzo's Callback URL field:</Text>
                  <Text selectable style={styles.callbackUrlText}>{settings.callbackUrl}</Text>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={copyCallbackUrl}>
                    <Icon name="content-copy" size={14} color={COLORS.accent} />
                    <Text style={styles.secondaryBtnText}>Copy URL</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={[styles.hint, { marginTop: 8 }]}>
                  Skipping this is fine — delivery status updates still work, just unverified.
                </Text>
              )}
            </View>

            <View style={[styles.card, settings.useTestEnvironment ? styles.cardSafe : styles.cardLive]}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Test mode (sandbox)</Text>
                  <Text style={styles.hint}>
                    {settings.useTestEnvironment
                      ? 'Safe: bookings go to Borzo’s sandbox. No real rider, no charge — and sandbox prices are not real prices.'
                      : 'LIVE: every Book rider hires a real rider and charges your Borzo balance.'}
                  </Text>
                </View>
                <Switch
                  value={settings.useTestEnvironment}
                  disabled={isPending}
                  onValueChange={(v) =>
                    patch({ useTestEnvironment: v }, v ? 'Switched to sandbox.' : 'LIVE mode — real riders, real charges.')
                  }
                />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Pickup location</Text>
              <Text style={styles.hint}>
                Where the rider collects. Pin this while you are physically at the cafe — the app
                uses this device’s location.
              </Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Cafe address for the rider"
                placeholderTextColor={COLORS.placeholder}
                value={pickupAddress ?? settings.pickupAddress ?? ''}
                onChangeText={setPickupAddress}
                onBlur={() => {
                  if (pickupAddress !== null && pickupAddress !== settings.pickupAddress) {
                    patch({ pickupAddress }, 'Pickup address saved.');
                  }
                }}
              />
              <TouchableOpacity style={styles.secondaryBtn} onPress={pinPickupLocation} disabled={locating || isPending}>
                {locating ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Icon name="map-marker-radius" size={15} color={COLORS.accent} />}
                <Text style={styles.secondaryBtnText}>
                  {settings.pickupLatitude !== null ? 'Re-pin from this device' : 'Pin from this device'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.hint}>
                {settings.pickupLatitude !== null && settings.pickupLongitude !== null
                  ? `📍 Pinned: ${settings.pickupLatitude.toFixed(5)}, ${settings.pickupLongitude.toFixed(5)}`
                  : 'Not pinned yet — riders can’t be booked until this is set.'}
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Add delivery fee to the bill</Text>
                  <Text style={styles.hint}>
                    {settings.passFeeToCustomer
                      ? 'The courier’s charge is added to the customer’s bill.'
                      : 'The cafe absorbs the courier’s charge — the customer sees no delivery fee.'}
                  </Text>
                </View>
                <Switch
                  value={settings.passFeeToCustomer}
                  disabled={isPending}
                  onValueChange={(v) => patch({ passFeeToCustomer: v }, 'Saved.')}
                />
              </View>
            </View>

            <View style={[styles.statusBanner, settings.readyToBook ? styles.statusOk : styles.statusBlocked]}>
              <Icon
                name={settings.readyToBook ? 'check-circle' : 'alert-circle-outline'}
                size={16}
                color={settings.readyToBook ? COLORS.success : COLORS.heading}
              />
              <Text style={styles.statusText}>
                {settings.readyToBook
                  ? `Ready to book riders${settings.useTestEnvironment ? ' (sandbox)' : ' — LIVE'}.`
                  : !settings.enabled
                    ? 'Turn on Enable Borzo to start.'
                    : !settings.hasAuthToken
                      ? 'Add your Borzo token to continue.'
                      : (settings.pickupLatitude === null || settings.pickupLongitude === null)
                        ? 'Pin the pickup location to continue.'
                        : !settings.pickupAddress
                          ? 'Add a pickup address above — Borzo needs it, not just the map pin.'
                          : 'Add the cafe’s phone number in Cafe Profile — the rider needs a pickup contact.'}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingTop: 9, paddingBottom: 6, gap: 4.5 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  subtitle: { fontSize: 12, color: COLORS.muted, lineHeight: 18, marginBottom: 15 },
  card: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: 12, marginBottom: 12 },
  cardSafe: { borderWidth: 1, borderColor: COLORS.success },
  cardLive: { borderWidth: 1, borderColor: COLORS.danger },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { fontSize: 13, fontWeight: '700', color: COLORS.heading },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: 6 },
  fieldInput: {
    backgroundColor: COLORS.background, borderRadius: 8, paddingHorizontal: 10.5, height: 46,
    fontSize: 16, color: COLORS.heading, borderWidth: 1, borderColor: COLORS.inputBorder, marginTop: 8,
  },
  hint: { fontSize: 11, color: COLORS.muted, marginTop: 4, lineHeight: 16 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: 10, marginTop: 10,
  },
  primaryBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: COLORS.accent, borderRadius: 6, paddingVertical: 9, marginTop: 10,
  },
  secondaryBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
  callbackUrlText: {
    fontSize: 11, color: COLORS.heading, backgroundColor: COLORS.background,
    borderRadius: 6, padding: 9, marginTop: 6, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, padding: 12 },
  statusOk: { backgroundColor: COLORS.cardAlt },
  statusBlocked: { backgroundColor: COLORS.cardAlt },
  statusText: { flex: 1, fontSize: 12, color: COLORS.heading, lineHeight: 17 },
});
