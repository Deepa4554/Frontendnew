import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Animated,
  Easing,
  StyleSheet,
  ViewStyle,
  DimensionValue,
  Platform,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';

// ─── Skeleton Box (base primitive) ────────────────────────────────────────────
interface SkeletonBoxProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
}

// A same-opacity-the-whole-time pulse reads as "a static gray box" at a glance —
// what people mean by "moving skeleton" is a light band sweeping across it. The
// sweep has to travel the box's *actual* rendered width, though: a fixed -400..400
// range covers a phone row but dies halfway across a 1200px+ desktop row, so the
// shimmer looked stuck on laptop/big screens. Instead each box measures itself on
// layout and animates the band from just off its left edge to just past its right
// edge — full traversal at any width. Speed is held roughly constant (~pixels/ms)
// by scaling the loop duration to the distance, so a wide desktop row sweeps at the
// same visual pace as a narrow phone one instead of flashing past.
export const SkeletonBox: React.FC<SkeletonBoxProps> = ({
  width = '100%',
  height = 14,
  radius = 6,
  style,
}) => {
  const { isDesktopWeb } = useResponsive();
  const colors = useThemeColors();
  const sweep = useRef(new Animated.Value(0)).current;

  // A wider highlight band reads better on the larger surfaces desktop renders.
  const band = isDesktopWeb ? 200 : 120;

  // Real measured width; falls back to a phone-ish default until first layout so the
  // shimmer is already moving on the very first frame instead of waiting a tick.
  const [boxWidth, setBoxWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w && Math.abs(w - boxWidth) > 1) setBoxWidth(w);
  };

  const measured = boxWidth || 320;
  // Constant-ish velocity: distance / speed, clamped so tiny boxes aren't frantic
  // and giant ones aren't sluggish.
  const distance = measured + band;
  const duration = Math.min(2200, Math.max(900, Math.round(distance / 0.9)));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep, duration]);

  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-band, measured] });

  return (
    <View
      onLayout={onLayout}
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.divider, overflow: 'hidden' }, style]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { width: band, transform: [{ translateX }] }]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.35)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
};

// ─── Skeleton Circle (avatar / icon placeholder) ──────────────────────────────
export const SkeletonCircle: React.FC<{ size?: number; style?: ViewStyle }> = ({ size = 40, style }) => (
  <SkeletonBox width={size} height={size} radius={size / 2} style={style} />
);

// ─── Skeleton Text (one or more lines) ────────────────────────────────────────
interface SkeletonTextProps {
  width?: DimensionValue;
  lines?: number;
  lineHeight?: number;
  gap?: number;
  lastLineWidth?: DimensionValue;
  style?: ViewStyle;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  width = '100%',
  lines = 1,
  lineHeight = 12,
  gap = 8,
  lastLineWidth = '60%',
  style,
}) => (
  <View style={style}>
    {Array.from({ length: lines }).map((_, i) => (
      <SkeletonBox
        key={i}
        width={i === lines - 1 && lines > 1 ? lastLineWidth : width}
        height={lineHeight}
        style={i > 0 ? { marginTop: gap } : undefined}
      />
    ))}
  </View>
);

// ─── Skeleton Row (thumbnail + three lines — list item shape) ────────────────
export const SkeletonRow: React.FC<{
  avatar?: boolean;
  avatarShape?: 'circle' | 'square';
  style?: ViewStyle;
}> = ({ avatar = true, avatarShape = 'circle', style }) => (
  <View style={[styles.row, style]}>
    {avatar && (
      avatarShape === 'circle' ? (
        <SkeletonCircle size={44} style={{ marginRight: 12 }} />
      ) : (
        <SkeletonBox width={52} height={52} radius={10} style={{ marginRight: 12 }} />
      )
    )}
    <View style={{ flex: 1 }}>
      <SkeletonBox width="55%" height={13} />
      <SkeletonBox width="90%" height={11} style={{ marginTop: 8 }} />
      <SkeletonBox width="70%" height={11} style={{ marginTop: 6 }} />
    </View>
  </View>
);

