import React from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Platform, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { confirmAlert } from '../../../../shared/components/ConfirmDialogHost';
import { useDispatch } from 'react-redux';
import { WarmColors as COLORS } from '../../../../shared/design/warmTheme';
import { logout } from '../../../auth/presentation/viewmodels/authSlice';
import { AppDispatch } from '../../../../core/store';
import { useSuperAdminTenants } from '../../../../core/api/hooks/useSuperAdmin';
import { useSuperAdminTickets } from '../../../../core/api/hooks/useSupport';
import { SkeletonList, SkeletonStatRow } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../core/utils/useResponsive';

// Monthly price for plans that are actually self-service billed. Enterprise is
// custom-quoted (no fixed price to sum), FreeTrial/NONE pay nothing yet — so
// only Starter/Professional tenants contribute to the estimated MRR below.
const PLAN_PRICE: Record<string, number> = { STARTER: 2900, PROFESSIONAL: 7900 };

// Matches the customer-facing names on SubscriptionScreen (Basic/Plus/Enterprise) —
// STARTER/PROFESSIONAL/ENTERPRISE stay as the wire values, these are display-only.
const PLAN_LABEL: Record<string, string> = {
  FREETRIAL: 'Free Trial',
  STARTER: 'Basic',
  PROFESSIONAL: 'Plus',
  ENTERPRISE: 'Enterprise',
  NONE: 'No plan',
};

