import React, { useState } from 'react';
import { Pressable, StyleProp, ViewStyle, Insets } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';

interface CloseButtonProps {
  onPress: () => void;
  /** Icon size — call sites use 18 for compact headers and 22 for larger sheets. */
  size?: number;
  /** Resting icon color. Defaults to the muted token, which is what almost every header used. */
  color?: string;
  /** Defaults to 'close'; overridable so a call site can theme the glyph if it ever needs to. */
  name?: string;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number | Insets;
}

const DEFAULT_HIT_SLOP: Insets = { top: 10, bottom: 10, left: 10, right: 10 };

/**
 * The X that dismisses a popup. On laptop/desktop web it lights up red (with a soft
 * red halo) on hover, so the "close" affordance is unmistakable on a pointer device —
 * native/mobile has no hover, so there it just renders the resting color and behaves
 * like the plain touchable it replaces. Use this everywhere instead of hand-rolling a
 * TouchableOpacity+Icon so every popup's close button looks and reacts the same.
 */
export const CloseButton: React.FC<CloseButtonProps> = ({
  onPress,
  size = 22,
  color,
  name = 'close',
  style,
  hitSlop = DEFAULT_HIT_SLOP,
}) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const [hovered, setHovered] = useState(false);

  // Hover only ever fires on a pointer device, but gate on isDesktopWeb too so the
  // red state is strictly a laptop-and-wider behavior and never a stray touch state.
  const isHot = isDesktopWeb && hovered;
  const iconColor = isHot ? COLORS.danger : color ?? COLORS.muted;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      // Constant 2px padding whether hovered or not, so the hover halo appears without
      // nudging the row's layout.
      style={[{ padding: 2, borderRadius: 8 }, isHot && { backgroundColor: COLORS.dangerBg }, style]}
    >
      <Icon name={name} size={size} color={iconColor} />
    </Pressable>
  );
};
