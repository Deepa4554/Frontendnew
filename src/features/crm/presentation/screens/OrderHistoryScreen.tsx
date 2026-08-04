import React from 'react';
import { View, StyleSheet, FlatList, Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useCustomer } from '../../../../core/api/hooks/useCustomers';
import { Visit } from '../../../../core/api/customersApi';
import { SkeletonList } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';

export const OrderHistoryScreen = ({ route, navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const customerId: number | undefined = route?.params?.customerId;
  const { data: customer, isLoading, isError, refetch } = useCustomer(customerId ?? null);
  const orders = customer?.recentVisits ?? [];

  const renderOrder = ({ item }: { item: Visit }) => (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.invoice}>{item.orderNumber}</Text>
        <View style={styles.ptsBadge}>
          <Text style={styles.ptsText}>+{item.pointsEarned} pts</Text>
        </View>
      </View>
      <Text style={styles.date}>{new Date(item.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
      <Text style={styles.items} numberOfLines={2}>{item.items.join('  ·  ')}</Text>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Order Total</Text>
        <Text style={styles.total}>₹{item.orderTotal.toFixed(2)}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="history" title="Order History" onBack={() => navigation.goBack()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="history" size={22} color={COLORS.accent} />
          <Text style={styles.title} numberOfLines={1}>
            Order History<Text style={styles.titleCount}> · {orders.length} Orders</Text>
          </Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      {isError && !customer ? (
        <ErrorState
          title="Couldn't load order history"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <View style={{ padding: 16 }}>
          <SkeletonList rows={6} avatarShape="square" />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => String(o.orderId)}
          renderItem={renderOrder}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Icon name="receipt" size={30} color={COLORS.muted} />
              <Text style={styles.emptyText}>No orders yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 9 : 9, gap: isDesktopWeb ? 7.5 : 7.5 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  titleCount: { fontSize: 14, fontWeight: '400', color: COLORS.muted },
  list: { padding: isDesktopWeb ? 12 : 12, paddingTop: isDesktopWeb ? 3 : 3 },
  card: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 10.5 : 10.5,
    marginBottom: isDesktopWeb ? 7.5 : 7.5,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 3 : 3 },
  invoice: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '800', color: COLORS.heading },
  ptsBadge: { backgroundColor: COLORS.aiCardBg, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 6 : 6, paddingVertical: isDesktopWeb ? 2.25 : 2.25 },
  ptsText: { color: COLORS.accent, fontWeight: '700', fontSize: 11 },
  date: { fontSize: 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 6 : 6 },
  items: { color: COLORS.heading, opacity: 0.75, fontSize: isDesktopWeb ? 13 : 12, marginBottom: isDesktopWeb ? 9 : 9, lineHeight: 18 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.divider, paddingTop: isDesktopWeb ? 7.5 : 7.5 },
  totalLabel: { color: COLORS.muted, fontSize: 12 },
  total: { fontSize: 12, fontWeight: '800', color: COLORS.accent },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 45, gap: 7.5 },
  emptyText: { fontSize: 12, color: COLORS.muted },
});
