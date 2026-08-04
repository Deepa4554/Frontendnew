import React from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useSubscription } from '../../../../../core/api/hooks/useSubscription';
import { SubscriptionTier } from '../../../../../core/api/subscriptionApi';
import { showToast } from '../../../../../core/store/uiSlice';
import { SkeletonStatRow, SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

interface PlanDef {
  key: SubscriptionTier;
  name: string;
  price: string;
  originalPrice?: string;
  features: string[];
  highlight?: boolean;
}

// Orders/Branches/Staff are unlimited on every paid plan (see ManagementDtos.PlanLimits) —
// listed first on every card below since it's the headline sell across all three tiers now.
const PLANS: PlanDef[] = [
  {
    key: 'STARTER',
    name: 'Basic',
    price: '₹499/mo',
    originalPrice: '₹699/mo',
    features: ['Unlimited Orders', 'Unlimited Branches', 'Unlimited Staff Accounts'],
  },
  {
    key: 'PROFESSIONAL',
    name: 'Plus',
    price: '₹799/mo',
    originalPrice: '₹999/mo',
    features: ['Unlimited Orders', 'Unlimited Branches', 'Unlimited Staff Accounts', 'Advanced Analytics', 'AI Operations Assistant'],
    highlight: true,
  },
  { key: 'ENTERPRISE', name: 'Enterprise', price: 'Custom Pricing', features: ['Unlimited Orders', 'Unlimited Branches & Staff', 'Custom White Labeling'] },
];

// SubscriptionDto.MaxBranches (etc.) comes back as int.MaxValue for every unlimited
// tier's cap — treat anything past 1 billion as "no real limit" rather than matching
// int.MaxValue exactly, so this doesn't silently break if the backend ever swaps in a
// different large sentinel.
const UNLIMITED_THRESHOLD = 1_000_000_000;

export const SubscriptionScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { data: subscription, isLoading, isError, refetch } = useSubscription();

  const header = (
    <>
      <DesktopPageHeader icon="cloud-check-outline" title="Subscription" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="cloud-check" size={22} color={COLORS.accent} />
          <Text style={styles.headerTitle}>Subscription</Text>
          <View style={{ flex: 1 }} />
        </View>
      )}
    </>
  );

  // Plan changes aren't self-service: there's no payment gateway wired up yet, so
  // letting an Owner flip their own plan would let them grant themselves a free
  // upgrade/renewal. Upgrading/renewing goes through your PrabandhOS provider, who
  // applies it after payment is confirmed.
  const handleSelectPlan = (plan: SubscriptionTier) => {
    if (!subscription || plan === subscription.plan) return;
    dispatch(showToast({
      message: 'Contact your PrabandhOS provider to upgrade or renew — they’ll apply it once payment is confirmed.',
      icon: 'information-outline',
      tone: 'info',
    }));
  };

  if (isError && !subscription) {
    return (
      <View style={styles.container}>
        {header}
        <ErrorState
          title="Couldn't load subscription"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  if (isLoading || !subscription) {
    return (
      <View style={styles.container}>
        {header}
        <View style={{ padding: 16 }}>
          <SkeletonStatRow count={3} style={{ marginBottom: 20 }} />
          <SkeletonList rows={3} />
        </View>
      </View>
    );
  }

  const expiresAt = subscription.planExpiresAt ? new Date(subscription.planExpiresAt) : null;
  const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86400000) : null;
  const isExpired = daysLeft !== null && daysLeft < 0;
  const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;

  return (
    <View style={styles.container}>
      {header}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 60 }}>
        <View style={styles.usageCard}>
          <View style={styles.planTopRow}>
            <View>
              <Text style={styles.usageLabel}>CURRENT PLAN</Text>
              <Text style={styles.usagePlanName}>{subscription.plan}</Text>
            </View>
            {expiresAt && (
              <View style={[styles.expiryBadge, (isExpired || isExpiringSoon) && styles.expiryBadgeWarning]}>
                <Icon name="calendar-clock-outline" size={13} color={isExpired || isExpiringSoon ? COLORS.dangerAccent : COLORS.muted} />
                <Text style={[styles.expiryBadgeText, (isExpired || isExpiringSoon) && styles.expiryBadgeTextWarning]}>
                  {isExpired ? `Expired ${expiresAt.toLocaleDateString()}` : `Renews ${expiresAt.toLocaleDateString()}`}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.usageStatsRow}>
            <View style={styles.usageStat}>
              <Text style={styles.usageStatLabel}>Max Branches</Text>
              <Text style={styles.usageStatValue}>
                {subscription.maxBranches >= UNLIMITED_THRESHOLD ? 'Unlimited' : subscription.maxBranches}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Available Plans</Text>

        {PLANS.map((plan) => {
          const active = subscription.plan === plan.key;
          return (
            <View key={plan.key} style={[styles.planCard, active && styles.planCardActive, plan.highlight && !active && styles.planCardHighlight]}>
              {plan.highlight && !active && (
                <View style={styles.popularBadge}>
                  <Icon name="star-four-points" size={11} color="#FFFFFF" />
                  <Text style={styles.popularBadgeText}>Most Popular</Text>
                </View>
              )}
              <View style={styles.planHeaderRow}>
                <Text style={styles.planName}>{plan.name}</Text>
                <View style={styles.priceCol}>
                  {!!plan.originalPrice && (
                    <Text style={[styles.planOriginalPrice, active && styles.planOriginalPriceActive]}>
                      {plan.originalPrice}
                    </Text>
                  )}
                  <Text style={styles.planPrice}>{plan.price}</Text>
                </View>
              </View>
              {plan.features.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Icon name="check-circle" size={14} color={active ? '#FFFFFF' : COLORS.success} />
                  <Text style={[styles.featureText, active && styles.featureTextActive]}>{f}</Text>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.planBtn, active && styles.planBtnActive]}
                disabled={active}
                onPress={() => handleSelectPlan(plan.key)}
              >
                <Text style={[styles.planBtnText, active && styles.planBtnTextActive]}>
                  {active ? 'Current Plan' : 'Contact to Upgrade'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 9 : 9, gap: isDesktopWeb ? 7 : 7.5 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  usageCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 15 : 15,
    marginBottom: isDesktopWeb ? 17 : 18,
  },
  usageLabel: { fontSize: 11, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 },
  usagePlanName: { fontSize: isDesktopWeb ? 26 : 12, fontWeight: '800', color: COLORS.heading, marginTop: isDesktopWeb ? 3 : 3 },
  planTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isDesktopWeb ? 12 : 12 },
  expiryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4 : 3.75,
    backgroundColor: COLORS.background, borderRadius: 10, paddingHorizontal: isDesktopWeb ? 8 : 7.5, paddingVertical: isDesktopWeb ? 5 : 4.5,
  },
  expiryBadgeWarning: { backgroundColor: COLORS.dangerBg },
  expiryBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.muted },
  expiryBadgeTextWarning: { color: COLORS.dangerAccent },
  usageStatsRow: { flexDirection: 'row', gap: isDesktopWeb ? 18 : 18 },
  usageStat: {},
  usageStatLabel: { fontSize: 11, color: COLORS.muted, marginBottom: isDesktopWeb ? 2 : 1.5 },
  usageStatValue: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: '700', color: COLORS.heading },
  sectionTitle: { fontSize: isDesktopWeb ? 18 : 14, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 9 : 9 },
  planCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 15 : 15,
    marginBottom: isDesktopWeb ? 12 : 12,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  planCardActive: { backgroundColor: COLORS.button, borderColor: COLORS.button },
  planCardHighlight: { borderColor: COLORS.accent },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 3 : 3,
    backgroundColor: COLORS.accent,
    paddingHorizontal: isDesktopWeb ? 8 : 7.5,
    paddingVertical: isDesktopWeb ? 3 : 3,
    borderRadius: 10,
  },
  popularBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  planHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 11 : 10.5 },
  planName: { fontSize: isDesktopWeb ? 20 : 12, fontWeight: '800', color: COLORS.heading },
  priceCol: { alignItems: 'flex-end' },
  planOriginalPrice: { fontSize: 11, fontWeight: '600', color: COLORS.muted, textDecorationLine: 'line-through' },
  planOriginalPriceActive: { color: 'rgba(255,255,255,0.7)' },
  planPrice: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '700', color: COLORS.accent },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 6, marginBottom: isDesktopWeb ? 6 : 6 },
  featureText: { fontSize: 12, color: COLORS.heading },
  featureTextActive: { color: '#FFFFFF' },
  planBtn: {
    marginTop: 6,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: 9.75,
    alignItems: 'center',
  },
  planBtnActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  planBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  planBtnTextActive: { color: '#FFFFFF' },
});