const timeAgo = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export const SuperAdminDashboard = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch<AppDispatch>();
  const { data: tenants = [], isLoading: tenantsLoading, isError: tenantsError, refetch: refetchTenants } = useSuperAdminTenants();
  const { data: tickets = [], isLoading: ticketsLoading, isError: ticketsError, refetch: refetchTickets } = useSuperAdminTickets();

  const confirmLogout = () => {
    confirmAlert('Sign out', 'Sign out of the Super Admin account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => dispatch(logout()) },
    ]);
  };

  const isLoading = tenantsLoading || ticketsLoading;
  const isError = tenantsError || ticketsError;

  const totalTenants = tenants.length;
  const weekAgo = Date.now() - 7 * 86400000;
  const newThisWeek = tenants.filter((t) => new Date(t.createdAt).getTime() >= weekAgo).length;
  const activeTenants = tenants.filter((t) => t.status === 'ACTIVE').length;
  const openTickets = tickets.filter((t) => t.status === 'OPEN').length;
  const estimatedMRR = tenants.reduce((sum, t) => sum + (PLAN_PRICE[t.plan] ?? 0), 0);

  // Real signups-per-day for the last 7 days, computed from actual tenant.createdAt —
  // same "bucket real timestamps into days" pattern used by the Sales Forecast chart.
  const dayBuckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const signupTrend = dayBuckets.map((day) => {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const count = tenants.filter((t) => {
      const created = new Date(t.createdAt);
      return created >= day && created < next;
    }).length;
    return { value: count, label: day.toLocaleDateString(undefined, { weekday: 'short' }) };
  });

  const recentSignups = [...tenants]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={22} color={COLORS.heading} />
        </TouchableOpacity>
        <Icon name="shield-crown" size={22} color={COLORS.superAdmin} />
        <Text style={styles.headerTitle}>Super Admin</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={confirmLogout} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="logout" size={20} color={COLORS.heading} />
        </TouchableOpacity>
      </View>

      {isError && tenants.length === 0 && tickets.length === 0 ? (
        <ErrorState
          title="Couldn't load dashboard"
          message="Check your connection and try again."
          onRetry={() => { refetchTenants(); refetchTickets(); }}
        />
      ) : isLoading ? (
        <View style={{ padding: 16 }}>
          <SkeletonStatRow count={2} style={{ marginBottom: 20 }} />
          <SkeletonList rows={4} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.pulseCard}>
            <Text style={styles.pulseTitle}>Ecosystem Pulse</Text>
            <Text style={styles.pulseSubtitle}>
              Monitoring {totalTenants} {totalTenants === 1 ? 'cafe' : 'cafes'} on the platform, live from the tenant database.
            </Text>
          </View>

          <View style={styles.revenueCard}>
            <Text style={styles.cardLabel}>ESTIMATED MRR</Text>
            <Text style={styles.revenueValue}>₹{estimatedMRR.toLocaleString()}</Text>
            <Text style={styles.revenueHint}>Sum of Basic/Plus plan prices across tenants · Enterprise excluded (custom pricing)</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={styles.statTopRow}>
                <Icon name="domain" size={18} color={COLORS.muted} />
                {newThisWeek > 0 && (
                  <View style={styles.newPill}>
                    <Text style={styles.newPillText}>{newThisWeek} New</Text>
                  </View>
                )}
              </View>
              <Text style={styles.statLabel}>TENANTS</Text>
              <Text style={styles.statValue}>{totalTenants}</Text>
              <Text style={styles.statSub}>{activeTenants} active</Text>
            </View>
            <View style={styles.statCard}>
              <Icon name="lifebuoy" size={18} color={COLORS.muted} style={{ marginBottom: 8 }} />
              <Text style={styles.statLabel}>SUPPORT</Text>
              <Text style={styles.statValue}>{openTickets}</Text>
              <Text style={styles.statSub}>Open tickets</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>New Signups — Last 7 Days</Text>
          <View style={styles.chartCard}>
            {totalTenants === 0 || signupTrend.every((d) => d.value === 0) ? (
              <Text style={styles.emptyText}>No new signups in the last 7 days.</Text>
            ) : (
              <LineChart
                data={signupTrend}
                color={COLORS.superAdmin}
                thickness={3}
                hideRules
                hideYAxisText
                hideAxesAndRules
                curved
                isAnimated
                width={280}
                height={110}
                areaChart
                startFillColor={COLORS.superAdmin}
                startOpacity={0.15}
                endOpacity={0}
                xAxisLabelTexts={signupTrend.map((d) => d.label)}
                xAxisLabelTextStyle={{ color: COLORS.muted, fontSize: 10 }}
              />
            )}
          </View>

          <Text style={styles.sectionTitle}>Recent Signups</Text>
          <View style={styles.signupsCard}>
            {recentSignups.length === 0 ? (
              <Text style={[styles.emptyText, { padding: 12 }]}>No tenants yet.</Text>
            ) : (
              recentSignups.map((t, index) => (
                <View key={t.id} style={[styles.signupRow, index !== recentSignups.length - 1 && styles.signupDivider]}>
                  <View style={[styles.signupAvatar, { backgroundColor: COLORS.superAdmin }]}>
                    <Text style={styles.signupAvatarText}>{t.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.signupName}>{t.name}</Text>
                    <Text style={styles.signupPlan}>{PLAN_LABEL[t.plan] ?? t.plan} · {timeAgo(t.createdAt)}</Text>
                  </View>
                </View>
              ))
            )}
            <TouchableOpacity style={styles.viewAllBtn} onPress={() => navigation?.navigate?.('Tenants')}>
              <Text style={styles.viewAllText}>View All Tenants</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.quickCard, { backgroundColor: COLORS.heading }]} onPress={() => navigation?.navigate?.('AuditLogs')}>
            <View>
              <Text style={styles.quickTitleLight}>Audit Log</Text>
              <Text style={styles.quickSubLight}>Track admin & security events</Text>
            </View>
            <Icon name="text-box-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCardLight} onPress={() => navigation?.navigate?.('Support')}>
            <View>
              <Text style={styles.quickTitleDark}>Support</Text>
              <Text style={styles.quickSubDark}>{openTickets} pending {openTickets === 1 ? 'ticket' : 'tickets'}</Text>
            </View>
            <Icon name="face-agent" size={20} color={COLORS.heading} />
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 10 : 7.5,
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    paddingTop: isDesktopWeb ? 12 : 9,
    paddingBottom: isDesktopWeb ? 12 : 9,
  },
  headerTitle: {
    fontSize: isDesktopWeb ? 20 : 14,
    fontWeight: 'bold',
    color: COLORS.superAdmin,
  },
  pulseCard: {
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    marginBottom: isDesktopWeb ? 16 : 12,
  },
  pulseTitle: {
    fontSize: isDesktopWeb ? 22 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 6 : 4.5,
  },
  pulseSubtitle: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 18,
  },
  revenueCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 16 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 18 : 13.5,
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
    marginBottom: isDesktopWeb ? 6 : 4.5,
  },
  revenueValue: {
    fontSize: isDesktopWeb ? 30 : 12,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  revenueHint: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 6 : 4.5,
    lineHeight: 15,
  },
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    gap: isDesktopWeb ? 12 : 9,
    marginBottom: isDesktopWeb ? 20 : 15,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 14 : 10.5,
  },
  statTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  newPill: {
    backgroundColor: COLORS.superAdminBg,
    paddingHorizontal: isDesktopWeb ? 7 : 5.25,
    paddingVertical: isDesktopWeb ? 2 : 1.5,
    borderRadius: 6,
  },
  newPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.superAdmin,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
    marginBottom: isDesktopWeb ? 4 : 3,
  },
  statValue: {
    fontSize: isDesktopWeb ? 22 : 12,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  statSub: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 2 : 1.5,
  },
  sectionTitle: {
    fontSize: isDesktopWeb ? 17 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  chartCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 16 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 16 : 12,
    marginBottom: isDesktopWeb ? 24 : 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
  },
  emptyText: {
    fontSize: isDesktopWeb ? 13 : 12,
    color: COLORS.muted,
  },
  signupsCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 16 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 8 : 6,
    marginBottom: isDesktopWeb ? 20 : 15,
  },
  signupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 12 : 9,
    padding: isDesktopWeb ? 10 : 7.5,
  },
  signupDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  signupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: isDesktopWeb ? 15 : 12,
  },
  signupName: {
    fontSize: isDesktopWeb ? 14 : 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  signupPlan: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 1 : 0.75,
  },
  viewAllBtn: {
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 12 : 9,
    alignItems: 'center',
    margin: isDesktopWeb ? 8 : 6,
  },
  viewAllText: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  quickCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 12,
    borderRadius: 8,
    padding: 12,
    marginBottom: 9,
  },
  quickCardLight: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: 12,
    borderRadius: 8,
    padding: 12,
    marginBottom: 9,
  },
  quickTitleLight: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  quickSubLight: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1.5,
  },
  quickTitleDark: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.heading,
  },
  quickSubDark: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 1.5,
  },
});
