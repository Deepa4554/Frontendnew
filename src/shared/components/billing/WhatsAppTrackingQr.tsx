import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';
import { ordersApi } from '../../../core/api/ordersApi';

interface Props {
  orderId: number | null;
}

/** The customer-facing WhatsApp tracking QR for whichever order popup this is mounted in —
 * shared by TokenDashboardScreen and TableManagementScreen so both token and table orders
 * get the same live-updates opt-in (see OrdersController.GetOrCreateWhatsAppTracking, which
 * is order-type-agnostic). Renders nothing until a deep link actually comes back — a tenant
 * with no WhatsApp Business number connected just gets no QR section, never a visible error. */
export const WhatsAppTrackingQr: React.FC<Props> = ({ orderId }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const [trackingDeepLink, setTrackingDeepLink] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setTrackingDeepLink(null);
      return;
    }
    // Guards against a slow response for an order the cashier already navigated away from
    // landing in the newly-opened one's popup.
    let cancelled = false;
    setTrackingDeepLink(null);
    ordersApi
      .getOrCreateWhatsAppTracking(orderId)
      .then(({ whatsAppDeepLink }) => {
        if (!cancelled) setTrackingDeepLink(whatsAppDeepLink);
      })
      .catch(() => {
        // Best-effort, exactly as on the token slip.
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!trackingDeepLink) return null;

  return (
    <View style={styles.trackQrSection}>
      <Text style={styles.trackQrTitle}>Track on WhatsApp</Text>
      <View style={styles.trackQrFrame}>
        <QRCode value={trackingDeepLink} size={isDesktopWeb ? 160 : 180} />
      </View>
      <Text style={styles.trackQrHint}>
        Ask the customer to scan this with their phone camera to get live order updates on WhatsApp.
      </Text>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  trackQrSection: { alignItems: 'center', marginTop: isDesktopWeb ? 14 : 16, paddingTop: isDesktopWeb ? 14 : 16, borderTopWidth: 1, borderTopColor: COLORS.divider },
  trackQrTitle: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading, marginBottom: 10 },
  // Always white behind the code, never COLORS.card — in dark mode a dark-on-dark QR is
  // unreadable to a phone camera, and this one exists purely to be scanned.
  trackQrFrame: { padding: 12, backgroundColor: '#FFFFFF', borderRadius: 8 },
  trackQrHint: { fontSize: 12, color: COLORS.muted, textAlign: 'center', marginTop: 10 },
});
