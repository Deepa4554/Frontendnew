import React from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useSubscription } from '../../../../../core/api/hooks/useSubscription';
import { useSubscriptionCheckout } from '../../../../../core/api/hooks/useSubscriptionCheckout';
import { cycleLabel, SubscriptionTier } from '../../../../../core/api/subscriptionApi';
import { showToast } from '../../../../../core/store/uiSlice';
import { SkeletonStatRow, SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

import type { BillingCycle } from '../../../../../core/api/subscriptionApi';

interface PlanDef {
  key: SubscriptionTier;
  name: string;
  icon: string;
  gradient: [string, string];
  monthlyPrice: string;
  monthlyOriginalPrice?: string;
  // Omitted on Enterprise — it stays "Custom Pricing" on both cycles.
  yearlyPrice?: string;
  yearlyOriginalPrice?: string;
  features: string[];
  highlight?: boolean;
}

// Orders/Branches/Staff are unlimited on every paid plan (see ManagementDtos.PlanLimits) —
// listed first on every card below since it's the headline sell across all three tiers now.
// Yearly prices are ~2 months free against the monthly rate (499*12=5988 -> 4999, 799*12=9588 -> 7999).
const GRID_PLANS: PlanDef[] = [
  {
    key: 'STARTER',
    name: 'Basic',
    icon: 'rocket-launch-outline',
    gradient: ['#F3DFC9', '#C5652E'],
    monthlyPrice: '₹499/mo',
    monthlyOriginalPrice: '₹699/mo',
    yearlyPrice: '₹4,999/yr',
    yearlyOriginalPrice: '₹5,988/yr',
    features: ['Unlimited Orders', 'Unlimited Branches', 'Unlimited Staff Accounts'],
  },
  {
    key: 'PROFESSIONAL',
    name: 'Plus',
    icon: 'crown-outline',
    gradient: ['#4A2C1D', '#2B1810'],
    monthlyPrice: '₹799/mo',
    monthlyOriginalPrice: '₹999/mo',
    yearlyPrice: '₹7,999/yr',
    yearlyOriginalPrice: '₹9,588/yr',
    features: ['Unlimited Orders', 'Unlimited Branches', 'Unlimited Staff Accounts', 'Advanced Analytics', 'AI Operations Assistant'],
    highlight: true,
  },
];

const ENTERPRISE_PLAN = {
  key: 'ENTERPRISE' as SubscriptionTier,
  name: 'Enterprise',
  icon: 'office-building-outline',
  features: ['Unlimited Orders', 'Unlimited Branches & Staff', 'Custom White Labelling'],
};

// The card names (Basic/Plus/Enterprise) are the storefront branding — the current-plan
// banner used to print the raw SubscriptionTier ("PROFESSIONAL") instead, which didn't
// match any card on the page. This keeps that banner in sync with GRID_PLANS/ENTERPRISE_PLAN.
const TIER_LABEL: Record<SubscriptionTier, string> = {
  FREETRIAL: 'Free Trial',
  STARTER: 'Basic',
  PROFESSIONAL: 'Plus',
  ENTERPRISE: 'Enterprise',
};

// SubscriptionDto.MaxBranches (etc.) comes back as int.MaxValue for every unlimited
// tier's cap — treat anything past 1 billion as "no real limit" rather than matching
// int.MaxValue exactly, so this doesn't silently break if the backend ever swaps in a
// different large sentinel.
const UNLIMITED_THRESHOLD = 1_000_000_000;

// The free trial is the one plan not sold on a cycle — its stored cycle is a placeholder
// Monthly, so saying "Billed monthly" under it would be a lie about a plan nobody is billed for.
const isPaidPlan = (plan: SubscriptionTier) => plan !== 'FREETRIAL';

const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** "Contact to Upgrade" is still the truth wherever Razorpay checkout can't run — the native
 * builds and any login that isn't the Owner (see useSubscriptionCheckout.isCheckoutSupported). */
const planBtnLabel = (active: boolean, canCheckout: boolean, busy: boolean): string => {
  if (busy) return 'Opening payment…';
  if (!canCheckout) return active ? 'Current Plan' : 'Contact to Upgrade';
  return active ? 'Renew Plan' : 'Upgrade Now';
};

export const SubscriptionScreen = () => {
  const { isDesktopWeb, isWideLayout } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb, isWideLayout);
  const dispatch = useDispatch();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { data: subscription, isLoading, isError, refetch } = useSubscription();
  const { startCheckout, pendingPlan, isCheckoutSupported } = useSubscriptionCheckout();
  const [billingCycle, setBillingCycle] = React.useState<BillingCycle>('MONTHLY');

  // Open the cycle toggle on whatever the cafe is already paying for, so a yearly customer
  // sees yearly prices and renews into the same term instead of quietly dropping to a month.
  // Once only (the ref) — after that the toggle belongs to whoever is tapping it, and a
  // background refetch must not yank the prices out from under them.
  const syncedCycleFromPlan = React.useRef(false);
  React.useEffect(() => {
    if (syncedCycleFromPlan.current || !subscription) return;
    syncedCycleFromPlan.current = true;
    if (isPaidPlan(subscription.plan) && subscription.cycle === 'YEARLY') setBillingCycle('YEARLY');
  }, [subscription]);

  // Basic/Plus are bought here with Razorpay (web + Owner only — see useSubscriptionCheckout);
  // everything else still goes through your PrabandhOS provider by hand. Enterprise is quoted
  // rather than priced, and the native app has no web checkout to open, so both keep the
  // message this screen has always shown.
  const handleSelectPlan = (plan: SubscriptionTier, themeColor?: string) => {
    if (!subscription) return;

    // Re-buying the plan you're already on is deliberately allowed — it's the renew path, and
    // the backend extends from the existing expiry rather than resetting it, so paying early
    // never costs the owner days they already have.
    if (isCheckoutSupported && plan !== 'ENTERPRISE') {
      // Fire-and-forget by design: startCheckout handles every outcome itself (toast on
      // failure, silence on dismiss) and never rejects, so there is nothing to await here.
      startCheckout({ plan, cycle: billingCycle, themeColor });
      return;
    }

    dispatch(showToast({
      message: 'Contact your PrabandhOS provider to upgrade or renew — they’ll apply it once payment is confirmed.',
      icon: 'information-outline',
      tone: 'info',
    }));
  };

  const startedAt = subscription?.planStartedAt ? new Date(subscription.planStartedAt) : null;
  const expiresAt = subscription?.planExpiresAt ? new Date(subscription.planExpiresAt) : null;
  const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86400000) : null;
  const isExpired = daysLeft !== null && daysLeft < 0;
  const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;

  const renewBadge = expiresAt ? (
    <View style={[styles.expiryBadge, (isExpired || isExpiringSoon) && styles.expiryBadgeWarning]}>
      <Icon name="calendar-clock-outline" size={13} color={isExpired || isExpiringSoon ? COLORS.dangerAccent : COLORS.muted} />
      <Text style={[styles.expiryBadgeText, (isExpired || isExpiringSoon) && styles.expiryBadgeTextWarning]}>
        {isExpired ? `Expired ${expiresAt.toLocaleDateString('en-GB')}` : `Renews ${expiresAt.toLocaleDateString('en-GB')}`}
      </Text>
    </View>
  ) : null;

  const header = (
    <>
      <DesktopPageHeader icon="cloud-check-outline" title="Subscription" right={renewBadge} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="cloud-check" size={22} color={COLORS.accent} />
          <Text style={styles.headerTitle}>Subscription</Text>
          <View style={{ flex: 1 }} />
          {renewBadge}
        </View>
      )}
    </>
  );

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

  const maxBranchesText = subscription.maxBranches >= UNLIMITED_THRESHOLD ? 'Unlimited' : String(subscription.maxBranches);
  const isEnterpriseActive = subscription.plan === ENTERPRISE_PLAN.key;

  return (
    <View style={styles.container}>
      {header}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 12, paddingTop: 10, paddingBottom: 50 }}>
        <View style={styles.usageCard}>
          <View style={styles.usageAccentBar} />
          <View style={styles.usageIconBox}>
            <Icon name="crown" size={isDesktopWeb ? 20 : 17} color={COLORS.accent} />
          </View>
          <View style={styles.usageMain}>
            <Text style={styles.usageLabel}>CURRENT PLAN</Text>
            <View style={styles.usagePlanRow}>
              <Text style={styles.usagePlanName}>{TIER_LABEL[subscription.plan] ?? subscription.plan}</Text>
              {isPaidPlan(subscription.plan) && (
                <View style={styles.cycleBadge}>
                  <Icon name={subscription.cycle === 'YEARLY' ? 'calendar-star' : 'calendar-month-outline'} size={11} color={COLORS.accent} />
                  <Text style={styles.cycleBadgeText}>Billed {cycleLabel(subscription.cycle).toLowerCase()}</Text>
                </View>
              )}
            </View>
            <View style={styles.usageMetaRow}>
              <View style={[styles.statusPill, isExpired && styles.statusPillDanger]}>
                <View style={[styles.statusDot, isExpired && styles.statusDotDanger]} />
                <Text style={[styles.statusPillText, isExpired && styles.statusPillTextDanger]}>{isExpired ? 'Expired' : 'Active'}</Text>
              </View>
              <Text style={styles.usageMetaSep}>|</Text>
              <Text style={styles.usageMetaText}>Max Branches <Text style={styles.usageMetaTextBold}>{maxBranchesText}</Text></Text>
            </View>
            {!!expiresAt && (
              <View style={styles.termRow}>
                <Icon name="calendar-range-outline" size={12} color={COLORS.muted} />
                <Text style={styles.termText}>
                  {startedAt ? `Started ${fmtDate(startedAt)}` : 'Start date not recorded'}
                  {'  ·  '}
                  <Text style={[styles.termTextBold, (isExpired || isExpiringSoon) && styles.termTextWarning]}>
                    {isExpired ? `Expired ${fmtDate(expiresAt)}` : `Ends ${fmtDate(expiresAt)}`}
                  </Text>
                </Text>
              </View>
            )}
          </View>
          {isWideLayout && (
            <>
              <View style={styles.usageDivider} />
              <View style={styles.usageStatRight}>
                <Text style={styles.usageStatLabel}>Max Branches</Text>
                <Text style={styles.usageStatValue}>{maxBranchesText}</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionTitleWithIcon}>
            <Icon name="layers-outline" size={isDesktopWeb ? 16 : 14} color={COLORS.heading} />
            <Text style={styles.sectionTitle}>Available Plans</Text>
          </View>
          <View style={styles.cycleToggle}>
            <TouchableOpacity
              style={[styles.cycleOption, billingCycle === 'MONTHLY' && styles.cycleOptionActive]}
              onPress={() => setBillingCycle('MONTHLY')}
            >
              <Text style={[styles.cycleOptionText, billingCycle === 'MONTHLY' && styles.cycleOptionTextActive]}>Monthly</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cycleOption, billingCycle === 'YEARLY' && styles.cycleOptionActive]}
              onPress={() => setBillingCycle('YEARLY')}
            >
              <Text style={[styles.cycleOptionText, billingCycle === 'YEARLY' && styles.cycleOptionTextActive]}>Yearly</Text>
              <View style={styles.cycleSaveBadge}>
                <Text style={styles.cycleSaveBadgeText}>Save 17%</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.planGrid}>
          {GRID_PLANS.map((plan) => {
            const active = subscription.plan === plan.key;
            const busy = pendingPlan === plan.key;
            const price = (billingCycle === 'YEARLY' && plan.yearlyPrice) ? plan.yearlyPrice : plan.monthlyPrice;
            const originalPrice = billingCycle === 'YEARLY' ? plan.yearlyOriginalPrice : plan.monthlyOriginalPrice;
            return (
              <View key={plan.key} style={styles.planCard}>
                {plan.highlight && !active && (
                  <View style={styles.popularBadge}>
                    <Icon name="star-four-points" size={11} color="#FFFFFF" />
                    <Text style={styles.popularBadgeText}>Most Popular</Text>
                  </View>
                )}
                <LinearGradient colors={plan.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.planBanner}>
                  <View style={styles.planBannerLeft}>
                    <Icon name={plan.icon} size={16} color="#FFFFFF" />
                    <Text style={styles.planBannerName}>{plan.name}</Text>
                  </View>
                  <View style={styles.priceCol}>
                    {!!originalPrice && <Text style={styles.planOriginalPrice}>{originalPrice}</Text>}
                    <Text style={styles.planPrice}>{price}</Text>
                  </View>
                </LinearGradient>
                <View style={styles.planBody}>
                  {plan.features.map((f) => (
                    <View key={f} style={styles.featureRow}>
                      <Icon name="check-circle" size={13} color={COLORS.success} />
                      <Text style={styles.featureText}>{f}</Text>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={[styles.planBtn, { backgroundColor: plan.gradient[1] }, busy && styles.planBtnBusy]}
                    // The current plan's button stays live where there's a checkout to open
                    // (renewing is how an expired cafe gets back in) and reverts to the old
                    // dead "Current Plan" label everywhere paying isn't possible anyway.
                    disabled={(active && !isCheckoutSupported) || pendingPlan !== null}
                    onPress={() => handleSelectPlan(plan.key, plan.gradient[1])}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Icon name={active ? 'crown' : 'lightning-bolt'} size={13} color="#FFFFFF" />
                    )}
                    <Text style={styles.planBtnText}>{planBtnLabel(active, isCheckoutSupported, busy)}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.enterpriseCard}>
          <View style={styles.enterpriseTop}>
            <View style={styles.enterpriseIconBox}>
              <Icon name={ENTERPRISE_PLAN.icon} size={isDesktopWeb ? 20 : 17} color={COLORS.accent} />
            </View>
            <View style={styles.enterpriseMain}>
              <Text style={styles.enterpriseName}>{ENTERPRISE_PLAN.name}</Text>
              <View style={styles.enterpriseFeatures}>
                {ENTERPRISE_PLAN.features.map((f) => (
                  <View key={f} style={styles.enterpriseFeatureRow}>
                    <Icon name="check-circle" size={14} color={COLORS.success} />
                    <Text style={styles.enterpriseFeatureText}>{f}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.enterpriseBtn, isEnterpriseActive && styles.enterpriseBtnActive]}
            disabled={isEnterpriseActive}
            onPress={() => handleSelectPlan(ENTERPRISE_PLAN.key)}
          >
            {isEnterpriseActive && <Icon name="crown" size={13} color="#FFFFFF" />}
            <Text style={[styles.enterpriseBtnText, isEnterpriseActive && styles.enterpriseBtnTextActive]}>
              {isEnterpriseActive ? 'Current Plan' : 'Custom Pricing'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean, isWideLayout: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 9 : 9, gap: isDesktopWeb ? 7 : 7.5 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },

  usagePlanRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: isDesktopWeb ? 8 : 6 },
  cycleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.background, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.divider,
    paddingHorizontal: isDesktopWeb ? 8 : 6, paddingVertical: isDesktopWeb ? 3 : 2.5,
  },
  cycleBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  termRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: isDesktopWeb ? 6 : 4.5 },
  termText: { fontSize: 11, color: COLORS.muted },
  termTextBold: { fontWeight: '700', color: COLORS.heading },
  termTextWarning: { color: COLORS.dangerAccent },

  expiryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4 : 3.75,
    backgroundColor: COLORS.cardAlt, borderRadius: 10, paddingHorizontal: isDesktopWeb ? 8 : 7.5, paddingVertical: isDesktopWeb ? 5 : 4.5,
    borderWidth: 1, borderColor: COLORS.divider,
  },
  expiryBadgeWarning: { backgroundColor: COLORS.dangerBg, borderColor: COLORS.dangerBg },
  expiryBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.muted },
  expiryBadgeTextWarning: { color: COLORS.dangerAccent },

  usageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 10,
    paddingVertical: isDesktopWeb ? 12 : 10,
    paddingRight: isDesktopWeb ? 14 : 12,
    marginBottom: isDesktopWeb ? 14 : 12,
    overflow: 'hidden',
    position: 'relative',
  },
  usageAccentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: COLORS.accent },
  usageIconBox: {
    width: isDesktopWeb ? 42 : 36,
    height: isDesktopWeb ? 42 : 36,
    borderRadius: 10,
    backgroundColor: COLORS.pillActiveBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: isDesktopWeb ? 14 : 10,
    marginRight: isDesktopWeb ? 12 : 9,
  },
  usageMain: { flex: 1, minWidth: 0 },
  usageLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.4 },
  usagePlanName: { fontSize: isDesktopWeb ? 18 : 14, fontWeight: '800', color: COLORS.heading, marginTop: 1 },
  usageMetaRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 5, marginTop: isDesktopWeb ? 5 : 4, flexWrap: 'wrap' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.successBg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
  },
  statusPillDanger: { backgroundColor: COLORS.dangerBg },
  statusDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.success },
  statusDotDanger: { backgroundColor: COLORS.dangerAccent },
  statusPillText: { fontSize: 10, fontWeight: '700', color: COLORS.success },
  statusPillTextDanger: { color: COLORS.dangerAccent },
  usageMetaSep: { fontSize: 11, color: COLORS.divider },
  usageMetaText: { fontSize: 11, color: COLORS.muted },
  usageMetaTextBold: { fontWeight: '700', color: COLORS.heading },
  usageDivider: { width: 1, alignSelf: 'stretch', backgroundColor: COLORS.divider, marginHorizontal: 14 },
  usageStatRight: {},
  usageStatLabel: { fontSize: 11, color: COLORS.muted, marginBottom: 2 },
  usageStatValue: { fontSize: 15, fontWeight: '800', color: COLORS.heading },

  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 9 : 8, flexWrap: 'wrap', gap: 8 },
  sectionTitleWithIcon: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: isDesktopWeb ? 15 : 13, fontWeight: 'bold', color: COLORS.heading },
  cycleToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 999,
    padding: 2,
    gap: 2,
  },
  cycleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: isDesktopWeb ? 10 : 8,
    paddingVertical: isDesktopWeb ? 5 : 4.5,
    borderRadius: 999,
  },
  cycleOptionActive: { backgroundColor: COLORS.button },
  cycleOptionText: { fontSize: 10.5, fontWeight: '700', color: COLORS.muted },
  cycleOptionTextActive: { color: '#FFFFFF' },
  cycleSaveBadge: { backgroundColor: COLORS.success, borderRadius: 7, paddingHorizontal: 4, paddingVertical: 1 },
  cycleSaveBadgeText: { fontSize: 8.5, fontWeight: '700', color: '#FFFFFF' },

  planGrid: {
    flexDirection: isWideLayout ? 'row' : 'column',
    gap: isDesktopWeb ? 12 : 10,
    marginBottom: isDesktopWeb ? 12 : 10,
  },
  planCard: {
    flex: isWideLayout ? 1 : undefined,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  popularBadge: {
    position: 'absolute',
    top: -8,
    right: 14,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 9,
  },
  popularBadgeText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF' },
  planBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 13 : 11,
    paddingVertical: isDesktopWeb ? 11 : 9,
  },
  planBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planBannerName: { fontSize: isDesktopWeb ? 14 : 12.5, fontWeight: '800', color: '#FFFFFF' },
  priceCol: { alignItems: 'flex-end' },
  planOriginalPrice: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.7)', textDecorationLine: 'line-through' },
  planPrice: { fontSize: isDesktopWeb ? 13 : 11.5, fontWeight: '800', color: '#FFFFFF' },
  planBody: { padding: isDesktopWeb ? 13 : 11 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: isDesktopWeb ? 6 : 5 },
  featureText: { fontSize: 11.5, color: COLORS.heading },
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 5,
    borderRadius: 7,
    paddingVertical: 9,
  },
  planBtnBusy: { opacity: 0.75 },
  planBtnText: { fontSize: 11.5, fontWeight: '700', color: '#FFFFFF' },

  enterpriseCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 10,
    padding: isDesktopWeb ? 13 : 11,
    flexDirection: isWideLayout ? 'row' : 'column',
    alignItems: isWideLayout ? 'center' : 'stretch',
    gap: isDesktopWeb ? 12 : 10,
  },
  enterpriseTop: {
    flex: isWideLayout ? 1 : undefined,
    flexDirection: 'row',
    alignItems: isWideLayout ? 'center' : 'flex-start',
    gap: isDesktopWeb ? 12 : 9,
  },
  enterpriseIconBox: {
    width: isDesktopWeb ? 42 : 36,
    height: isDesktopWeb ? 42 : 36,
    borderRadius: 10,
    backgroundColor: COLORS.pillActiveBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enterpriseMain: { flex: 1, minWidth: 0 },
  enterpriseName: { fontSize: isDesktopWeb ? 15 : 13, fontWeight: '800', color: COLORS.heading, marginBottom: isWideLayout ? 6 : 4 },
  enterpriseFeatures: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 12 : 8 },
  enterpriseFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  enterpriseFeatureText: { fontSize: 11.5, color: COLORS.heading },
  enterpriseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: COLORS.pillActiveBg,
    borderRadius: 7,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  enterpriseBtnActive: { backgroundColor: COLORS.button },
  enterpriseBtnText: { fontSize: 11.5, fontWeight: '700', color: COLORS.pillActiveText },
  enterpriseBtnTextActive: { color: '#FFFFFF' },
});
