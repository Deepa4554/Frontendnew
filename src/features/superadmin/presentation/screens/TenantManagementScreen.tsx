import React, { useState } from 'react';
import { CloseButton } from '../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { confirmAlert } from '../../../../shared/components/ConfirmDialogHost';
import { useDispatch } from 'react-redux';
import { WarmColors as COLORS } from '../../../../shared/design/warmTheme';
import { useSuperAdminTenants, useChangeTenantPlan, useTenantSales } from '../../../../core/api/hooks/useSuperAdmin';
import { TenantScreenAccessModal } from './TenantScreenAccessModal';
import { TenantStaffScreenAccessModal } from './TenantStaffScreenAccessModal';
import { ApiTenantSummary } from '../../../../core/api/superAdminApi';
import { BillingCycle, cycleLabel, SubscriptionTier } from '../../../../core/api/subscriptionApi';
import { getApiErrorMessage } from '../../../../core/network/api';
import { logout } from '../../../auth/presentation/viewmodels/authSlice';
import { AppDispatch } from '../../../../core/store';
import { showToast } from '../../../../core/store/uiSlice';
import { SkeletonList, SkeletonStatRow } from '../../../../shared/components/atoms/Skeleton';
import { SearchClearButton } from '../../../../shared/components/atoms/SearchClearButton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';

import { modalHeadingOverride } from '../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../core/utils/useResponsive';
const confirmLogout = (dispatch: AppDispatch) => {
  confirmAlert('Sign out', 'Sign out of the Super Admin account?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign Out', style: 'destructive', onPress: () => dispatch(logout()) },
  ]);
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  ACTIVE: { bg: COLORS.successBg, text: COLORS.success },
  TRIAL: { bg: COLORS.warningBg, text: COLORS.warning },
  SUSPENDED: { bg: COLORS.dangerBg, text: COLORS.dangerAccent },
};

// Matches the customer-facing names on SubscriptionScreen (Basic/Plus/Enterprise) —
// STARTER/PROFESSIONAL/ENTERPRISE stay as the wire values, these are display-only.
const PLAN_OPTIONS: { key: SubscriptionTier; label: string }[] = [
  { key: 'FREETRIAL', label: 'Free Trial (14 days)' },
  { key: 'STARTER', label: 'Basic' },
  { key: 'PROFESSIONAL', label: 'Plus' },
  { key: 'ENTERPRISE', label: 'Enterprise' },
];

const PLAN_LABEL: Record<string, string> = { FREETRIAL: 'Free Trial', STARTER: 'Basic', PROFESSIONAL: 'Plus', ENTERPRISE: 'Enterprise', NONE: 'No plan' };
const planLabel = (plan: string) => PLAN_LABEL[plan] ?? plan;

const CYCLE_OPTIONS: BillingCycle[] = ['MONTHLY', 'YEARLY'];

// The trial and a cafe with no subscription row both come back as MONTHLY because the column
// can't be null — neither is actually sold on a cycle, so neither should advertise one.
const isPaidPlan = (plan: string) => plan !== 'FREETRIAL' && plan !== 'NONE';

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');