// ─── Skeleton List (repeated rows — order/customer/staff-style list screens) ──
export const SkeletonList: React.FC<{
  rows?: number;
  avatar?: boolean;
  avatarShape?: 'circle' | 'square';
  style?: ViewStyle;
}> = ({ rows = 6, avatar = true, avatarShape = 'circle', style }) => (
  <View style={style}>
    {Array.from({ length: rows }).map((_, i) => (
      <SkeletonRow key={i} avatar={avatar} avatarShape={avatarShape} style={i > 0 ? { marginTop: 18 } : undefined} />
    ))}
  </View>
);

// ─── Skeleton Profile Header (cover banner + overlapping avatar — profile screens) ──
export const SkeletonProfileHeader: React.FC<{ bannerHeight?: number; avatarSize?: number; style?: ViewStyle }> = ({
  bannerHeight = 110,
  avatarSize = 84,
  style,
}) => {
  const colors = useThemeColors();
  return (
    <View style={[styles.profileHeader, style]}>
      <SkeletonBox width="100%" height={bannerHeight} radius={16} />
      <View
        style={[
          styles.profileAvatarRing,
          {
            width: avatarSize + 8,
            height: avatarSize + 8,
            borderRadius: (avatarSize + 8) / 2,
            marginTop: -(avatarSize / 2) - 4,
            backgroundColor: colors.card,
          },
        ]}
      >
        <SkeletonCircle size={avatarSize} />
      </View>
      <SkeletonBox width={150} height={15} style={{ marginTop: 14 }} />
      <SkeletonBox width={110} height={11} style={{ marginTop: 8 }} />
    </View>
  );
};

// ─── Skeleton Card (single tile — menu/table/product-style grid cell) ────────
export const SkeletonCard: React.FC<{ height?: number; style?: ViewStyle }> = ({ height = 120, style }) => (
  <View style={[styles.card, style]}>
    <SkeletonBox width="100%" height={height * 0.6} radius={10} />
    <SkeletonBox width="70%" height={12} style={{ marginTop: 10 }} />
    <SkeletonBox width="40%" height={10} style={{ marginTop: 6 }} />
  </View>
);

// ─── Skeleton Grid (wrapped cards — POS/menu/table grid screens) ─────────────
export const SkeletonGrid: React.FC<{ items?: number; columns?: number; cardHeight?: number; style?: ViewStyle }> = ({
  items = 6,
  columns = 2,
  cardHeight = 120,
  style,
}) => (
  <View style={[styles.grid, style]}>
    {Array.from({ length: items }).map((_, i) => (
      <SkeletonCard key={i} height={cardHeight} style={{ width: `${100 / columns - 2}%` as DimensionValue }} />
    ))}
  </View>
);

// ─── Skeleton Stat Row (dashboard-style summary tiles) ────────────────────────
export const SkeletonStatRow: React.FC<{ count?: number; style?: ViewStyle }> = ({ count = 4, style }) => (
  <View style={[styles.statRow, style]}>
    {Array.from({ length: count }).map((_, i) => (
      <View key={i} style={styles.statTile}>
        <SkeletonBox width={28} height={28} radius={8} />
        <SkeletonBox width="70%" height={16} style={{ marginTop: 12 }} />
        <SkeletonBox width="50%" height={10} style={{ marginTop: 6 }} />
      </View>
    ))}
  </View>
);

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    padding: isDesktopWeb ? 12 : 9,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: isDesktopWeb ? 12 : 9,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: isDesktopWeb ? 12 : 9,
  },
  statTile: {
    flexGrow: 1,
    flexBasis: 140,
    padding: isDesktopWeb ? 14 : 10.5,
    borderRadius: 8,
  },
  profileHeader: {
    alignItems: 'center',
  },
  profileAvatarRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
