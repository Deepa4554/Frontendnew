import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { DesktopColors as COLORS } from '../../design/desktopWebTheme';
import { useResponsive } from '../../../core/utils/useResponsive';
import { Tooltip } from '../atoms/Tooltip';

interface Props {
  /** MaterialCommunityIcons name — mirrors the screen's mobile header / sidebar icon. */
  icon: string;
  title: string;
  /** Only for drill-down screens that have no sidebar pill of their own. */
  onBack?: () => void;
  /** Filters, export buttons, "Add" CTAs — anything the screen pins to the right. */
  right?: React.ReactNode;
  /**
   * Fills the empty run between the title and `right` — meant for a horizontally
   * scrollable strip (e.g. POS's category tabs), so it takes the spare width and
   * shrinks instead of pushing `right` off the edge. The title stops flexing when
   * this is present.
   */
  center?: React.ReactNode;
}

/**
 * The one page header every screen shows on a tablet/desktop browser: logo icon +
 * 17px title, matching the mobile header. Renders nothing on native / mobile-width
 * web, so a screen can drop it in next to its untouched mobile header:
 *
 *   <DesktopPageHeader icon="file-chart-outline" title="Sales Report" />
 *   {!isDesktopWeb && ( ...existing mobile header... )}
 *
 * Deliberately has no subtitle slot — the per-screen descriptive lines were the
 * main source of header drift across screens.
 */
export const DesktopPageHeader: React.FC<Props> = ({ icon, title, onBack, right, center }) => {
  const { isDesktopWeb } = useResponsive();
  if (!isDesktopWeb) return null;

  return (
    <View style={styles.header}>
      {!!onBack && (
        <Tooltip label="Back" placement="bottom">
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
        </Tooltip>
      )}
      <Icon name={icon} size={20} color={COLORS.accent} />
      <Text style={[styles.title, !!center && styles.titleWithCenter]} numberOfLines={1}>{title}</Text>
      {!!center && <View style={styles.centerSlot}>{center}</View>}
      {!!right && <View style={styles.rightSlot}>{right}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  backBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  // Longhands, not `flex: 0` — react-native-web expands `flex: 0` to a `flex-basis: 0%`
  // with no grow, which collapsed the title to zero width instead of sizing it to its
  // text. (`flex: undefined` is no good either: style flattening keeps the explicit
  // undefined and leaves the base `flex: 1` unbeaten.)
  titleWithCenter: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
  },
  // minWidth:0 is what actually lets an inner horizontal ScrollView shrink below its
  // content width — without it the strip forces the header wider and `right` gets
  // pushed past the edge instead of the strip scrolling.
  centerSlot: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
});
