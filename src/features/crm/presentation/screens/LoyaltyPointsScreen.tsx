import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useCustomers } from '../../../../core/api/hooks/useCustomers';
import { useRewards, useCreateReward, useUpdateReward, useDeleteReward } from '../../../../core/api/hooks/useRewards';
import { useLoyaltyMilestones, useCreateLoyaltyMilestone, useUpdateLoyaltyMilestone, useDeleteLoyaltyMilestone } from '../../../../core/api/hooks/useLoyaltyMilestones';
import { useSettings, useUpdateSettings } from '../../../../core/api/hooks/useSettings';
import { Reward } from '../../../../core/api/rewardsApi';
import { LoyaltyMilestone } from '../../../../core/api/loyaltyMilestonesApi';
import { RootState } from '../../../../core/store/rootReducer';
import { isOwnerOrManager } from '../../../../core/auth/permissions';
import { confirmAlert } from '../../../../shared/components/ConfirmDialogHost';
import { showToast } from '../../../../core/store/uiSlice';
import { getApiErrorMessage } from '../../../../core/network/api';
import { SkeletonGrid, SkeletonList } from '../../../../shared/components/atoms/Skeleton';
import { CloseButton } from '../../../../shared/components/atoms/CloseButton';

import { modalHeadingOverride } from '../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';

const ICON_CHOICES = ['coffee', 'food-croissant', 'tag-outline', 'gift-outline', 'cup-outline', 'food', 'star-outline', 'cookie'];

/** Earn rates offered as taps rather than a free number field — the rate is a pricing decision
 * an Owner makes once, and a typo in a text box here quietly changes what every future bill
 * gives away. 100 stays on the list because it is what cafes have been running on. */
const EARN_RATE_CHOICES = [0, 1, 2, 5, 10, 15, 20, 25, 50, 100];
/** Bill used for the worked example under the picker. Round, and big enough that even 1% earns. */
const EARN_RATE_EXAMPLE_BILL = 1000;

