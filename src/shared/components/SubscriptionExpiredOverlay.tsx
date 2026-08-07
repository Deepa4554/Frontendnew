import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useDispatch } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../core/theme/useThemeColors';
import { useResponsive } from '../../core/utils/useResponsive';
import { useSubscription } from '../../core/api/hooks/useSubscription';
import { SubscriptionTier } from '../../core/api/subscriptionApi';
import { navigationRef } from '../../core/navigation/navigationRef';
import { forceLogout } from '../../features/auth/presentation/viewmodels/authSlice';

const SUPPORT_PHONE = '7689813155';

const PLAN_LABELS: Record<SubscriptionTier, string> = {
  FREETRIAL: 'Free Trial',
  STARTER: 'Basic',
  PROFESSIONAL: 'Plus',
  ENTERPRISE: 'Enterprise',
};

// Set by registerPlanExpiredHandler (see App.tsx) whenever the API client sees a 402
// from SubscriptionExpiryMiddleware — that status means every screen's data calls are
// being blocked tenant-wide, so this renders on top of whatever screen is open rather
// than each screen trying to show its own "plan expired" error. Same module-level
// setter pattern as confirmAlert in ConfirmDialogHost.tsx.
let setVisibleRef: ((v: boolean) => void) | null = null;

export function showSubscriptionExpired(): void {
  setVisibleRef?.(true);
}

