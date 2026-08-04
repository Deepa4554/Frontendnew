import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { WarmColors as COLORS } from '../design/warmTheme';

interface InitialsAvatarProps {
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

// Small fixed palette, picked deterministically from the name so the same
// person always gets the same color across screens (no photo needed).
const PALETTE = [COLORS.vibeEspresso, COLORS.vibeCrema, COLORS.accent, COLORS.proTipBg, COLORS.dangerAccent];

const colorFor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
};

const initialsFor = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Fallback avatar when a person has no uploaded photo — a colored circle with
 * their initials, instead of a fake stock-photo placeholder. */
export const InitialsAvatar: React.FC<InitialsAvatarProps> = ({ name, size = 40, style }) => (
  <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(name) }, style]}>
    <Text style={[styles.text, { fontSize: size * 0.4 }]}>{initialsFor(name)}</Text>
  </View>
);

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
