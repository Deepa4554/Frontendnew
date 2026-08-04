import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useExpiringBatches } from '../../../../../core/api/hooks/useInventory';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { SearchClearButton } from '../../../../../shared/components/atoms/SearchClearButton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const round = (n: number) => Math.round(n * 1000) / 1000;

const urgencyLabel = (daysUntilExpiry: number | null, isExpired: boolean) => {
  if (isExpired) return 'Expired';
  if (daysUntilExpiry === 0) return 'Expires today';
  if (daysUntilExpiry === 1) return 'Expires tomorrow';
  return `${daysUntilExpiry} days left`;
};

export const ExpiringBatchesScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const [days, setDays] = useState(7);
  const [search, setSearch] = useState('');
  const { data: batches = [], isLoading, isError, refetch } = useExpiringBatches(days);

  const filtered = batches.filter((b) => b.inventoryItemName.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="clock-alert-outline" title="Expiring Batches" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      
        <View style={styles.filterBox}>
          <Text style={styles.filterLabel}>WINDOW:</Text>
          <View style={styles.filterPillsRow}>
            {[3, 7, 14, 30].map((d) => (
              <TouchableOpacity key={d} style={[styles.filterPill, days === d && styles.filterPillActive]} onPress={() => setDays(d)}>
                <Text style={[styles.filterPillText, days === d && styles.filterPillTextActive]}>{d} days</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.searchWrapper}>
          <Icon name="magnify" size={18} color={COLORS.muted} style={{ marginRight: 8 }} />
          <View style={styles.searchInputWrap}>
            <TextInput
              style={[styles.searchInput, { paddingRight: 24 }]}
              placeholder="Search ingredient..."
              placeholderTextColor={COLORS.placeholder}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && <SearchClearButton onPress={() => setSearch('')} />}
          </View>
        </View>

        {isError && batches.length === 0 ? (
          <ErrorState title="Couldn't load expiring batches" message="Check your connection and try again." onRetry={() => refetch()} />
        ) : (
          <View style={styles.tableCard}>
            {isLoading && (
              <View style={{ padding: 16 }}>
                <SkeletonList rows={6} />
              </View>
            )}
            {!isLoading && filtered.length === 0 && (
              <View style={styles.emptyBox}>
                <Icon name="check-circle-outline" size={28} color={COLORS.success} />
                <Text style={styles.emptyText}>Nothing expiring in the next {days} days.</Text>
              </View>
            )}

            {filtered.map((b, index) => (
              <View key={b.id} style={[styles.row, index !== filtered.length - 1 && styles.rowDivider]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{b.inventoryItemName}</Text>
                  <Text style={styles.metaText}>
                    {round(b.quantity)} {b.unit} · Expiry {b.expiryDate}
                  </Text>
                </View>
                <View style={styles.rightBox}>
                  <View style={[styles.urgencyBadge, b.isExpired ? styles.urgencyExpired : styles.urgencySoon]}>
                    <Text style={[styles.urgencyText, { color: b.isExpired ? COLORS.dangerAccent : COLORS.warning }]}>
                      {urgencyLabel(b.daysUntilExpiry, b.isExpired)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.wasteBtn}
                    onPress={() => navigation.navigate('Inventory', { wasteItemId: b.inventoryItemId, wasteReason: 'Expired' })}
                  >
                    <Icon name="delete-outline" size={13} color={COLORS.dangerAccent} />
                    <Text style={styles.wasteBtnText}>Log Waste</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  titleBox: { marginHorizontal: isDesktopWeb ? 12 : 12, borderRadius: 8, padding: isDesktopWeb ? 14 : 13.5, marginBottom: isDesktopWeb ? 12 : 12, marginTop: isDesktopWeb ? 9 : 9 },
  title: { fontSize: isDesktopWeb ? 22 : 14, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 4 : 4.5 },
  subtitle: { fontSize: 13, color: COLORS.muted, lineHeight: 18 },
  filterBox: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 12 : 12, borderRadius: 8, padding: isDesktopWeb ? 12 : 12, marginBottom: isDesktopWeb ? 12 : 12 },
  filterLabel: { fontSize: 11, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginBottom: isDesktopWeb ? 7 : 7.5 },
  filterPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 6 : 6 },
  filterPill: { paddingHorizontal: isDesktopWeb ? 10 : 10.5, paddingVertical: isDesktopWeb ? 6 : 6, borderRadius: 16, backgroundColor: COLORS.background },
  filterPillActive: { backgroundColor: COLORS.button },
  filterPillText: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  filterPillTextActive: { color: '#FFFFFF' },
  searchWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardAlt, borderRadius: 8,
    marginHorizontal: isDesktopWeb ? 12 : 12, paddingHorizontal: isDesktopWeb ? 10 : 10.5, height: 46, marginBottom: isDesktopWeb ? 12 : 12,
  },
  searchInputWrap: { flex: 1, borderRadius: 8 },
  searchInput: { width: '100%', fontSize: 16, color: COLORS.heading },
  tableCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 12 : 12, borderRadius: 8, overflow: 'hidden' },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 38 : 37.5, gap: isDesktopWeb ? 6 : 6 },
  emptyText: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, textAlign: 'center', paddingHorizontal: isDesktopWeb ? 23 : 22.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7 : 7.5, paddingHorizontal: isDesktopWeb ? 10 : 10.5, paddingVertical: isDesktopWeb ? 9 : 9 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  itemName: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading },
  metaText: { fontSize: 11, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  rightBox: { alignItems: 'flex-end', gap: 4.5 },
  urgencyBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2.25 },
  urgencyExpired: { backgroundColor: COLORS.dangerBg },
  urgencySoon: { backgroundColor: COLORS.warningBg },
  urgencyText: { fontSize: 10, fontWeight: '700' },
  wasteBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  wasteBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.dangerAccent },
});