export const SubscriptionExpiredOverlay = () => {
  const [visible, setVisible] = useState(false);
  const dispatch = useDispatch();
  const COLORS = useThemeColors();
  const { isDesktopWeb, isMobile } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  // Only fetched once the overlay is actually shown — the 402 that triggered it already
  // means the plan/expiry fields on this same tenant are stale everywhere else too, but
  // this call is unauthenticated-safe to skip until there's something to render.
  const { data: subscription } = useSubscription();

  useEffect(() => {
    setVisibleRef = setVisible;
    return () => {
      setVisibleRef = null;
    };
  }, []);

  if (!visible) return null;

  const planLabel = subscription ? PLAN_LABELS[subscription.plan] : '—';
  const expiredOnLabel = subscription?.planExpiresAt
    ? new Date(subscription.planExpiresAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const handleRenew = () => {
    setVisible(false);
    if (navigationRef.isReady()) navigationRef.navigate('SaaS' as never);
  };

  const handleCall = () => {
    Linking.openURL(`tel:${SUPPORT_PHONE}`);
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent('Hi, my CafePOS subscription has expired and I need help renewing.');
    Linking.openURL(`https://wa.me/91${SUPPORT_PHONE}?text=${text}`);
  };

  // "WhatsApp Support" at full length is the widest thing in this modal — on a narrow
  // phone (~320-360px) two of those side by side is tighter than the button has room
  // for, so it drops to just the app name on mobile rather than wrapping to 2 lines.
  const callLabel = isMobile ? 'Call' : 'Call Support';
  const whatsAppLabel = isMobile ? 'WhatsApp' : 'WhatsApp Support';

  const handleLogout = () => {
    setVisible(false);
    dispatch(forceLogout());
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.iconWrap}>
            <Icon name="alert-octagon-outline" size={32} color={COLORS.dangerAccent} />
          </View>
          <Text style={styles.title}>Subscription Expired</Text>
          <Text style={styles.message}>
            Your subscription has expired. Renew your plan to continue using CafePOS without interruption.
          </Text>

          <View style={styles.detailsCard}>
            <View style={styles.detailsRow}>
              <View style={styles.detailsRowLeft}>
                <Icon name="crown-outline" size={16} color={COLORS.muted} />
                <Text style={styles.detailsLabel} numberOfLines={1}>Plan</Text>
              </View>
              <Text style={[styles.detailsValue, { color: COLORS.accent }]} numberOfLines={1}>{planLabel}</Text>
            </View>
            <View style={styles.detailsDivider} />
            <View style={styles.detailsRow}>
              <View style={styles.detailsRowLeft}>
                <Icon name="calendar-alert" size={16} color={COLORS.muted} />
                <Text style={styles.detailsLabel} numberOfLines={1}>Expired On</Text>
              </View>
              <Text style={styles.detailsValue} numberOfLines={1}>{expiredOnLabel}</Text>
            </View>
            <View style={styles.detailsDivider} />
            <View style={styles.detailsRow}>
              <View style={styles.detailsRowLeft}>
                <Icon name="lock-clock" size={16} color={COLORS.muted} />
                <Text style={styles.detailsLabel} numberOfLines={1}>Access Status</Text>
              </View>
              <Text style={[styles.detailsValue, { color: COLORS.dangerAccent }]} numberOfLines={1}>Access Restricted</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.renewButton} onPress={handleRenew} activeOpacity={0.85}>
            <View style={styles.renewButtonLeft}>
              <Icon name="crown" size={16} color="#FFFFFF" />
              <Text style={styles.renewButtonText} numberOfLines={1}>Renew Subscription</Text>
            </View>
            <Icon name="arrow-right" size={16} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.secondaryRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleCall} activeOpacity={0.75}>
              <Icon name="phone-outline" size={15} color={COLORS.heading} />
              <Text style={styles.secondaryButtonText} numberOfLines={1}>{callLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleWhatsApp} activeOpacity={0.75}>
              <Icon name="whatsapp" size={15} color={COLORS.success} />
              <Text style={styles.secondaryButtonText} numberOfLines={1}>{whatsAppLabel}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footerDivider} />

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
            <Icon name="logout" size={15} color={COLORS.muted} />
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(43, 24, 16, 0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: isDesktopWeb ? 24 : 18,
      // Pinned above everything else in the app — sidebar, tab bar, toasts, confirm
      // dialogs — the same way ConfirmDialogHost does, since react-native-web's Modal
      // polyfill isn't guaranteed to win the stacking context on its own.
      zIndex: 9999999,
      elevation: 9999999,
    },
    sheet: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: COLORS.cardAlt,
      borderRadius: 20,
      padding: isDesktopWeb ? 28 : 22,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 24,
      elevation: 12,
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: COLORS.dangerBg,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 19,
      fontWeight: '800',
      color: COLORS.heading,
      marginBottom: 8,
      textAlign: 'center',
    },
    message: {
      fontSize: 13,
      color: COLORS.muted,
      lineHeight: 19,
      textAlign: 'center',
      marginBottom: 20,
    },
    detailsCard: {
      width: '100%',
      backgroundColor: COLORS.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: COLORS.divider,
      paddingHorizontal: 14,
      marginBottom: 18,
    },
    detailsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    detailsRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 1,
      marginRight: 8,
    },
    detailsLabel: {
      fontSize: 13,
      color: COLORS.muted,
      fontWeight: '600',
      flexShrink: 1,
    },
    detailsValue: {
      fontSize: 13,
      color: COLORS.heading,
      fontWeight: '700',
    },
    detailsDivider: {
      height: 1,
      backgroundColor: COLORS.divider,
    },
    renewButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: COLORS.button,
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 18,
      width: '100%',
      marginBottom: 10,
    },
    renewButtonLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    renewButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    secondaryRow: {
      flexDirection: 'row',
      width: '100%',
      gap: 10,
      marginBottom: 4,
    },
    secondaryButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: COLORS.inputBorder,
      backgroundColor: COLORS.cardAlt,
      borderRadius: 10,
      paddingVertical: 11,
    },
    secondaryButtonText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: COLORS.heading,
    },
    footerDivider: {
      width: '100%',
      height: 1,
      backgroundColor: COLORS.divider,
      marginVertical: 14,
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 4,
    },
    logoutButtonText: {
      color: COLORS.muted,
      fontSize: 13,
      fontWeight: '600',
    },
  });
