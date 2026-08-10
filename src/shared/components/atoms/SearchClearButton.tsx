import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { Tooltip } from './Tooltip';

interface SearchClearButtonProps {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Tiny "x" button dropped into a search box's wrapper (position: relative) to clear its text on tap. */
export const SearchClearButton = ({ onPress, style }: SearchClearButtonProps) => {
  const COLORS = useThemeColors();
  return (
    <Tooltip label="Clear search" placement="bottom" style={[styles.btn, style]}>
      <TouchableOpacity
        onPress={onPress}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Icon name="close-circle" size={13} color={COLORS.muted} />
      </TouchableOpacity>
    </Tooltip>
  );
};

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    right: 10,
    top: '50%',
    marginTop: -6.5,
  },
});
