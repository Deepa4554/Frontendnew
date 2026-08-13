import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { InitialsAvatar } from '../../../../../shared/components/InitialsAvatar';
import { useAllPerformance } from '../../../../../core/api/hooks/useStaff';
import { SkeletonStatRow, SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const PERIODS = ['Today', 'This Week', 'This Month', 'All Time'] as const;
type Period = (typeof PERIODS)[number];

// Local device time is treated as IST (this app is India-only, same assumption
// used elsewhere — see DaypartBuckets) — "today"/"this week"/"this month" mean
// the cafe's own calendar day, not a UTC one.
const periodBounds = (period: Period): { start?: string; end?: string } => {
  if (period === 'All Time') return {};
  const now = new Date();
  const end = now.toISOString();
  let start: Date;
  if (period === 'Today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'This Week') {
    const daysSinceMonday = (now.getDay() + 6) % 7;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { start: start.toISOString(), end };
};

export const PerformanceReportsScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('This Month');
  const { start, end } = useMemo(() => periodBounds(period), [period]);
  const { data: rows = [], isLoading, isError, refetch } = useAllPerformance(start, end);

  // Roles that never ring up an order (Chef, KitchenStaff, ...) would otherwise
  // sit at the bottom of a "by revenue" leaderboard forever at ₹0 — only staff
  // with real activity this period belong in the ranking.
  const activeRows = rows.filter((r) => r.totalOrders > 0);

  const totalOrders = rows.reduce((sum, r) => sum + r.totalOrders, 0);
  const totalRevenue = rows.reduce((sum, r) => sum + r.totalRevenue, 0);
  const withAttendance = rows.filter((r) => r.attendanceRatePct != null);
  const avgAttendance = withAttendance.length
    ? withAttendance.reduce((sum, r) => sum + (r.attendanceRatePct ?? 0), 0) / withAttendance.length
    : null;

  const kpis = [
    { label: 'Total Orders Handled', value: totalOrders.toString() },
    { label: 'Total Revenue Generated', value: `₹${totalRevenue.toFixed(2)}` },
    { label: 'Avg Attendance', value: avgAttendance != null ? `${avgAttendance.toFixed(0)}%` : '—' },
  ];

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="chart-line" title="Performance Reports" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => navigation?.goBack?.()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Performance Reports</Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodRow}>
        {PERIODS.map((p) => {
          const active = p === period;
          return (
            <TouchableOpacity
              key={p}
              style={[styles.periodPill, active && styles.periodPillActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, active && styles.periodTextActive]}>{p}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {isError && rows.length === 0 ? (
          <ErrorState
            title="Couldn't load performance reports"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <View style={{ paddingHorizontal: 16 }}>
            <SkeletonStatRow count={3} />
            <View style={{ marginTop: 20 }}>
              <SkeletonList rows={4} />
            </View>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="chart-line" size={28} color={COLORS.muted} />
            <Text style={styles.emptyText}>No staff performance yet.</Text>
            <Text style={styles.emptyHint}>Numbers show up here once staff with app logins start ringing up orders.</Text>
          </View>
        ) : (
          <>
            <View style={styles.kpiGrid}>
              {kpis.map((k) => (
                <View key={k.label} style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{k.label}</Text>
                  <Text style={styles.kpiValue}>{k.value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <View style={styles.leaderHead}>
                <Text style={styles.cardTitle}>Staff Leaderboard</Text>
                <Text style={styles.topPerformers}>BY REVENUE</Text>
              </View>
              {activeRows.length === 0 ? (
                <Text style={styles.emptyHint}>No orders served in this period yet.</Text>
              ) : (
                activeRows.map((r, i) => (
                  <View key={r.staffId} style={styles.leaderRow}>
                    <View style={styles.leaderAvatarWrap}>
                      <InitialsAvatar name={r.staffName} size={44} />
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankText}>{i + 1}</Text>
                      </View>
                    </View>
                    <View style={styles.leaderInfo}>
                      <Text style={styles.leaderName}>{r.staffName}</Text>
                      <Text style={styles.leaderSpeed}>
                        {r.staffRole} · {r.totalOrders} orders
                        {r.attendanceRatePct != null ? ` · ${r.attendanceRatePct.toFixed(0)}% attendance` : ''}
                      </Text>
                    </View>
                    <View style={styles.leaderRight}>
                      <Text style={styles.upsellLabel}>Revenue</Text>
                      <Text style={styles.upsellValue}>₹{r.totalRevenue.toFixed(0)}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 12 : 12, paddingTop: isDesktopWeb ? 9 : 9, paddingBottom: isDesktopWeb ? 9 : 9, gap: isDesktopWeb ? 6 : 6 },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  periodRow: { paddingHorizontal: isDesktopWeb ? 12 : 12, gap: isDesktopWeb ? 7 : 7.5, marginBottom: isDesktopWeb ? 9 : 9 },
  periodPill: { paddingHorizontal: isDesktopWeb ? 12 : 12, paddingVertical: isDesktopWeb ? 7 : 6.75, borderRadius: 18, backgroundColor: COLORS.cardAlt },
  periodPillActive: { backgroundColor: COLORS.button },
  periodText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '600', color: COLORS.muted },
  periodTextActive: { color: '#FFFFFF' },
  emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 42 : 45, gap: isDesktopWeb ? 6 : 6, paddingHorizontal: isDesktopWeb ? 22 : 22.5 },
  emptyText: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '600', color: COLORS.heading, textAlign: 'center' },
  emptyHint: { fontSize: 12, color: COLORS.muted, textAlign: 'center' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: isDesktopWeb ? 12 : 12, gap: isDesktopWeb ? 9 : 9, marginBottom: isDesktopWeb ? 12 : 12 },
  kpiCard: { width: '47.5%', flexGrow: 1, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 12 : 12 },
  kpiLabel: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 4 : 4.5 },
  kpiValue: { fontSize: isDesktopWeb ? 22 : 12, fontWeight: 'bold', color: COLORS.heading },
  card: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 12 : 12, borderRadius: 8, padding: isDesktopWeb ? 13 : 13.5, marginBottom: isDesktopWeb ? 12 : 12 },
  cardTitle: { fontSize: isDesktopWeb ? 19 : 14, fontWeight: 'bold', color: COLORS.heading },
  leaderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 10 : 10.5 },
  topPerformers: { fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 0.5 },
  leaderRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 9 : 9, paddingVertical: isDesktopWeb ? 6 : 6 },
  leaderAvatarWrap: { position: 'relative' },
  leaderAvatar: { width: 44, height: 44, borderRadius: 22 },
  rankBadge: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.button,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.cardAlt,
  },
  rankText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  leaderInfo: { flex: 1 },
  leaderName: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  leaderSpeed: { fontSize: 12, color: COLORS.muted, marginTop: 1.5 },
  leaderRight: { alignItems: 'flex-end' },
  upsellLabel: { fontSize: 11, color: COLORS.accent, marginBottom: 1.5 },
  upsellValue: { fontSize: 12, fontWeight: 'bold', color: COLORS.heading },
});
