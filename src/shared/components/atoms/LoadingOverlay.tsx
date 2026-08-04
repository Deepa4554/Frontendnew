import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useThemeColors } from '../../../core/theme/useThemeColors';

interface LoadingOverlayProps {
  visible: boolean;
  /** Optional line under the spinner, e.g. "Saving…". */
  message?: string;
  /**
   * How long the work has to actually be in flight before the spinner appears.
   * A save that comes back in 60ms would otherwise flash a scrim on and off,
   * which reads worse than the toggle just moving — so only genuinely slow
   * round trips get an overlay.
   */
  delay?: number;
}

/**
 * Blocking spinner over whatever it's dropped into. Put it as the LAST child of a
 * screen's root `flex: 1` View so it covers the screen and swallows taps while a
 * write is in flight — that's what stops a toggle from looking dead (or being
 * tapped twice) while the server round trip is happening.
 */
export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ visible, message, delay = 120 }) => {
  const COLORS = useThemeColors();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(timer);
  }, [visible, delay]);

  if (!visible || !shown) return null;

  return (
    <View style={styles.fill} pointerEvents="auto">
      <View style={[styles.card, { backgroundColor: COLORS.cardAlt }]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        {!!message && <Text style={[styles.label, { color: COLORS.heading }]}>{message}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(43, 24, 16, 0.18)',
    zIndex: 1000,
    elevation: 1000,
  },
  card: {
    minWidth: 96,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  label: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
