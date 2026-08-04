import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useResponsive } from '../utils/useResponsive';

interface ScreenContainerProps {
  children: React.ReactNode;
  /** Caps content width on wide desktop browsers so it doesn't stretch edge-to-edge on a big monitor. Narrower for single-column reading flows (forms, onboarding), wider for grids/dashboards. */
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Centers content with a max-width once the viewport is desktop-wide; on
 * mobile (native or a narrow browser) it's a no-op passthrough so nothing
 * changes there. Wrap a screen's top-level content in this instead of
 * applying max-width per-screen.
 */
export const ScreenContainer: React.FC<ScreenContainerProps> = ({ children, maxWidth = 1200, style }) => {
  const { isWideLayout } = useResponsive();

  if (!isWideLayout) {
    return <View style={[styles.fill, style]}>{children}</View>;
  }

  return (
    <View style={styles.centerRow}>
      <View style={[styles.fill, { maxWidth }, style]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
  centerRow: { flex: 1, alignItems: 'center', width: '100%' },
});
