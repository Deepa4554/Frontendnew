import React from 'react';
import { View, StyleSheet } from 'react-native';

export type VegNonVegType = 'Veg' | 'NonVeg' | 'Jain' | 'Eggetarian';

interface Props {
  type: VegNonVegType | null | undefined;
  size?: number;
  style?: object;
}

/** Standard Indian veg/non-veg mark — a square outline with a solid shape inside.
 * Veg/Jain: green circle. Eggetarian: amber circle (not meat, but not pure-veg either).
 * NonVeg: maroon triangle. Renders nothing when the item has no tag set. */
export const VegNonVegBadge: React.FC<Props> = ({ type, size = 14, style }) => {
  if (!type) return null;

  const color = type === 'NonVeg' ? '#B71C1C' : type === 'Eggetarian' ? '#B26A00' : '#0B8043';
  const markSize = size * 0.52;

  return (
    <View style={[styles.box, { width: size, height: size, borderColor: color }, style]}>
      {type === 'NonVeg' ? (
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: markSize / 2,
            borderRightWidth: markSize / 2,
            borderBottomWidth: markSize * 0.85,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: color,
          }}
        />
      ) : (
        <View style={{ width: markSize, height: markSize, borderRadius: markSize / 2, backgroundColor: color }} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
