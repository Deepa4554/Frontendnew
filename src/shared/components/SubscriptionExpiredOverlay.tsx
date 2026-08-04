import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, Dimensions, Linking } from 'react-native';
import { useDispatch } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { WarmColors as COLORS } from '../design/warmTheme';
import { forceLogout } from '../../features/auth/presentation/viewmodels/authSlice';

const SUPPORT_PHONE = '7689813155';

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

  useEffect(() => {
    setVisibleRef = setVisible;
    return () => {
      setVisibleRef = null;
    };
  }, []);

  if (!visible) return null;

  const handleCall = () => {
    Linking.openURL(`tel:${SUPPORT_PHONE}`);
  };

  const handleLogout = () => {
    setVisible(false);
    dispatch(forceLogout());
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.iconWrap}>
            <Icon name="alert-octagon-outline" size={30} color={COLORS.dangerAccent} />
          </View>
          <Text style={styles.title}>Subscription Expired</Text>
          <Text style={styles.message}>
            Your CafePOS plan has expired. Please contact the PrabandhOS team to renew or upgrade your subscription.
          </Text>

          <TouchableOpacity style={styles.callButton} onPress={handleCall} activeOpacity={0.85}>
            <Icon name="phone" size={16} color="#FFFFFF" />
            <Text style={styles.callButtonText}>Call {SUPPORT_PHONE}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
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
    maxWidth: 380,
    backgroundColor: COLORS.background,
    borderRadius: 14,
    padding: isDesktopWeb ? 28 : 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.dangerBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.heading,
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 22,
  },
  callButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.button,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  logoutButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  logoutButtonText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
  },
});
