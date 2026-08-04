import React from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { LoadingOverlay } from '../../../../../shared/components/atoms/LoadingOverlay';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { useWhatsAppLogout, useWhatsAppPair, useWhatsAppStatus, useUpdateWhatsAppSettings } from '../../../../../core/api/hooks/useWhatsApp';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

/**
 * Pairing/settings screen for this tenant's own WhatsApp Business number (Baileys) — the
 * bespoke tap target IntegrationsHubScreen routes the "WhatsApp Business" card to instead of
 * the generic connect/disconnect toggle every other integration uses. See
 * whatsapp-service/src/settingsApi/settingsController.ts and CafePosApi's WhatsAppController
 * for what's actually behind these calls.
 */
export const WhatsAppSetupScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const { data: status, isLoading } = useWhatsAppStatus();
  const pair = useWhatsAppPair();
  const logout = useWhatsAppLogout();
  const updateSettings = useUpdateWhatsAppSettings();

  const connected = status?.status === 'Connected';
  const connecting = status?.status === 'Connecting';

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="whatsapp" title="WhatsApp Business" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="whatsapp" size={22} color="#25D366" />
          <Text style={styles.brandTitle}>WhatsApp Business</Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {isLoading ? (
          <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
        ) : connected ? (
          <View style={styles.card}>
            <View style={styles.connectedPill}>
              <Icon name="check-circle" size={14} color={COLORS.success} />
              <Text style={styles.connectedPillText}>CONNECTED</Text>
            </View>
            <Text style={styles.phoneText}>{status?.phoneNumberE164 ?? 'Unknown number'}</Text>
            <Text style={styles.subText}>
              Customers who scan the QR on their token get automatic status updates and their bill on this number.
            </Text>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Automatic order updates</Text>
                <Text style={styles.toggleSub}>Send status + bill messages automatically</Text>
              </View>
              <Switch
                value={status?.updatesEnabled ?? true}
                onValueChange={(value) => updateSettings.mutate(value)}
                trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                thumbColor="#FFFFFF"
              />
            </View>

            <TouchableOpacity
              style={styles.disconnectBtn}
              disabled={logout.isPending}
              onPress={() => logout.mutate()}
            >
              {logout.isPending ? <ActivityIndicator size="small" color={COLORS.dangerAccent} /> : (
                <Text style={styles.disconnectBtnText}>Disconnect</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            {pair.data?.qrDataUrl || connecting ? (
              <>
                {pair.data?.qrDataUrl && (
                  <Image source={{ uri: pair.data.qrDataUrl }} style={styles.qrImage} resizeMode="contain" />
                )}
                <Text style={styles.subText}>
                  Open WhatsApp on the number you want to use for this cafe → Settings → Linked Devices → Link a Device, then scan this code.
                </Text>
                <TouchableOpacity style={styles.setupBtn} disabled={pair.isPending} onPress={() => pair.mutate()}>
                  {pair.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                    <Text style={styles.setupBtnText}>Refresh QR</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.subText}>
                  Connect this cafe's own WhatsApp Business number so customers can track their token orders and get their bill automatically.
                </Text>
                <TouchableOpacity style={styles.setupBtn} disabled={pair.isPending} onPress={() => pair.mutate()}>
                  {pair.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                    <Text style={styles.setupBtnText}>Connect WhatsApp</Text>
                  )}
                </TouchableOpacity>
                {pair.isError && (
                  <Text style={styles.errorText}>Couldn't reach the WhatsApp connector service. Make sure it's running.</Text>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      <LoadingOverlay visible={updateSettings.isPending} message="Saving…" />
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 7 : 7.5,
    paddingHorizontal: 12,
    paddingBottom: 9,
  },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  brandTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  card: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  connectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 10,
  },
  connectedPillText: { fontSize: 11, fontWeight: '700', color: COLORS.success },
  phoneText: { fontSize: 18, fontWeight: '700', color: COLORS.heading, marginBottom: 6 },
  subText: { fontSize: 13, color: COLORS.muted, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  errorText: { fontSize: 12, color: COLORS.dangerAccent, textAlign: 'center', marginTop: 10 },
  qrImage: { width: 220, height: 220, marginBottom: 16, backgroundColor: '#FFFFFF', borderRadius: 8 },
  setupBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 160,
    alignItems: 'center',
  },
  setupBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.divider,
    marginTop: 6,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: COLORS.heading },
  toggleSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  disconnectBtn: { marginTop: 14, paddingVertical: 10, paddingHorizontal: 20 },
  disconnectBtnText: { color: COLORS.dangerAccent, fontWeight: '700', fontSize: 14 },
});
