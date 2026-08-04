import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RootState } from '../../core/store/rootReducer';
import { hideToast } from '../../core/store/uiSlice';
import { WarmColors as COLORS } from '../design/warmTheme';
import { useResponsive } from '../../core/utils/useResponsive';
import { NonBlockingOverlay } from './NonBlockingOverlay';

const TONE_COLORS: Record<string, { bg: string; icon: string }> = {
  success: { bg: COLORS.heading, icon: COLORS.vibeCrema },
  info: { bg: COLORS.heading, icon: '#FFFFFF' },
  warning: { bg: COLORS.warning, icon: '#FFFFFF' },
  danger: { bg: COLORS.dangerAccent, icon: '#FFFFFF' },
};

// Mounted once near the app root. Anywhere in the app, dispatch(showToast({message, icon, tone}))
// to surface a brief, self-dismissing confirmation — used for "item added", "unavailable", etc.
// Anchored to the top (not bottom) with a very high zIndex so it always renders above the
// sidebar, tab bar, and any modal — nothing else in the app is allowed to outrank it.
//
// On desktop web it's pinned to the top-right and animates upward into place, like a flag
// being raised up a pole, instead of the mobile drop-down-from-above — matches where a
// desktop user's eye already sits (top-right is where every other web app puts alerts).
export const ToastHost = () => {
  const dispatch = useDispatch();
  const toast = useSelector((s: RootState) => s.ui.toast);
  const insets = useSafeAreaInsets();
  const { isDesktopWeb } = useResponsive();
  const restingOffset = isDesktopWeb ? 36 : -80;
  const translateY = useRef(new Animated.Value(restingOffset)).current;
  const scale = useRef(new Animated.Value(isDesktopWeb ? 0.85 : 1)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: isDesktopWeb ? 7 : 8, tension: isDesktopWeb ? 60 : 40 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();

    timerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: restingOffset, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => dispatch(hideToast()));
    }, toast.durationMs ?? 1800);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.key, isDesktopWeb]);

  if (!toast) return null;
  const tone = TONE_COLORS[toast.tone ?? 'success'];

  return (
    // NonBlockingOverlay (not RN's own <Modal>) escapes the app's normal view tree so this
    // renders above the sidebar, tab bar, and any screen-level modal — see its own comments
    // for why react-native-web's <Modal> can't be made to do this without blocking every
    // click on the page underneath for as long as the toast is mounted.
    <NonBlockingOverlay visible={!!toast} zIndex={99999}>
      <View
        style={[
          styles.wrapper,
          isDesktopWeb
            ? { top: insets.top + 20, right: 24, alignItems: 'flex-end' }
            : { top: insets.top + 12, left: 0, right: 0, alignItems: 'center' },
        ]}
        pointerEvents="none"
      >
        <Animated.View
          style={[
            styles.toast,
            isDesktopWeb && styles.toastDesktop,
            { backgroundColor: tone.bg, transform: [{ translateY }, { scale }], opacity },
          ]}
        >
          <Icon name={toast.icon ?? 'check-circle'} size={18} color={tone.icon} />
          <Text style={styles.text}>{toast.message}</Text>
        </Animated.View>
      </View>
    </NonBlockingOverlay>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    zIndex: 99999,
    elevation: 99999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 8 : 6,
    paddingHorizontal: isDesktopWeb ? 18 : 13.5,
    paddingVertical: isDesktopWeb ? 12 : 9,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    maxWidth: '86%',
  },
  toastDesktop: {
    maxWidth: 380,
  },
  text: {
    color: '#FFFFFF',
    fontSize: isDesktopWeb ? 14 : 12,
    fontWeight: '700',
  },
});
