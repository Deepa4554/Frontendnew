import React from 'react';
import { View, StyleSheet, FlatList, Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useCustomer } from '../../../../core/api/hooks/useCustomers';
import { FavoriteItem } from '../../../../core/api/customersApi';
import { SkeletonList } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';

const RANK_MEDAL = ['🥇', '🥈', '🥉'];

export const FavouritesScreen = ({ route, navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const customerId: number | undefined = route?.params?.customerId;
  const { data: customer, isLoading, isError, refetch } = useCustomer(customerId ?? null);
  const items = customer?.favoriteItems ?? [];

  const renderItem = ({ item, index }: { item: FavoriteItem; index: number }) => (
    <View style={styles.card}>
      <View style={styles.rank}>
        <Text style={styles.rankText}>{index < 3 ? RANK_MEDAL[index] : `${index + 1}`}</Text>
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.itemMeta}>Ordered {item.orderCount} times</Text>
      </View>
      <Text style={styles.price}>₹{item.price.toFixed(2)}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="heart" title="Favourites" onBack={() => navigation.goBack()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="heart" size={22} color={COLORS.accent} />
          <Text style={styles.title} numberOfLines={1}>
            Favourites{customer?.summary.name ? <Text style={styles.titleName}> · {customer.summary.name}</Text> : ''}
          </Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      {isError && !customer ? (
        <ErrorState
          title="Couldn't load favourites"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <View style={{ padding: 16 }}>
          <SkeletonList rows={6} avatarShape="circle" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => String(i.menuItemId)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Icon name="heart-outline" size={30} color={COLORS.muted} />
              <Text style={styles.emptyText}>No favourites yet</Text>
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
  titleName: { fontSize: 14, fontWeight: '400', color: COLORS.muted },
  list: { padding: isDesktopWeb ? 12 : 12, paddingTop: isDesktopWeb ? 3 : 3 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 9 : 9,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 9 : 9,
    marginBottom: isDesktopWeb ? 7.5 : 7.5,
  },
  rank: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  rankText: { fontSize: isDesktopWeb ? 18 : 12, fontWeight: '800', color: COLORS.heading },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '700', color: COLORS.heading },
  itemMeta: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 1.5 : 1.5 },
  price: { fontSize: 12, fontWeight: '800', color: COLORS.accent },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 45, gap: 7.5 },
  emptyText: { fontSize: 12, color: COLORS.muted },
});