// One tenant row. React.memo'd so the whole list skips re-render while the user types in the
// search box — module-level `styles`/`COLORS` are already stable, and the passed setters are
// stable setState functions, so a row re-renders only when its own tenant data changes.
const TenantCard = React.memo(({ tenant, onViewSales, onManageScreens, onManageStaff, onChangePlan }: {
  tenant: ApiTenantSummary;
  onViewSales: (t: ApiTenantSummary) => void;
  onManageScreens: (t: ApiTenantSummary) => void;
  onManageStaff: (t: ApiTenantSummary) => void;
  onChangePlan: (t: ApiTenantSummary) => void;
}) => {
  const style = STATUS_STYLES[tenant.status] ?? STATUS_STYLES.TRIAL;
  const expired = !!tenant.planExpiresAt && new Date(tenant.planExpiresAt) < new Date();
  // Both ends of the term, not just the far one — "Expires 12/09" on its own never said which
  // plan period you were looking at, and can't distinguish a monthly from a yearly grant.
  const termText = tenant.planExpiresAt
    ? `${fmtDate(tenant.planStartedAt)} → ${fmtDate(tenant.planExpiresAt)}${expired ? ' · Expired' : ''}`
    : 'No expiry';
  return (
    <View style={styles.tenantCard}>
      <View style={styles.tenantTopRow}>
        <Text style={styles.tenantName}>{tenant.name}</Text>
        <View style={[styles.statusPill, { backgroundColor: style.bg }]}>
          <Text style={[styles.statusPillText, { color: style.text }]}>{tenant.status}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Icon name="domain" size={14} color={COLORS.muted} />
        <Text style={styles.metaText}>{tenant.branchCount} branches · {tenant.staffCount} staff</Text>
      </View>
      <Text style={[styles.expiryText, expired && styles.expiryTextExpired]}>{termText}</Text>

      <View style={styles.tenantBottomRow}>
        <View style={styles.pillRow}>
          <View style={styles.planPill}>
            <Text style={styles.planPillText}>{planLabel(tenant.plan)}</Text>
          </View>
          {isPaidPlan(tenant.plan) && (
            <View style={styles.cyclePill}>
              <Text style={styles.cyclePillText}>{cycleLabel(tenant.cycle)}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.salesBtn} onPress={() => onViewSales(tenant)}>
            <Icon name="chart-line" size={13} color={COLORS.heading} />
            <Text style={styles.salesBtnText}>Sales</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.salesBtn} onPress={() => onManageScreens(tenant)}>
            <Icon name="shield-account-outline" size={13} color={COLORS.heading} />
            <Text style={styles.salesBtnText}>Screens</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.salesBtn} onPress={() => onManageStaff(tenant)}>
            <Icon name="account-cog-outline" size={13} color={COLORS.heading} />
            <Text style={styles.salesBtnText}>Staff Access</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.manageBtn} onPress={() => onChangePlan(tenant)}>
            <Text style={styles.manageBtnText}>Change Plan</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

export const TenantManagementScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const [search, setSearch] = useState('');
  const [managing, setManaging] = useState<ApiTenantSummary | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');
  const [viewingSales, setViewingSales] = useState<ApiTenantSummary | null>(null);
  const [managingScreens, setManagingScreens] = useState<ApiTenantSummary | null>(null);
  const [managingStaffAccess, setManagingStaffAccess] = useState<ApiTenantSummary | null>(null);
  const dispatch = useDispatch<AppDispatch>();
  const insets = useSafeAreaInsets();

  const { data: tenants = [], isLoading, isError, refetch } = useSuperAdminTenants();
  const changePlan = useChangeTenantPlan();
  const { data: sales, isLoading: salesLoading } = useTenantSales(viewingSales?.id ?? null);

  const filtered = tenants.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  // Opens the plan modal pre-set to whatever the cafe is already on, so renewing a yearly
  // customer is one tap and can't silently drop them back to a month.
  const openPlanModal = React.useCallback((tenant: ApiTenantSummary) => {
    setCycle(isPaidPlan(tenant.plan) ? tenant.cycle : 'MONTHLY');
    setManaging(tenant);
  }, []);

  const applyPlan = async (plan: SubscriptionTier) => {
    if (!managing) return;
    const tenantName = managing.name;
    const termText = plan === 'FREETRIAL' ? '14 days' : cycleLabel(cycle).toLowerCase();
    try {
      await changePlan.mutateAsync({ tenantId: managing.id, plan, cycle });
      setManaging(null);
      // The modal closing was the only feedback before this — no confirmation that the
      // change actually landed, easy to mistake for a silent no-op.
      dispatch(showToast({ message: `${tenantName}'s plan changed to ${planLabel(plan)} for ${termText}.`, icon: 'check-circle-outline', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not change plan'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Icon name="shield-crown" size={20} color={COLORS.superAdmin} />
        <Text style={styles.headerTitle}>Super Admin</Text>
        <TouchableOpacity onPress={() => confirmLogout(dispatch)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="logout" size={20} color={COLORS.heading} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.titleBox}>
          <Text style={styles.title}>Tenant Management</Text>
          <Text style={styles.subtitle}>Every cafe on the platform — change a tenant's plan here instead of touching the database directly.</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{tenants.length}</Text>
          <Text style={styles.summaryLabel}>Total Tenants</Text>
        </View>

        <View style={styles.searchWrapper}>
          <Icon name="magnify" size={18} color={COLORS.muted} style={{ marginRight: 8 }} />
          <View style={styles.searchInputWrap}>
            <TextInput
              style={[styles.searchInput, { paddingRight: 24 }]}
              placeholder="Search by cafe name..."
              placeholderTextColor={COLORS.placeholder}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && <SearchClearButton onPress={() => setSearch('')} />}
          </View>
        </View>

        {isError && tenants.length === 0 ? (
          <ErrorState
            title="Couldn't load tenants"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : (
          <>
            {isLoading && <SkeletonList rows={5} style={{ paddingHorizontal: 16, marginTop: 4 }} />}

            {!isLoading && filtered.length === 0 && <Text style={styles.emptyText}>No tenants found.</Text>}

            {filtered.map((tenant) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                onViewSales={setViewingSales}
                onManageScreens={setManagingScreens}
                onManageStaff={setManagingStaffAccess}
                onChangePlan={openPlanModal}
              />
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={!!managing} transparent animationType="fade" onRequestClose={() => setManaging(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.salesModalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>{managing?.name}</Text>
              <CloseButton onPress={() => setManaging(null)} size={18} />
            </View>
            <Text style={styles.modalSubtitle}>
              Current plan: {managing ? planLabel(managing.plan) : ''}
              {managing && isPaidPlan(managing.plan) ? ` · ${cycleLabel(managing.cycle)}` : ''}
              {managing?.planExpiresAt ? ` · ${fmtDate(managing.planStartedAt)} → ${fmtDate(managing.planExpiresAt)}` : ''}
            </Text>

            <View style={styles.cycleToggle}>
              {CYCLE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.cycleOption, cycle === opt && styles.cycleOptionActive]}
                  disabled={changePlan.isPending}
                  onPress={() => setCycle(opt)}
                >
                  <Text style={[styles.cycleOptionText, cycle === opt && styles.cycleOptionTextActive]}>{cycleLabel(opt)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.cycleHint}>
              The term starts today. Free Trial always runs 14 days — the cycle applies to paid plans only.
            </Text>

            {PLAN_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={styles.planOptionRow}
                disabled={changePlan.isPending}
                onPress={() => applyPlan(opt.key)}
              >
                <Text style={styles.planOptionText}>{opt.label}</Text>
                {changePlan.isPending ? <ActivityIndicator size="small" color={COLORS.superAdmin} /> : (
                  <Icon name="chevron-right" size={14} color={COLORS.muted} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setManaging(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewingSales} transparent animationType="fade" onRequestClose={() => setViewingSales(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <View style={styles.salesModalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>{viewingSales?.name}</Text>
              <CloseButton onPress={() => setViewingSales(null)} size={18} />
            </View>
            <Text style={styles.modalSubtitle}>Real sales — computed from this cafe's actual paid orders</Text>

            {salesLoading || !sales ? (
              <View style={{ marginTop: 16 }}>
                <SkeletonStatRow count={4} style={{ marginBottom: 20 }} />
                <SkeletonList rows={3} avatar={false} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.salesKpiGrid}>
                  <View style={styles.salesKpiCard}>
                    <Text style={styles.salesKpiLabel}>TODAY</Text>
                    <Text style={styles.salesKpiValue}>₹{sales.todayRevenue.toLocaleString()}</Text>
                  </View>
                  <View style={styles.salesKpiCard}>
                    <Text style={styles.salesKpiLabel}>THIS MONTH</Text>
                    <Text style={styles.salesKpiValue}>₹{sales.thisMonthRevenue.toLocaleString()}</Text>
                  </View>
                  <View style={styles.salesKpiCard}>
                    <Text style={styles.salesKpiLabel}>ALL-TIME</Text>
                    <Text style={styles.salesKpiValue}>₹{sales.allTimeRevenue.toLocaleString()}</Text>
                  </View>
                  <View style={styles.salesKpiCard}>
                    <Text style={styles.salesKpiLabel}>ALL-TIME ORDERS</Text>
                    <Text style={styles.salesKpiValue}>{sales.allTimeOrderCount}</Text>
                  </View>
                </View>

                <Text style={styles.salesSectionTitle}>Daily — Last 30 Days</Text>
                {sales.daily.every((d) => d.revenue === 0) ? (
                  <Text style={styles.emptyText}>No paid orders in the last 30 days.</Text>
                ) : (
                  <View style={styles.salesChartCard}>
                    <LineChart
                      data={sales.daily.map((d) => ({ value: d.revenue }))}
                      color={COLORS.superAdmin}
                      thickness={2}
                      hideRules
                      hideYAxisText
                      hideAxesAndRules
                      curved
                      areaChart
                      startFillColor={COLORS.superAdmin}
                      startOpacity={0.15}
                      endOpacity={0}
                      width={260}
                      height={90}
                    />
                  </View>
                )}

                <Text style={styles.salesSectionTitle}>Monthly — Last 12 Months</Text>
                {sales.monthly.every((m) => m.revenue === 0) ? (
                  <Text style={styles.emptyText}>No paid orders recorded yet.</Text>
                ) : (
                  sales.monthly
                    .slice()
                    .reverse()
                    .filter((m) => m.revenue > 0 || m.orderCount > 0)
                    .map((m) => (
                      <View key={m.month} style={styles.monthRow}>
                        <Text style={styles.monthLabel}>{m.month}</Text>
                        <Text style={styles.monthOrders}>{m.orderCount} orders</Text>
                        <Text style={styles.monthRevenue}>₹{m.revenue.toLocaleString()}</Text>
                      </View>
                    ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <TenantScreenAccessModal tenant={managingScreens} onClose={() => setManagingScreens(null)} />
      <TenantStaffScreenAccessModal tenant={managingStaffAccess} onClose={() => setManagingStaffAccess(null)} />
    </View>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 8 : 6, paddingHorizontal: isDesktopWeb ? 16 : 12, paddingTop: isDesktopWeb ? 12 : 9, paddingBottom: isDesktopWeb ? 12 : 9 },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.superAdmin, flex: 1 },
  titleBox: { paddingHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 16 : 12 },
  title: { fontSize: isDesktopWeb ? 22 : 14, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 4.5 },
  subtitle: { fontSize: 13, color: COLORS.muted, lineHeight: 18 },
  summaryCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: isDesktopWeb ? 18 : 13.5, marginBottom: isDesktopWeb ? 16 : 12, alignItems: 'center' },
  summaryValue: { fontSize: isDesktopWeb ? 32 : 12, fontWeight: 'bold', color: COLORS.superAdmin },
  summaryLabel: { fontSize: 12, color: COLORS.muted },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    marginHorizontal: isDesktopWeb ? 16 : 12,
    paddingHorizontal: isDesktopWeb ? 14 : 10.5,
    height: 46,
    marginBottom: isDesktopWeb ? 16 : 12,
  },
  searchInputWrap: { flex: 1, borderRadius: 8 },
  searchInput: { width: '100%', fontSize: 16, color: COLORS.heading },
  emptyText: { textAlign: 'center', color: COLORS.muted, marginTop: isDesktopWeb ? 20 : 15 },
  tenantCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 14 : 10.5 },
  tenantTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isDesktopWeb ? 8 : 6 },
  statusPill: { paddingHorizontal: isDesktopWeb ? 10 : 7.5, paddingVertical: isDesktopWeb ? 4 : 3, borderRadius: 10 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  tenantName: { fontSize: isDesktopWeb ? 17 : 12, fontWeight: 'bold', color: COLORS.heading, flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 5 : 3.75, marginBottom: isDesktopWeb ? 4 : 3 },
  metaText: { fontSize: 12, color: COLORS.muted },
  expiryText: { fontSize: 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 14 : 10.5 },
  expiryTextExpired: { color: COLORS.dangerAccent, fontWeight: '600' },
  tenantBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingTop: isDesktopWeb ? 12 : 9,
  },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 4.5 },
  planPill: { backgroundColor: COLORS.background, paddingHorizontal: isDesktopWeb ? 10 : 7.5, paddingVertical: isDesktopWeb ? 5 : 3.75, borderRadius: 8 },
  planPillText: { fontSize: 11, fontWeight: '600', color: COLORS.muted },
  cyclePill: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: isDesktopWeb ? 10 : 7.5,
    paddingVertical: isDesktopWeb ? 4 : 3,
    borderRadius: 8,
  },
  cyclePillText: { fontSize: 11, fontWeight: '700', color: COLORS.superAdmin },
  manageBtn: { backgroundColor: COLORS.button, paddingHorizontal: isDesktopWeb ? 16 : 12, paddingVertical: isDesktopWeb ? 9 : 6.75, borderRadius: 6 },
  manageBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  salesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4 : 3,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: isDesktopWeb ? 12 : 9,
    paddingVertical: isDesktopWeb ? 9 : 6.75,
    borderRadius: 6,
  },
  salesBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  salesModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: isDesktopWeb ? 8 : 6 },
  salesKpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 8 : 6, marginBottom: isDesktopWeb ? 12 : 9 },
  salesKpiCard: { flexBasis: '47%', backgroundColor: COLORS.background, borderRadius: 8, padding: isDesktopWeb ? 10 : 7.5 },
  salesKpiLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginBottom: isDesktopWeb ? 4 : 3 },
  salesKpiValue: { fontSize: 12, fontWeight: 'bold', color: COLORS.heading },
  salesSectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.heading, marginBottom: isDesktopWeb ? 8 : 6, marginTop: isDesktopWeb ? 4 : 3 },
  salesChartCard: { backgroundColor: COLORS.background, borderRadius: 8, padding: isDesktopWeb ? 12 : 9, marginBottom: isDesktopWeb ? 12 : 9, alignItems: 'center' },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: isDesktopWeb ? 8 : 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  monthLabel: { fontSize: 12, fontWeight: '600', color: COLORS.heading, flex: 1 },
  monthOrders: { fontSize: 12, color: COLORS.muted, marginRight: isDesktopWeb ? 12 : 9 },
  monthRevenue: { fontSize: 12, fontWeight: '700', color: COLORS.superAdmin },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 12, width: '100%', maxWidth: 520, overflow: 'hidden' },
  modalTitle: { fontSize: 14, fontWeight: '700', color: COLORS.heading, marginBottom: 3, flexShrink: 1 },
  modalSubtitle: { fontSize: 12, color: COLORS.muted, marginBottom: 9 },
  planOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  planOptionText: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  cycleToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 3,
    gap: 3,
    marginBottom: 6,
  },
  cycleOption: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 6 },
  cycleOptionActive: { backgroundColor: COLORS.superAdmin },
  cycleOptionText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  cycleOptionTextActive: { color: '#FFFFFF' },
  cycleHint: { fontSize: 11, color: COLORS.muted, lineHeight: 15, marginBottom: 3 },
  modalCancelBtn: { marginTop: 9, alignItems: 'center', paddingVertical: 7.5 },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
});
