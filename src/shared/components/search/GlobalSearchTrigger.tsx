import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, ScrollView, Modal, Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector } from 'react-redux';
import { RootState } from '../../../core/store/rootReducer';
import { useSearch } from '../../../core/api/hooks/useSearch';
import { SearchResult } from '../../../core/api/searchApi';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';
import { usePlanCategory } from '../../../core/plan/planCategory';
import { useSettings } from '../../../core/api/hooks/useSettings';
import { searchScreens, ScreenSearchEntry } from '../../../core/navigation/screenSearchIndex';
import { Tooltip } from '../atoms/Tooltip';

const TYPE_ICON: Record<SearchResult['category'], string> = {
  Orders: 'receipt',
  Customers: 'account',
  Inventory: 'package-variant-closed',
  Menu: 'silverware-fork-knife',
  Tables: 'table-furniture',
};

const ROUTE_FOR: Record<SearchResult['category'], string> = {
  Orders: 'Billing',
  Customers: 'CRM',
  Inventory: 'Inventory',
  Menu: 'Menu',
  Tables: 'Tables',
};

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

interface Props {
  navigation: any;
  iconColor?: string;
  iconSize?: number;
  style?: any;
}

/**
 * Header search icon that opens a live-typeahead results overlay in place —
 * same instant-dropdown behavior as the desktop web topbar search, instead of
 * pushing a dedicated full-screen Search route.
 */
export const GlobalSearchTrigger: React.FC<Props> = ({ navigation, iconColor, iconSize = 22, style }) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const user = useSelector((s: RootState) => s.auth.user);
  const { category: planCategory } = usePlanCategory();
  const { data: settings } = useSettings();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isFetching } = useSearch(debounced);
  const isSearching = query.trim().length >= 2;
  const screenResults = isSearching ? searchScreens(query, { user: user ?? undefined, planCategory, settings }) : [];

  const close = () => {
    setVisible(false);
    setQuery('');
  };

  const goTo = (item: SearchResult) => {
    close();
    navigation.navigate(ROUTE_FOR[item.category]);
  };

  const goToScreen = (entry: ScreenSearchEntry) => {
    close();
    entry.navigate(navigation);
  };

  return (
    <>
      <Tooltip label="Search" placement="bottom">
        <TouchableOpacity style={[styles.iconBtn, style]} onPress={() => setVisible(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="magnify" size={iconSize} color={iconColor ?? COLORS.heading} />
        </TouchableOpacity>
      </Tooltip>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={[styles.panel, { marginTop: insets.top + 12 }]} onPress={() => {}}>
            <View style={styles.inputRow}>
              <Icon name="magnify" size={20} color={COLORS.muted} />
              <View style={styles.inputWrap}>
                <TextInput
                  style={[styles.input, webNoOutline]}
                  placeholder="Search orders, customers, menu, inventory, tables..."
                  placeholderTextColor={COLORS.placeholder}
                  value={query}
                  onChangeText={setQuery}
                  autoFocus
                  returnKeyType="search"
                />
              </View>
              {!!query && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Icon name="close-circle" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            {isSearching && (
              isFetching ? (
                <Text style={styles.status}>Searching…</Text>
              ) : results.length === 0 && screenResults.length === 0 ? (
                <Text style={styles.status}>No results for "{query}"</Text>
              ) : (
                <ScrollView style={styles.resultsScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {screenResults.map((entry) => (
                    <TouchableOpacity key={`screen_${entry.id}`} style={styles.resultRow} onPress={() => goToScreen(entry)} activeOpacity={0.7}>
                      <View style={styles.resultIcon}>
                        <Icon name={entry.icon} size={18} color={COLORS.muted} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.resultTitle} numberOfLines={1}>{entry.label}</Text>
                      </View>
                      <Text style={styles.resultCategory}>SCREEN</Text>
                    </TouchableOpacity>
                  ))}
                  {results.map((item) => (
                    <TouchableOpacity key={`${item.category}_${item.id}`} style={styles.resultRow} onPress={() => goTo(item)} activeOpacity={0.7}>
                      <View style={styles.resultIcon}>
                        <Icon name={TYPE_ICON[item.category]} size={18} color={COLORS.muted} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.resultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                      </View>
                      <Text style={styles.resultCategory}>{item.category.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: isDesktopWeb ? 12 : 9 },
  panel: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: isDesktopWeb ? 10 : 7.5,
    maxHeight: '75%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 8 : 6,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 10 : 7.5,
    height: 34,
  },
  // 16px, not 12 — iOS/Android mobile browsers auto-zoom the whole page on focus of any
  // input whose font-size is under 16px. Every other search box in the app is already at
  // 16 (see e.g. MenuScreen/InventoryScreen's searchInput); this one was the outlier.
  inputWrap: { flex: 1, minWidth: 0, borderRadius: 8 },
  input: { width: '100%', fontSize: 16, color: COLORS.heading },
  cancelText: { fontSize: 12, fontWeight: '600', color: COLORS.accent, marginLeft: isDesktopWeb ? 4 : 3 },
  status: { fontSize: 12, color: COLORS.muted, paddingVertical: isDesktopWeb ? 16 : 12, textAlign: 'center' },
  resultsScroll: { marginTop: isDesktopWeb ? 8 : 6 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 8 : 6,
    paddingVertical: isDesktopWeb ? 8 : 6,
    paddingHorizontal: isDesktopWeb ? 6 : 4.5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
  },
  resultIcon: { width: 32, alignItems: 'center' },
  resultTitle: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  resultSubtitle: { fontSize: 12, color: COLORS.muted, marginTop: 0.75 },
  resultCategory: { fontSize: 9, fontWeight: '800', color: COLORS.muted },
});
