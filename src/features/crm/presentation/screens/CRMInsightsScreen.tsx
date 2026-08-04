import React from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useCrmInsights } from '../../../../core/api/hooks/useCustomers';
import { SkeletonList, SkeletonStatRow } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';

const SEGMENT_ICONS: Record<string, string> = {
  'Frequent Visitors': 'star-outline',
  'New Customers': 'account-plus-outline',
  'At Risk': 'alert-outline',
};

export const CRMInsightsScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const SEGMENT_ICON_BG: Record<string, string> = {
    'Frequent Visitors': COLORS.vibeCrema,
    'New Customers': COLORS.proTipBg,
    'At Risk': COLORS.dangerBg,
  };
  const { data, isLoading, isError, refetch } = useCrmInsights();

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="chart-box-outline" title="Insights" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Icon name="chart-line" size={26} color={COLORS.accent} />
          <Text style={styles.headerTitle}>Insights</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.iconBtn}>
            <Icon name="storefront-outline" size={22} color={COLORS.heading} />
          </TouchableOpacity>
        </View>
      )}

      {isError && !data ? (
        <ErrorState
          title="Couldn't load insights"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : isLoading || !data ? (
        <View style={{ padding: 16 }}>
          <SkeletonStatRow count={2} style={{ marginBottom: 20 }} />
          <SkeletonList rows={4} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.kpiRow}>
            <View style={styles.kpiCard}>
              <View style={styles.kpiTopRow}>
                <Icon name="account-check-outline" size={18} color={COLORS.heading} />
              </View>
              <Text style={styles.kpiLabel}>RETENTION RATE</Text>
              <Text style={styles.kpiValue}>{data.retentionRatePct.toFixed(1)}%</Text>
            </View>
            <View style={styles.kpiCard}>
              <View style={styles.kpiTopRow}>
                <Icon name="cash-multiple" size={18} color={COLORS.heading} />
              </View>
              <Text style={styles.kpiLabel}>AVG. LIFETIME VALUE</Text>
              <Text style={styles.kpiValue}>₹{data.avgLifetimeValue.toFixed(2)}</Text>
            </View>
          </View>

          {/* Growth chart — real new-vs-returning customers per day, last 7 days */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View>
                <Text style={styles.chartTitle}>Customer Growth</Text>
                <Text style={styles.chartSub}>New vs. Returning · last 7 days</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: COLORS.heading }]} />
                  <Text style={styles.legendText}>New</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: COLORS.vibeCrema }]} />
                  <Text style={styles.legendText}>Returning</Text>
                </View>
              </View>
            </View>
            {data.growth.every((g) => g.newCustomers === 0 && g.returningCustomers === 0) ? (
              <Text style={styles.emptyText}>No customer visits recorded in the last 7 days yet.</Text>
            ) : (
              <LineChart
                data={data.growth.map((g) => ({ value: g.newCustomers }))}
                data2={data.growth.map((g) => ({ value: g.returningCustomers }))}
                color1={COLORS.heading}
                color2={COLORS.vibeCrema}
                thickness={3}
                hideRules
                hideYAxisText
                hideAxesAndRules
                curved
                isAnimated
                width={280}
                height={130}
                xAxisLabelTexts={data.growth.map((g) => g.day)}
                xAxisLabelTextStyle={{ color: COLORS.muted, fontSize: 10 }}
              />
            )}
          </View>

          {/* Redemption trends — real coupon issue/redeem counts */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Coupon Redemption Trends</Text>
            {data.redemption.length === 0 ? (
              <Text style={styles.emptyText}>No coupons issued yet.</Text>
            ) : (
              <View style={styles.redemptionRow}>
                {data.redemption.map((r) => (
                  <View key={r.title} style={styles.redemptionCol}>
                    <View style={styles.redemptionTrack}>
                      <View style={[styles.redemptionFill, { height: `${Math.max(4, r.pct)}%` }]} />
                    </View>
                    <Text style={styles.redemptionLabel} numberOfLines={2}>{r.title}</Text>
                    <Text style={styles.redemptionPct}>{r.pct}%</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.segHeader}>
            <Icon name="account-group-outline" size={18} color={COLORS.accent} />
            <Text style={styles.segTitle}>Customer Segments</Text>
          </View>

          {data.segments.map((s) => (
            <View key={s.name} style={styles.segCard}>
              <View style={[styles.segIcon, { backgroundColor: SEGMENT_ICON_BG[s.name] ?? COLORS.chipBg }]}>
                <Icon name={SEGMENT_ICONS[s.name] ?? 'account-outline'} size={24} color={COLORS.heading} />
              </View>
              <View style={styles.segInfo}>
                <Text style={styles.segName}>{s.name}</Text>
                <Text style={styles.segDesc}>{s.description}</Text>
                <View style={styles.segTags}>
                  {s.tags.map((t) => (
                    <View key={t} style={styles.segTag}>
                      <Text style={styles.segTagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.segCount}>{s.customerCount}</Text>
                {s.customerCount > 0 && <Text style={styles.segAvg}>avg ₹{s.avgSpent.toFixed(0)}</Text>}
              </View>
            </View>
          ))}

          {data.suggestions.map((suggestion, i) => (
            <View key={i} style={styles.suggestionCard}>
              <View style={styles.suggestionIcon}>
                <Icon name="lightbulb-on-outline" size={20} color={COLORS.vibeCrema} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestionTitle}>Suggested Action</Text>
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
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
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  kpiRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 12 : 12, gap: isDesktopWeb ? 9 : 9, marginBottom: isDesktopWeb ? 12 : 12 },
  kpiCard: { flex: 1, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 11 : 10.5 },
  kpiTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 9 : 9 },
  kpiLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginBottom: isDesktopWeb ? 4 : 3 },
  kpiValue: { fontSize: isDesktopWeb ? 22 : 12, fontWeight: 'bold', color: COLORS.heading },
  chartCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 14 : 13.5,
    marginBottom: isDesktopWeb ? 12 : 12,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isDesktopWeb ? 9 : 9 },
  chartTitle: { fontSize: isDesktopWeb ? 17 : 14, fontWeight: '700', color: COLORS.heading },
  chartSub: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  legendRow: { flexDirection: 'row', gap: isDesktopWeb ? 9 : 9 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 5 : 3.75 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: COLORS.heading },
  emptyText: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, marginTop: isDesktopWeb ? 6 : 6 },
  redemptionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 150, marginTop: isDesktopWeb ? 9 : 9 },
  redemptionCol: { flex: 1, alignItems: 'center' },
  redemptionTrack: { width: 26, height: 90, justifyContent: 'flex-end', backgroundColor: COLORS.background, borderRadius: 8, overflow: 'hidden' },
  redemptionFill: { width: '100%', backgroundColor: COLORS.vibeCrema, borderRadius: 8 },
  redemptionLabel: { fontSize: 9, color: COLORS.muted, textAlign: 'center', marginTop: isDesktopWeb ? 6 : 6, maxWidth: 60 },
  redemptionPct: { fontSize: 11, fontWeight: '700', color: COLORS.heading, marginTop: isDesktopWeb ? 2 : 1.5 },
  segHeader: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 6, paddingHorizontal: isDesktopWeb ? 12 : 12, marginBottom: isDesktopWeb ? 9 : 9, marginTop: isDesktopWeb ? 4 : 3 },
  segTitle: { fontSize: isDesktopWeb ? 17 : 14, fontWeight: 'bold', color: COLORS.heading },
  segCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 9 : 9,
    gap: isDesktopWeb ? 11 : 10.5,
  },
  segIcon: { width: 52, height: 52, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segInfo: { flex: 1 },
  segName: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: '700', color: COLORS.heading, marginBottom: isDesktopWeb ? 3 : 2.25 },
  segDesc: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, lineHeight: 18, marginBottom: isDesktopWeb ? 6 : 6 },
  segTags: { flexDirection: 'row', gap: isDesktopWeb ? 6 : 6 },
  segTag: { backgroundColor: COLORS.proTipBg, paddingHorizontal: isDesktopWeb ? 6 : 6, paddingVertical: isDesktopWeb ? 3 : 2.25, borderRadius: 8 },
  segTagText: { fontSize: 9, fontWeight: '700', color: COLORS.accent },
  segCount: { fontSize: 12, fontWeight: '800', color: COLORS.heading },
  segAvg: { fontSize: 10, color: COLORS.muted, marginTop: 1.5 },
  suggestionCard: {
    flexDirection: 'row',
    gap: 9,
    backgroundColor: COLORS.heading,
    marginHorizontal: 12,
    borderRadius: 8,
    padding: 13.5,
    marginTop: 6,
  },
  suggestionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionTitle: { fontSize: 14, fontWeight: '700', color: '#E8C7A0', marginBottom: 3 },
  suggestionText: { fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 19 },
});
