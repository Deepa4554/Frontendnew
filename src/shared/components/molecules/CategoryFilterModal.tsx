import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';

interface CategoryFilterModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  categories: string[];
  activeCategory: string;
  /** Omit when a per-category count isn't available (e.g. would need an extra,
   * unscoped fetch just to compute it) — the count pill is skipped entirely
   * rather than showing a misleading 0. */
  counts?: Record<string, number>;
  onSelect: (category: string) => void;
}

/** Vertical category picker (name + item count per row) opened from a single
 * "Filter" trigger — replaces a horizontally-scrolling pill row, which hides
 * most categories off-screen and shows no counts. */
export const CategoryFilterModal: React.FC<CategoryFilterModalProps> = ({
  visible,
  onClose,
  title = 'Categories',
  categories,
  activeCategory,
  counts,
  onSelect,
}) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.dragHandle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="close" size={18} color={COLORS.heading} />
            </TouchableOpacity>
          </View>
          <ScrollView bounces={false} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {categories.map((cat) => {
              const active = cat === activeCategory;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => {
                    onSelect(cat);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowLeft}>
                    <View style={[styles.dot, active && styles.dotActive]} />
                    <Text style={[styles.rowText, active && styles.rowTextActive]}>{cat}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    {counts && (
                      <View style={[styles.countPill, active && styles.countPillActive]}>
                        <Text style={[styles.rowCount, active && styles.rowCountActive]}>{counts[cat] ?? 0}</Text>
                      </View>
                    )}
                    {active && <Icon name="check" size={14} color={COLORS.accent} style={{ marginLeft: 8 }} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

/** Small trigger button that opens the modal — shows the current selection.
 * Pass `style` to override the default standalone spacing/width, e.g. when
 * placing two triggers side by side (`{ flex: 1, marginHorizontal: 6, maxWidth: undefined }`). */
export const CategoryFilterTrigger: React.FC<{ label: string; onPress: () => void; style?: object }> = ({ label, onPress, style }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  return (
    <TouchableOpacity style={[styles.trigger, style]} onPress={onPress} activeOpacity={0.75}>
      <Icon name="tune-variant" size={15} color={COLORS.heading} />
      <Text style={styles.triggerText} numberOfLines={1}>{label}</Text>
      <Icon name="chevron-down" size={16} color={COLORS.muted} />
    </TouchableOpacity>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: isDesktopWeb ? 6 : 4.5,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 14 : 10.5,
    paddingVertical: isDesktopWeb ? 8 : 6,
    marginHorizontal: isDesktopWeb ? 20 : 15,
    marginBottom: isDesktopWeb ? 14 : 10.5,
    maxWidth: 220,
  },
  triggerText: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: COLORS.heading,
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,12,6,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: '72%',
    paddingBottom: isDesktopWeb ? 16 : 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.inputBorder,
    alignSelf: 'center',
    marginTop: isDesktopWeb ? 8 : 6,
    marginBottom: isDesktopWeb ? 4 : 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    paddingTop: isDesktopWeb ? 10 : 7.5,
    paddingBottom: isDesktopWeb ? 10 : 7.5,
    gap: isDesktopWeb ? 8 : 6,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.heading,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: isDesktopWeb ? 12 : 9,
    paddingBottom: isDesktopWeb ? 8 : 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: isDesktopWeb ? 12 : 9,
    paddingVertical: isDesktopWeb ? 8 : 6,
    borderRadius: 8,
    marginBottom: isDesktopWeb ? 2 : 1.5,
  },
  rowActive: {
    backgroundColor: COLORS.pillActiveBg,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 8 : 6,
    flexShrink: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.inputBorder,
  },
  dotActive: {
    backgroundColor: COLORS.accent,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
    flexShrink: 1,
  },
  countPill: {
    backgroundColor: COLORS.background,
    borderRadius: 999,
    paddingHorizontal: isDesktopWeb ? 9 : 6.75,
    paddingVertical: isDesktopWeb ? 3 : 2.25,
    minWidth: 28,
    alignItems: 'center',
  },
  countPillActive: {
    backgroundColor: '#FFFFFF',
  },
  rowCount: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
  },
  rowCountActive: {
    color: COLORS.accent,
  },
  rowTextActive: {
    color: COLORS.accent,
    fontWeight: '800',
  },
});
