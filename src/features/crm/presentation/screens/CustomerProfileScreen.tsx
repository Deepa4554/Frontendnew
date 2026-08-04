import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal, TextInput } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { InitialsAvatar } from '../../../../shared/components/InitialsAvatar';
import { useCustomer, useUpdateCustomer } from '../../../../core/api/hooks/useCustomers';
import { getApiErrorMessage } from '../../../../core/network/api';
import { showToast } from '../../../../core/store/uiSlice';
import { SkeletonBox, SkeletonCircle } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';

import { modalHeadingOverride } from '../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';

// Same thresholds the backend uses to compute tier from totalPoints — mirrored
// here purely to render a "progress to next tier" bar from real point totals,
// not to invent new numbers.
const TIER_THRESHOLDS = [
  { tier: 'BRONZE', next: 300 },
  { tier: 'SILVER', next: 1000 },
  { tier: 'GOLD', next: 2000 },
  { tier: 'PLATINUM', next: null as number | null },
];

export const CustomerProfileScreen = ({ navigation, route }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const customerId: number | undefined = route?.params?.customerId;
  const { data: customer, isLoading, isError, refetch } = useCustomer(customerId ?? null);
  const updateCustomer = useUpdateCustomer();

  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');

  if (!customerId) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Icon name="account-question-outline" size={40} color={COLORS.muted} />
        <Text style={{ color: COLORS.muted, marginTop: 12 }}>Open a customer from the Directory to see their profile.</Text>
      </View>
    );
  }

  if (isError && !customer) {
    return (
      <View style={styles.container}>
        <ErrorState
          title="Couldn't load customer profile"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  if (isLoading || !customer) {
    return (
      <View style={styles.container}>
        <DesktopPageHeader icon="account-circle-outline" title="Customer Profile" onBack={() => navigation.goBack()} />
        {!isDesktopWeb && (
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
              <Icon name="arrow-left" size={22} color={COLORS.heading} />
            </TouchableOpacity>
            <Text style={styles.brandTitle}>Customer Profile</Text>
          </View>
        )}

        {/* Mirrors the real layout below section-for-section (same card containers,
            same row shapes) so nothing visibly jumps or resizes once data arrives —
            a generic banner+centered-avatar skeleton doesn't match this compact,
            left-aligned hero row at all. */}
        <View style={{ paddingBottom: 40 }}>
          <View style={styles.heroCard}>
            <SkeletonCircle size={48} />
            <View style={styles.heroInfo}>
              <SkeletonBox width="60%" height={15} />
              <SkeletonBox width="45%" height={10} style={{ marginTop: 6 }} />
            </View>
            <SkeletonBox width={70} height={30} radius={16} />
          </View>

          <View style={styles.rewardCard}>
            <View style={styles.rewardTopRow}>
              <View>
                <SkeletonBox width={70} height={10} />
                <SkeletonBox width={90} height={16} style={{ marginTop: 6 }} />
              </View>
              <SkeletonBox width={36} height={18} />
            </View>
            <SkeletonBox width="100%" height={6} radius={3} style={{ marginTop: 12, marginBottom: 6 }} />
            <SkeletonBox width="70%" height={11} />
          </View>

          <View style={styles.bentoRow}>
            <View style={styles.bentoCard}>
              <SkeletonBox width="50%" height={10} style={{ marginBottom: 8 }} />
              <SkeletonBox width="80%" height={14} style={{ marginBottom: 6 }} />
              <SkeletonBox width="40%" height={11} />
            </View>
            <View style={styles.bentoCard}>
              <SkeletonBox width="50%" height={10} style={{ marginBottom: 8 }} />
              <SkeletonBox width="80%" height={14} style={{ marginBottom: 6 }} />
              <SkeletonBox width="40%" height={11} />
            </View>
          </View>

          <View style={styles.quickLinksRow}>
            <SkeletonBox width="100%" height={48} radius={14} style={{ flex: 1 }} />
            <SkeletonBox width="100%" height={48} radius={14} style={{ flex: 1 }} />
          </View>
          <View style={styles.quickLinksRow}>
            <SkeletonBox width="100%" height={48} radius={14} style={{ flex: 1 }} />
            <SkeletonBox width="100%" height={48} radius={14} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    );
  }

  const { summary } = customer;
  const thresholdIdx = TIER_THRESHOLDS.findIndex((t) => t.tier === summary.tier);
  const nextThreshold = TIER_THRESHOLDS[thresholdIdx]?.next;
  const prevThreshold = thresholdIdx > 0 ? TIER_THRESHOLDS[thresholdIdx - 1].next ?? 0 : 0;
  const rewardProgress = nextThreshold
    ? Math.min(1, (summary.totalPoints - prevThreshold) / (nextThreshold - prevThreshold))
    : 1;
  const pointsToNext = nextThreshold ? Math.max(0, nextThreshold - summary.totalPoints) : 0;
  const topFavorite = customer.favoriteItems[0];

  const openEdit = () => {
    setEditName(summary.name);
    setEditNotes(customer.notes ?? '');
    setEditVisible(true);
  };

  const saveEdit = async () => {
    if (!editName.trim()) {
      dispatch(showToast({ message: 'Name cannot be blank.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await updateCustomer.mutateAsync({ id: customer.summary.id, req: { name: editName.trim(), notes: editNotes } });
      setEditVisible(false);
      dispatch(showToast({ message: 'Profile updated.', icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="account-circle-outline" title="Customer Profile" onBack={() => navigation.goBack()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.brandTitle}>Customer Profile</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.heroCard}>
          <View style={styles.photoWrap}>
            {summary.profilePhotoUrl ? (
              <Image source={{ uri: summary.profilePhotoUrl }} style={styles.photo} />
            ) : (
              <InitialsAvatar name={summary.name} size={48} style={styles.photo} />
            )}
            <View style={styles.verifiedBadge}>
              <Icon name="check-decagram" size={11} color="#FFFFFF" />
            </View>
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.name} numberOfLines={1}>{summary.name}</Text>
            <Text style={styles.memberSince}>
              MEMBER SINCE {new Date(summary.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }).toUpperCase()}
            </Text>
          </View>
          <View style={styles.pointsBadge}>
            <Icon name="star-circle" size={14} color={COLORS.vibeCrema} />
            <Text style={styles.pointsBadgeValue}>{summary.totalPoints.toLocaleString()}</Text>
            <Text style={styles.pointsBadgeUnit}>pts</Text>
          </View>
        </View>

        <View style={styles.rewardCard}>
          <View style={styles.rewardTopRow}>
            <View>
              <Text style={styles.rewardLabel}>{summary.tier} TIER</Text>
              <Text style={styles.rewardName}>{nextThreshold ? TIER_THRESHOLDS[thresholdIdx + 1].tier : 'Top Tier'}</Text>
            </View>
            <Text style={styles.rewardPct}>
              {Math.round(rewardProgress * 100)}
              <Text style={styles.rewardPctUnit}>%</Text>
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${rewardProgress * 100}%` }]} />
          </View>
          <Text style={styles.rewardHint}>
            {nextThreshold ? `${pointsToNext} points to reach ${TIER_THRESHOLDS[thresholdIdx + 1].tier}.` : 'Highest tier reached!'}
          </Text>
        </View>

        <View style={styles.bentoRow}>
          <View style={styles.bentoCard}>
            <View style={styles.bentoLabelRow}>
              <Icon name="heart-outline" size={12} color={COLORS.heading} />
              <Text style={styles.bentoLabel}>FAVORITE</Text>
            </View>
            <Text style={styles.bentoValue} numberOfLines={1}>
              {topFavorite?.name ?? 'No orders yet'}
            </Text>
            <Text style={styles.bentoSub}>{topFavorite ? `Ordered ${topFavorite.orderCount}×` : '—'}</Text>
          </View>
          <View style={styles.bentoCard}>
            <View style={styles.bentoLabelRow}>
              <Icon name="cash-multiple" size={12} color={COLORS.heading} />
              <Text style={styles.bentoLabel}>LIFETIME SPEND</Text>
            </View>
            <Text style={styles.bentoValue}>₹{summary.totalSpent.toFixed(2)}</Text>
            <Text style={styles.bentoSub}>{summary.visitCount} visits total · {summary.visitsLast30Days} this month</Text>
          </View>
        </View>

        <View style={styles.quickLinksRow}>
          <TouchableOpacity style={styles.quickLink} onPress={() => navigation.navigate('Coupons', { customerId })}>
            <Icon name="ticket-percent-outline" size={20} color={COLORS.heading} />
            <Text style={styles.quickLinkText}>Coupons ({customer.coupons.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickLink} onPress={() => navigation.navigate('GiftCards', { customerId })}>
            <Icon name="gift-outline" size={20} color={COLORS.heading} />
            <Text style={styles.quickLinkText}>Gift Cards ({customer.giftCards.length})</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.quickLinksRow}>
          <TouchableOpacity style={styles.quickLink} onPress={() => navigation.navigate('Favourites', { customerId })}>
            <Icon name="heart-outline" size={20} color={COLORS.heading} />
            <Text style={styles.quickLinkText}>Favourites</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickLink} onPress={() => navigation.navigate('OrderHistory', { customerId })}>
            <Icon name="history" size={20} color={COLORS.heading} />
            <Text style={styles.quickLinkText}>Order History</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.newOrderBtn} onPress={() => navigation.navigate('POS')}>
            <Icon name="cart-outline" size={16} color="#FFFFFF" />
            <Text style={styles.newOrderText}>New Order</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editBtn} onPress={openEdit}>
            <Icon name="pencil-outline" size={16} color={COLORS.heading} />
            <Text style={styles.editText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <View style={{ borderRadius: 12 }}>
              <TextInput style={styles.modalInput} value={editName} onChangeText={setEditName} placeholder="Name" placeholderTextColor={COLORS.placeholder} />
            </View>
            <View style={{ borderRadius: 12 }}>
              <TextInput
                style={[styles.modalInput, { marginTop: 6, height: 80 }]}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Notes"
                placeholderTextColor={COLORS.placeholder}
                multiline
              />
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditVisible(false)}>
                <Text style={styles.editText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.newOrderBtn} onPress={saveEdit} disabled={updateCustomer.isPending}>
                {updateCustomer.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.newOrderText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingTop: isDesktopWeb ? 9 : 9,
    paddingBottom: isDesktopWeb ? 9 : 9,
    gap: isDesktopWeb ? 7 : 7.5,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  brandTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.heading },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 9 : 9,
    gap: isDesktopWeb ? 7 : 7.5,
    marginBottom: isDesktopWeb ? 9 : 9,
  },
  photoWrap: { position: 'relative' },
  photo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: COLORS.vibeCrema,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.button,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.cardAlt,
  },
  heroInfo: { flex: 1, minWidth: 0 },
  name: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: '700', color: COLORS.heading },
  memberSince: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginTop: isDesktopWeb ? 2 : 1.5 },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4 : 3,
    backgroundColor: COLORS.button,
    borderRadius: 16,
    paddingHorizontal: isDesktopWeb ? 9 : 9,
    paddingVertical: isDesktopWeb ? 6 : 6,
  },
  pointsBadgeValue: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: 'bold', color: '#FFFFFF' },
  pointsBadgeUnit: { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginLeft: isDesktopWeb ? 1 : 0.75 },
  rewardCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 7 : 7.5,
    marginBottom: isDesktopWeb ? 9 : 9,
  },
  rewardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rewardLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginBottom: isDesktopWeb ? 2 : 1.5 },
  rewardName: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: 'bold', color: COLORS.accent },
  rewardPct: { fontSize: isDesktopWeb ? 18 : 12, fontWeight: 'bold', color: COLORS.heading },
  rewardPctUnit: { fontSize: 11, color: COLORS.muted },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.background,
    marginTop: isDesktopWeb ? 6 : 6,
    marginBottom: isDesktopWeb ? 5 : 4.5,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#6B4A2E' },
  rewardHint: { fontSize: 11, color: COLORS.muted },
  bentoRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 12 : 12, gap: isDesktopWeb ? 7 : 7.5, marginBottom: isDesktopWeb ? 9 : 9 },
  bentoCard: { flex: 1, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 8 : 7.5, minHeight: 70 },
  bentoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 5 : 3.75, marginBottom: isDesktopWeb ? 6 : 4.5 },
  bentoLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 },
  bentoValue: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 3 : 2.25 },
  bentoSub: { fontSize: 11, color: COLORS.muted, lineHeight: 14 },
  quickLinksRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 12 : 12, gap: isDesktopWeb ? 9 : 9, marginBottom: isDesktopWeb ? 9 : 9 },
  quickLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingVertical: isDesktopWeb ? 11 : 10.5,
    paddingHorizontal: isDesktopWeb ? 11 : 10.5,
  },
  quickLinkText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading, flexShrink: 1 },
  actionRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 12 : 12, gap: isDesktopWeb ? 9 : 9, marginTop: isDesktopWeb ? 6 : 6 },
  newOrderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 11 : 11.25,
  },
  newOrderText: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: '#FFFFFF' },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 6,
    borderWidth: 1.5,
    borderColor: COLORS.heading,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 11 : 11.25,
  },
  editText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalSheet: {
    width: '100%',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 6,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.heading,
    marginBottom: 6,
    flexShrink: 1,
  },
  modalInput: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: isDesktopWeb ? 9 : 8,
    paddingHorizontal: isDesktopWeb ? 7.5 : 10,
    height: 34,
    fontSize: isDesktopWeb ? 16 : 12,
    color: COLORS.heading,
  },
});