export const LoyaltyPointsScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const role = useSelector((s: RootState) => s.auth.user?.role);
  const canManage = isOwnerOrManager(role);

  const { data: customersData, isLoading } = useCustomers();
  const members = customersData?.items ?? [];
  const { data: rewards = [], isLoading: rewardsLoading } = useRewards();
  const { data: milestones = [], isLoading: milestonesLoading } = useLoyaltyMilestones();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const createReward = useCreateReward();
  const updateReward = useUpdateReward();
  const deleteReward = useDeleteReward();
  const createMilestone = useCreateLoyaltyMilestone();
  const updateMilestone = useUpdateLoyaltyMilestone();
  const deleteMilestone = useDeleteLoyaltyMilestone();

  const totalPool = members.reduce((sum, m) => sum + m.availablePoints, 0);
  const totalRedeemed = members.reduce((sum, m) => sum + (m.totalPoints - m.availablePoints), 0);
  const recentlyActive = [...members].sort((a, b) => new Date(b.lastVisitAt).getTime() - new Date(a.lastVisitAt).getTime()).slice(0, 6);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Reward | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftPoints, setDraftPoints] = useState('');
  const [draftIcon, setDraftIcon] = useState(ICON_CHOICES[0]);

  const [milestoneModalVisible, setMilestoneModalVisible] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<LoyaltyMilestone | null>(null);
  const [draftThreshold, setDraftThreshold] = useState('');
  const [draftDiscountPct, setDraftDiscountPct] = useState('');

  const setEarnRate = async (pct: number) => {
    try {
      await updateSettings.mutateAsync({ loyaltyEarnPct: pct });
      dispatch(showToast({
        message: pct === 0
          ? 'Points earning is off — bills no longer add to a guest’s balance.'
          : `Guests now earn ${pct}% of every bill back as points.`,
        icon: 'check-circle',
        tone: 'success',
      }));
    } catch (e) {
      dispatch(showToast({ message: getApiErrorMessage(e), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const openAdd = () => {
    setEditing(null);
    setDraftName('');
    setDraftPoints('');
    setDraftIcon(ICON_CHOICES[0]);
    setModalVisible(true);
  };

  const openEdit = (reward: Reward) => {
    setEditing(reward);
    setDraftName(reward.name);
    setDraftPoints(String(reward.pointsCost));
    setDraftIcon(reward.icon);
    setModalVisible(true);
  };

  const handleSave = async () => {
    const pointsCost = parseInt(draftPoints, 10);
    if (!draftName.trim()) {
      dispatch(showToast({ message: 'Enter a name for this reward.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (isNaN(pointsCost) || pointsCost <= 0) {
      dispatch(showToast({ message: 'Enter a points cost greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      if (editing) {
        await updateReward.mutateAsync({ id: editing.id, req: { name: draftName.trim(), pointsCost, icon: draftIcon } });
      } else {
        await createReward.mutateAsync({ name: draftName.trim(), pointsCost, icon: draftIcon });
      }
      setModalVisible(false);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save reward'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleDelete = (reward: Reward) => {
    confirmAlert('Remove Reward', `Remove "${reward.name}" from the catalog?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteReward.mutateAsync(reward.id);
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not remove reward'), icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  const openAddMilestone = () => {
    setEditingMilestone(null);
    setDraftThreshold('');
    setDraftDiscountPct('');
    setMilestoneModalVisible(true);
  };

  const openEditMilestone = (milestone: LoyaltyMilestone) => {
    setEditingMilestone(milestone);
    setDraftThreshold(String(milestone.thresholdPoints));
    setDraftDiscountPct(String(milestone.discountPct));
    setMilestoneModalVisible(true);
  };

  const handleSaveMilestone = async () => {
    const thresholdPoints = parseInt(draftThreshold, 10);
    const discountPct = parseFloat(draftDiscountPct);
    if (isNaN(thresholdPoints) || thresholdPoints <= 0) {
      dispatch(showToast({ message: 'Enter how many lifetime points this milestone needs.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (isNaN(discountPct) || discountPct <= 0 || discountPct > 100) {
      dispatch(showToast({ message: 'Enter a discount between 1 and 100 percent.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      if (editingMilestone) {
        await updateMilestone.mutateAsync({ id: editingMilestone.id, req: { thresholdPoints, discountPct } });
      } else {
        await createMilestone.mutateAsync({ thresholdPoints, discountPct });
      }
      setMilestoneModalVisible(false);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save milestone'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleDeleteMilestone = (milestone: LoyaltyMilestone) => {
    confirmAlert('Remove Milestone', `Remove the ${milestone.thresholdPoints}-point milestone?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMilestone.mutateAsync(milestone.id);
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not remove milestone'), icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="star-circle-outline" title="Points" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Icon name="star-circle-outline" size={26} color={COLORS.accent} />
          <Text style={styles.headerTitle}>Points</Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.poolCard}>
          <Text style={styles.poolLabel}>ACTIVE POINTS POOL</Text>
          <Text style={styles.poolValue}>{totalPool.toLocaleString()}</Text>
          <View style={styles.poolStatsRow}>
            <View style={styles.poolStat}>
              <Text style={styles.poolStatValue}>{members.length.toLocaleString()}</Text>
              <Text style={styles.poolStatLabel}>Members</Text>
            </View>
            <View style={styles.poolStatDivider} />
            <View style={styles.poolStat}>
              <Text style={styles.poolStatValue}>{totalRedeemed.toLocaleString()}</Text>
              <Text style={styles.poolStatLabel}>Redeemed (all-time)</Text>
            </View>
          </View>
        </View>

        {settings && (
          <View style={styles.earnCard}>
            <Text style={styles.sectionTitle}>Points Earn Rate</Text>
            {/* Stated in rupees, not just percent: a point is worth ₹1 at redemption, so the
                rate is money off a future bill and reads far more clearly as "₹50 back". */}
            <Text style={styles.earnHint}>
              {settings.loyaltyEarnPct === 0
                ? 'Off — bills are not adding anything to a guest’s balance.'
                : `A ₹${EARN_RATE_EXAMPLE_BILL.toLocaleString()} bill earns ${Math.floor(EARN_RATE_EXAMPLE_BILL * settings.loyaltyEarnPct / 100).toLocaleString()} points — ₹${Math.floor(EARN_RATE_EXAMPLE_BILL * settings.loyaltyEarnPct / 100).toLocaleString()} off a later visit.`}
            </Text>
            <View style={styles.earnChipRow}>
              {EARN_RATE_CHOICES.map((pct) => (
                <TouchableOpacity
                  key={pct}
                  disabled={!canManage || updateSettings.isPending}
                  style={[styles.earnChip, settings.loyaltyEarnPct === pct && styles.earnChipActive]}
                  onPress={() => setEarnRate(pct)}
                >
                  <Text style={[styles.earnChipText, settings.loyaltyEarnPct === pct && styles.earnChipTextActive]}>
                    {pct === 0 ? 'Off' : `${pct}%`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {!canManage && <Text style={styles.earnHint}>Only an Owner or Manager can change this.</Text>}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Milestone Rewards</Text>
          {canManage && (
            <TouchableOpacity style={styles.addBtn} onPress={openAddMilestone}>
              <Icon name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.earnHint, { paddingHorizontal: 16, marginBottom: 12 }]}>
          Cross a milestone's lifetime points and a guest's very next bill can claim its discount — see the Milestone Reward tile at checkout.
        </Text>

        {milestonesLoading && (
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <SkeletonList rows={2} />
          </View>
        )}

        {!milestonesLoading && milestones.length === 0 && (
          <Text style={styles.emptyText}>
            {canManage ? 'No milestones yet — tap Add to create your first one.' : 'No milestones set up yet.'}
          </Text>
        )}

        {milestones.length > 0 && (
          <View style={[styles.ledgerCard, { marginBottom: isDesktopWeb ? 18 : 18 }]}>
            {[...milestones].sort((a, b) => a.thresholdPoints - b.thresholdPoints).map((m, i, sorted) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.ledgerRow, i !== sorted.length - 1 && styles.ledgerDivider]}
                activeOpacity={canManage ? 0.7 : 1}
                onPress={() => canManage && openEditMilestone(m)}
              >
                <View style={styles.ledgerIcon}>
                  <Icon name="trophy-outline" size={16} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ledgerName}>{m.thresholdPoints.toLocaleString()} lifetime points</Text>
                  <Text style={styles.ledgerAction}>{m.isActive ? 'Active' : 'Disabled'}</Text>
                </View>
                <Text style={styles.ledgerPts}>{m.discountPct}% off</Text>
                {canManage && (
                  <TouchableOpacity
                    style={[styles.rewardDeleteBtn, { marginLeft: 9 }]}
                    onPress={() => handleDeleteMilestone(m)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="close" size={14} color={COLORS.muted} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Reward Catalog</Text>
          {canManage && (
            <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
              <Icon name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>

        {rewardsLoading && (
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <SkeletonGrid items={4} columns={2} />
          </View>
        )}

        {!rewardsLoading && rewards.length === 0 && (
          <Text style={styles.emptyText}>
            {canManage ? 'No rewards yet — tap Add to create your first one.' : 'No rewards set up yet.'}
          </Text>
        )}

        <View style={styles.rewardGrid}>
          {rewards.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={styles.rewardCard}
              activeOpacity={canManage ? 0.7 : 1}
              onPress={() => canManage && openEdit(r)}
            >
              <View style={styles.rewardCardTop}>
                <View style={styles.rewardIcon}>
                  <Icon name={r.icon} size={24} color={COLORS.heading} />
                </View>
                {canManage && (
                  <TouchableOpacity
                    style={styles.rewardDeleteBtn}
                    onPress={() => handleDelete(r)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="close" size={14} color={COLORS.muted} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.rewardName}>{r.name}</Text>
              <View style={styles.rewardCostRow}>
                <Icon name="star-circle" size={14} color={COLORS.vibeCrema} />
                <Text style={styles.rewardCost}>{r.pointsCost} pts</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { paddingHorizontal: 16, marginBottom: 12 }]}>Most Recently Active Members</Text>
        {isLoading && (
          <View style={{ paddingHorizontal: 16 }}>
            <SkeletonList rows={4} />
          </View>
        )}
        <View style={styles.ledgerCard}>
          {recentlyActive.map((m, i) => (
            <View key={m.id} style={[styles.ledgerRow, i !== recentlyActive.length - 1 && styles.ledgerDivider]}>
              <View style={styles.ledgerIcon}>
                <Icon name="star-circle-outline" size={16} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ledgerName}>{m.name}</Text>
                <Text style={styles.ledgerAction}>
                  {m.tier} tier · last visit {new Date(m.lastVisitAt).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.ledgerPts}>{m.availablePoints.toLocaleString()} pts</Text>
            </View>
          ))}
          {!isLoading && recentlyActive.length === 0 && (
            <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No customer activity yet.</Text>
          )}
        </View>
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { flex: 1, minWidth: 0 }, modalHeadingOverride(styles.modalTitle.fontSize)]}>{editing ? 'Edit Reward' : 'Add Reward'}</Text>
              <CloseButton onPress={() => setModalVisible(false)} size={22} />
            </View>

            <Text style={styles.fieldLabel}>Name</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. Free Cappuccino"
                placeholderTextColor={COLORS.placeholder}
                value={draftName}
                onChangeText={setDraftName}
              />
            </View>

            <Text style={styles.fieldLabel}>Points cost</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. 500"
                placeholderTextColor={COLORS.placeholder}
                value={draftPoints}
                onChangeText={(t) => setDraftPoints(t.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
              />
            </View>

            <Text style={styles.fieldLabel}>Icon</Text>
            <View style={styles.iconRow}>
              {ICON_CHOICES.map((icon) => (
                <TouchableOpacity
                  key={icon}
                  style={[styles.iconChip, draftIcon === icon && styles.iconChipActive]}
                  onPress={() => setDraftIcon(icon)}
                >
                  <Icon name={icon} size={20} color={draftIcon === icon ? '#FFFFFF' : COLORS.heading} />
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSave}
                disabled={createReward.isPending || updateReward.isPending}
              >
                {createReward.isPending || updateReward.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>{editing ? 'Save' : 'Add'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={milestoneModalVisible} transparent animationType="fade" onRequestClose={() => setMilestoneModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>{editingMilestone ? 'Edit Milestone' : 'Add Milestone'}</Text>

            <Text style={styles.fieldLabel}>Lifetime points needed</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. 1000"
                placeholderTextColor={COLORS.placeholder}
                value={draftThreshold}
                onChangeText={(t) => setDraftThreshold(t.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
              />
            </View>

            <Text style={styles.fieldLabel}>Discount on the next bill (%)</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. 10"
                placeholderTextColor={COLORS.placeholder}
                value={draftDiscountPct}
                onChangeText={(t) => setDraftDiscountPct(t.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setMilestoneModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveMilestone}
                disabled={createMilestone.isPending || updateMilestone.isPending}
              >
                {createMilestone.isPending || updateMilestone.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>{editingMilestone ? 'Save' : 'Add'}</Text>
                )}
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
  avatar: { width: 32, height: 32, borderRadius: 16 },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  poolCard: {
    backgroundColor: COLORS.button,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 15 : 15,
    marginBottom: isDesktopWeb ? 15 : 15,
  },
  poolLabel: { fontSize: 11, fontWeight: '700', color: '#E8C7A0', letterSpacing: 0.5, marginBottom: isDesktopWeb ? 6 : 4.5 },
  poolValue: { fontSize: isDesktopWeb ? 36 : 12, fontWeight: 'bold', color: '#FFFFFF', marginBottom: isDesktopWeb ? 14 : 13.5 },
  poolStatsRow: { flexDirection: 'row', alignItems: 'center' },
  poolStat: { flex: 1, alignItems: 'center' },
  poolStatValue: { fontSize: isDesktopWeb ? 17 : 12, fontWeight: 'bold', color: '#FFFFFF' },
  poolStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: isDesktopWeb ? 2 : 1.5 },
  poolStatDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.15)' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 10 : 10.5,
  },
  sectionTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  earnCard: {
    backgroundColor: COLORS.card,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 8,
    padding: 15,
    gap: 8,
  },
  earnHint: { fontSize: isDesktopWeb ? 13 : 11.5, color: COLORS.muted, lineHeight: isDesktopWeb ? 18 : 16 },
  earnChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  // Sized to content and wrapped rather than sharing the row width equally: ten chips split
  // evenly on a phone leaves each too narrow to read, let alone tap.
  earnChip: {
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: COLORS.cardAlt,
  },
  earnChipActive: { backgroundColor: COLORS.button },
  earnChipText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  earnChipTextActive: { color: '#FFFFFF' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 5 : 3.75,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingHorizontal: isDesktopWeb ? 11 : 10.5,
    paddingVertical: isDesktopWeb ? 8 : 6,
  },
  addBtnText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: '#FFFFFF' },
  emptyText: { paddingHorizontal: isDesktopWeb ? 12 : 12, marginBottom: isDesktopWeb ? 15 : 15, color: COLORS.muted, fontSize: isDesktopWeb ? 13 : 12 },
  rewardGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: isDesktopWeb ? 12 : 12, gap: isDesktopWeb ? 9 : 9, marginBottom: isDesktopWeb ? 18 : 18 },
  rewardCard: { width: '47.5%', flexGrow: 1, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 12 : 12 },
  rewardCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rewardIcon: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: COLORS.aiCardBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isDesktopWeb ? 9 : 9,
  },
  rewardDeleteBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardName: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '700', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 4.5 },
  rewardCostRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4 : 3, marginBottom: isDesktopWeb ? 4 : 3 },
  rewardCost: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: COLORS.accent },
  ledgerCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 12 : 12, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 12 : 12 },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: isDesktopWeb ? 11 : 10.5, gap: isDesktopWeb ? 9 : 9 },
  ledgerDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  ledgerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerName: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: COLORS.heading },
  ledgerAction: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  ledgerPts: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '700', color: COLORS.accent },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isDesktopWeb ? 18 : 18,
  },
  // Title on the left, the X hard against the right edge — same header shape every
  // other popup in the app uses (see CloseButton).
  modalHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  modalSheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: isDesktopWeb ? 12 : 12,
    overflow: 'hidden',
  },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: isDesktopWeb ? 4 : 3, marginTop: isDesktopWeb ? 6 : 4.5 },
  fieldInput: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 34,
    fontSize: 12,
    color: COLORS.heading,
  },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  iconChip: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChipActive: { backgroundColor: COLORS.button },
  modalActions: { flexDirection: 'row', gap: 6, marginTop: 9 },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 6,
    paddingVertical: 7.5,
  },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: {
    flex: 1.3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: 7.5,
  },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
