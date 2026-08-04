import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { LineChart } from 'react-native-gifted-charts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { useInventory, useRestockInventoryItem } from '../../../../core/api/hooks/useInventory';
import { useSalesForecast } from '../../../../core/api/hooks/useDashboard';
import { useShiftOptimization } from '../../../../core/api/hooks/useStaff';
import { showToast } from '../../../../core/store/uiSlice';
import { SkeletonList, SkeletonStatRow } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';

const CHART_WIDTH = Dimensions.get('window').width - 96;

export const AIAssistantScreen = () => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { data: inventory = [] } = useInventory();
  const restockItem = useRestockInventoryItem();
  const dispatch = useDispatch();
  const { data: forecastData, isLoading: forecastLoading, isError: forecastError, refetch: refetchForecast } = useSalesForecast(7);
  const { data: shiftOpt, isLoading: shiftOptLoading, isError: shiftOptError, refetch: refetchShiftOpt } = useShiftOptimization();

  const loading = forecastLoading || shiftOptLoading;
  const hasError = forecastError || shiftOptError;
  const forecast = (forecastData?.forecast ?? []).map((f) => ({ value: f.predictedRevenue, label: f.date }));

  // Depletion risk is derived live from the same Inventory data the Inventory screen
  // edits — a real deterministic formula on real numbers, not a trained model. "AI"
  // here means "computed insight", same honesty as the forecast/shift-optimization below.
  const risks = inventory
    .map((item) => {
      const ratio = item.current / item.max;
      const daysUntilDepleted = item.dailyUsage > 0 ? Math.round((item.current / item.dailyUsage) * 10) / 10 : 99;
      const confidence = Math.min(0.97, Math.max(0.55, 1 - ratio));
      return { id: item.id, itemName: item.name, daysUntilDepleted, confidence, ratio };
    })
    .filter((r) => r.ratio <= 0.5)
    .sort((a, b) => a.ratio - b.ratio);

  const projected = forecast.reduce((sum, f) => sum + f.value, 0);

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="creation" title="AI Assistant" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          {/* This screen used to live on its own bottom tab (no "back" to go to) — now
              that Token Orders has that slot, it's reachable via More/the desktop
              sidebar instead, so mobile needs an explicit way back. Desktop keeps its
              own sidebar for navigation, same as Dashboard/Menu/Inventory's screens. */}
          {!isDesktopWeb && (
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
              <Icon name="arrow-left" size={20} color={COLORS.heading} />
            </TouchableOpacity>
          )}
          <View style={styles.headerIcon}>
            <Icon name="creation" size={20} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandTitle}>AI Assistant</Text>
            <Text style={styles.brandSubtitle}>Operations intelligence</Text>
          </View>
          <TouchableOpacity onPress={() => { refetchForecast(); refetchShiftOpt(); }} style={styles.refreshBtn}>
            <Icon name="refresh" size={20} color={COLORS.heading} />
          </TouchableOpacity>
        </View>
      )}

      {hasError && !forecastData && !shiftOpt ? (
        <ErrorState
          title="Couldn't load AI insights"
          message="Check your connection and try again."
          onRetry={() => { refetchForecast(); refetchShiftOpt(); }}
        />
      ) : loading ? (
        <View style={{ padding: 16 }}>
          <SkeletonStatRow count={2} style={{ marginBottom: 20 }} />
          <SkeletonList rows={4} avatar={false} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
          {/* Hero insight */}
          <View style={styles.heroCard}>
            <View style={styles.heroRow}>
              <Icon name="chart-line-variant" size={18} color={COLORS.accent} />
              <Text style={styles.heroLabel}>7-DAY PROJECTED REVENUE</Text>
            </View>
            <Text style={styles.heroValue}>₹{projected.toLocaleString('en-IN')}</Text>
            <Text style={styles.heroHint}>{forecastData?.method ?? 'Based on recent order history.'}</Text>
          </View>

          {/* Forecast chart */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.cardTitle}>Revenue Forecast</Text>
                <Text style={styles.cardSubtitle}>Trend line from real daily revenue</Text>
              </View>
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.livePillText}>LIVE</Text>
              </View>
            </View>
            {forecast.length > 0 && (
              <View style={styles.chartWrap}>
                <LineChart
                  data={forecast}
                  color={COLORS.accent}
                  thickness={3}
                  hideRules
                  yAxisColor="transparent"
                  xAxisColor={COLORS.divider}
                  yAxisTextStyle={{ color: COLORS.muted, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: COLORS.muted, fontSize: 9 }}
                  isAnimated
                  width={CHART_WIDTH}
                  curved
                  hideDataPoints={false}
                  dataPointsColor={COLORS.accent}
                  startFillColor={COLORS.accent}
                  endFillColor={COLORS.card}
                  startOpacity={0.35}
                  endOpacity={0.02}
                  areaChart
                  yAxisLabelPrefix="₹"
                />
              </View>
            )}
          </View>

          {/* Shift optimization — real Shift data compared against typical order demand */}
          <Text style={styles.sectionTitle}>Shift Optimization</Text>
          {(shiftOpt?.suggestions ?? []).map((suggestion, idx) => (
            <View key={idx} style={styles.suggestionCard}>
              <View style={styles.suggestionIcon}>
                <Icon name="lightbulb-on-outline" size={18} color={COLORS.accent} />
              </View>
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </View>
          ))}
          {!!shiftOpt?.windows?.length && (
            <View style={styles.windowsRow}>
              {shiftOpt.windows.map((w) => (
                <View
                  key={w.label}
                  style={[
                    styles.windowChip,
                    w.status === 'Understaffed' && styles.windowChipDanger,
                    w.status === 'Overstaffed' && styles.windowChipWarning,
                  ]}
                >
                  <Text style={styles.windowChipTime}>{w.label}</Text>
                  <Text style={styles.windowChipMeta}>{w.staffScheduled} staff · ~{w.orderCount} orders</Text>
                </View>
              ))}
            </View>
          )}

          {/* Inventory risk — live from the Inventory screen's stock levels */}
          <Text style={styles.sectionTitle}>Inventory Depletion Risk</Text>
          {risks.length === 0 && (
            <View style={styles.riskCard}>
              <View style={[styles.riskIcon, { backgroundColor: COLORS.successBg }]}>
                <Icon name="check-circle-outline" size={18} color={COLORS.success} />
              </View>
              <Text style={styles.riskName}>All stock levels are healthy right now.</Text>
            </View>
          )}
          {risks.map((risk) => (
            <View key={risk.id} style={styles.riskCard}>
              <View style={styles.riskIcon}>
                <Icon name="alert-outline" size={18} color={COLORS.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.riskName}>{risk.itemName}</Text>
                <Text style={styles.riskDesc}>
                  Depletes in {risk.daysUntilDepleted} days · {(risk.confidence * 100).toFixed(0)}% confidence
                </Text>
              </View>
              <TouchableOpacity
                style={styles.reorderBtn}
                onPress={() => {
                  const item = inventory.find((i) => i.id === risk.id);
                  if (!item) return;
                  const quantity = Math.max(0, item.max - item.current);
                  if (quantity <= 0) return;
                  restockItem.mutate({ id: risk.id, req: { quantity } });
                  dispatch(showToast({ message: `${risk.itemName} has been restocked to full capacity.`, icon: 'check-circle', tone: 'success' }));
                }}
              >
                <Text style={styles.reorderText}>Reorder</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 9 : 9,
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingTop: isDesktopWeb ? 10 : 10.5,
    paddingBottom: isDesktopWeb ? 10 : 10.5,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.aiCardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: isDesktopWeb ? 20 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  brandSubtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 1 : 0.75,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: isDesktopWeb ? 12 : 12,
    fontSize: isDesktopWeb ? 14 : 12,
    color: COLORS.muted,
  },
  heroCard: {
    backgroundColor: COLORS.aiCardBg,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 13 : 13.5,
    borderRadius: 8,
    padding: isDesktopWeb ? 13 : 13.5,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 6,
    marginBottom: isDesktopWeb ? 7 : 7.5,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: COLORS.accent,
  },
  heroValue: {
    fontSize: isDesktopWeb ? 34 : 12,
    fontWeight: '800',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 4 : 4.5,
  },
  heroHint: {
    fontSize: isDesktopWeb ? 13 : 12,
    color: COLORS.heading,
    opacity: 0.75,
    lineHeight: 18,
  },
  card: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 16 : 16.5,
    borderRadius: 8,
    padding: isDesktopWeb ? 13 : 13.5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  cardTitle: {
    fontSize: isDesktopWeb ? 17 : 14,
    fontWeight: '700',
    color: COLORS.heading,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 2 : 1.5,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4 : 3.75,
    backgroundColor: COLORS.successBg,
    paddingHorizontal: isDesktopWeb ? 8 : 7.5,
    paddingVertical: isDesktopWeb ? 4 : 3.75,
    borderRadius: 20,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  livePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.success,
    letterSpacing: 0.5,
  },
  chartWrap: {
    marginTop: isDesktopWeb ? 7 : 7.5,
    alignItems: 'center',
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: isDesktopWeb ? 18 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 9 : 9,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: isDesktopWeb ? 9 : 9,
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 7 : 7.5,
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 10.5,
  },
  suggestionIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: COLORS.aiCardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionText: {
    flex: 1,
    fontSize: isDesktopWeb ? 14 : 12,
    color: COLORS.heading,
    lineHeight: 20,
  },
  windowsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: isDesktopWeb ? 6 : 6,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 16 : 16.5,
  },
  windowChip: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 12,
    paddingHorizontal: isDesktopWeb ? 9 : 9,
    paddingVertical: isDesktopWeb ? 6 : 6,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  windowChipDanger: {
    borderColor: COLORS.dangerAccent,
    backgroundColor: COLORS.dangerBg,
  },
  windowChipWarning: {
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warningBg,
  },
  windowChipTime: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  windowChipMeta: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 1 : 0.75,
  },
  riskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 9 : 9,
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 7 : 7.5,
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 10.5,
  },
  riskIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: COLORS.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  riskDesc: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 1.5,
  },
  reorderBtn: {
    backgroundColor: COLORS.button,
    paddingHorizontal: 12,
    paddingVertical: 6.75,
    borderRadius: 6,
  },
  reorderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
