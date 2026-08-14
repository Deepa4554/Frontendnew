import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { RootState } from '../../../../../core/store/rootReducer';
import { ReportExportService, ReportDefinition } from '../../../../../core/utils/reportExport';
import { useDashboardAnalytics } from '../../../../../core/api/hooks/useDashboard';
import { useSettings } from '../../../../../core/api/hooks/useSettings';
import { ScreenContainer } from '../../../../../core/components/ScreenContainer';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { SkeletonStatRow, SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { GlobalSearchTrigger } from '../../../../../shared/components/search/GlobalSearchTrigger';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';
import { DateRangeFilter, RangePreset, rangeForPreset, rangeLabelFor } from '../../../../../shared/components/reports/DateRangeFilter';

/**
 * Full-width, one-at-a-time card pager for the stat cards (Revenue, Sales,
 * Avg Order Value) — swiping past the last card wraps to the first and vice
 * versa. Achieved with the standard clone-first/clone-last trick: an extra copy of the
 * last card is prepended and a copy of the first is appended, so a swipe off either end
 * lands on a clone, which is then silently (unanimated) snapped back to the matching
 * real card underneath the user's finger.
 */
const StatCarousel = ({ cards, styles }: { cards: React.ReactNode[]; styles: ReturnType<typeof makeStyles> }) => {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = cards.length;
  const looped = [cards[count - 1], ...cards, cards[0]];

  useEffect(() => {
    if (width > 0) scrollRef.current?.scrollTo({ x: width * (index + 1), animated: false });
    // Only re-sync on width change (e.g. web window resize) — re-running on `index`
    // would fight the user's own swipe by re-scrolling on every page change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth((prev) => (prev !== w ? w : prev));
  };

  const settleAt = (offsetX: number) => {
    if (!width) return;
    // Mid-scroll offsets (between page boundaries) mean the user is still dragging
    // or the snap animation is still running — only act once we're ON a page.
    const loopedIndex = offsetX / width;
    if (Math.abs(loopedIndex - Math.round(loopedIndex)) > 0.02) return;
    let page = Math.round(loopedIndex);
    if (page === 0) {
      page = count;
      scrollRef.current?.scrollTo({ x: width * page, animated: false });
    } else if (page === count + 1) {
      page = 1;
      scrollRef.current?.scrollTo({ x: width * page, animated: false });
    }
    setIndex(page - 1);
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    settleAt(e.nativeEvent.contentOffset.x);

  // react-native-web doesn't reliably fire onMomentumScrollEnd for mouse/trackpad
  // scrolls, so the clone->real snap-back never ran on web and the carousel
  // dead-ended on the cloned edge slides. Debounce plain onScroll instead: when no
  // scroll event has arrived for 80ms, CSS snap has settled — run the same logic.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => settleAt(x), 80);
  };

  return (
    <View onLayout={onLayout}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {width > 0 &&
          looped.map((card, i) => (
            <View key={i} style={{ width }}>
              {card}
            </View>
          ))}
      </ScrollView>
      <View style={styles.carouselDots}>
        {cards.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
};

/** Small bar-style trend indicator for the top stat cards, built from the same
 * weekly revenue series that drives the Daily Performance chart below — real
 * data, not a decorative fake line. */
const WeeklySparkline = ({ weekly, max, color, styles }: {
  weekly: { revenue: number }[];
  max: number;
  color: string;
  styles: ReturnType<typeof makeStyles>;
}) => {
  // `weekly` is scoped to whatever date range is selected up top (see
  // DashboardController.daySpan) — a single-day range like "Today" hands back
  // exactly one entry, and one bar with flex:1 filling the fixed-size box just
  // reads as a solid colored rectangle, not a trend. Nothing meaningful to show
  // a trend with one point, so skip the box entirely rather than draw that.
  if (weekly.length < 2) return null;
  return (
    <View style={styles.sparkline}>
      {weekly.map((d, i) => (
        <View
          key={i}
          style={[styles.sparklineBar, { height: Math.max(3, (d.revenue / max) * 34), backgroundColor: color }]}
        />
      ))}
    </View>
  );
};

/**
 * Real desktop-width browsers get the whole dashboard laid out to exactly fill
 * the viewport (stat row + two flex rows below it share the remaining height,
 * see `desktopBody`/`midRow`/`bottomRow` in makeStyles) — no ScrollView, so
 * nothing scrolls. Mobile and tablet-width browsers keep the original
 * scrolling stack, since their content doesn't fit above the fold.
 */
const Body = ({ isDesktop, style, children }: { isDesktop: boolean; style?: any; children: React.ReactNode }) =>
  isDesktop ? (
    <View style={style}>{children}</View>
  ) : (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
      {children}
    </ScrollView>
  );

export const DashboardScreen = () => {
  const dispatch = useDispatch();
  const navigation = useNavigation<any>();
  const COLORS = useThemeColors();
  const { isDesktopWeb, isTablet } = useResponsive();
  // A tablet-width browser still gets the isDesktopWeb "Warm Precision" visual
  // layer but keeps the scrolling mobile-style stack — only a real desktop-width
  // browser gets the fixed, non-scrolling, fill-the-viewport grid below.
  const isDesktop = isDesktopWeb && !isTablet;
  const insets = useSafeAreaInsets();
  const styles = makeStyles(COLORS, isDesktopWeb, isDesktop);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const [preset, setPreset] = useState<RangePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range = rangeForPreset(preset, customFrom, customTo);
  const rangeLabel = rangeLabelFor(preset, customFrom, customTo);
  // null = "All Branches" (the default) — same app-wide selection Inventory/Orders/
  // Reports read, set from Cafe Settings > Active Branch.
  const activeBranchId = useSelector((s: RootState) => s.branch.activeBranchId);
  const { data, isLoading, isError, refetch } = useDashboardAnalytics({ ...range, branchId: activeBranchId });
  const { data: settings } = useSettings();

  const buildReportDefinition = (d: NonNullable<typeof data>): ReportDefinition => ({
    title: 'Dashboard',
    businessName: settings?.businessName ?? 'PrabandhOS',
    dateRangeLabel: rangeLabel,
    sections: [
      {
        title: 'Key performance indicators',
        columns: [
          { key: 'metric', label: 'Metric' },
          { key: 'value', label: 'Value', align: 'right' },
        ],
        rows: [
          { metric: 'Revenue (selected range)', value: d.revenue },
          { metric: 'Previous period revenue', value: d.previousPeriodRevenue },
          { metric: 'Sales (paid tickets)', value: d.salesCount },
          { metric: 'Average order value', value: d.avgOrderValue },
          { metric: 'GST collected', value: d.gstCollected },
          { metric: 'Refunds', value: d.refundsTotal },
          { metric: 'Inventory value', value: d.inventoryValue },
          { metric: "Today's revenue", value: d.todayRevenue },
          { metric: "Today's paid tickets", value: d.todaySalesCount },
        ],
      },
      {
        title: 'Daily performance',
        columns: [{ key: 'day', label: 'Day' }, { key: 'revenue', label: 'Revenue', align: 'right' }],
        rows: d.weekly.map((w) => ({ day: w.day, revenue: w.revenue })),
      },
      {
        title: 'Peak hours',
        columns: [{ key: 'time', label: 'Hour' }, { key: 'orderCount', label: 'Orders', align: 'right' }],
        rows: d.peakHours.map((h) => ({ time: h.time, orderCount: h.orderCount })),
      },
      {
        title: 'Top selling items',
        columns: [{ key: 'name', label: 'Item' }, { key: 'qty', label: 'Qty sold', align: 'right' }],
        rows: d.topItems.map((i) => ({ name: i.name, qty: i.qty })),
      },
    ],
  });

  const handleExportPdf = async () => {
    if (!data) return;
    setExporting('pdf');
    try {
      await ReportExportService.exportToPDF(buildReportDefinition(data));
    } catch (e: any) {
      dispatch(showToast({ message: e?.message ?? 'Could not build the PDF report.', icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setExporting(null);
    }
  };

  const handleExportExcel = async () => {
    if (!data) return;
    setExporting('excel');
    try {
      await ReportExportService.exportToExcel(buildReportDefinition(data));
    } catch (e: any) {
      dispatch(showToast({ message: e?.message ?? 'Could not build the Excel report.', icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setExporting(null);
    }
  };

  if (isError && !data) {
    return (
      <View style={styles.container}>
        <ErrorState
          title="Couldn't load dashboard"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  if (isLoading || !data) {
    return (
      <View style={styles.container}>
        <View style={{ padding: 8 }}>
          <SkeletonStatRow count={4} style={{ marginBottom: 10 }} />
          <SkeletonList rows={4} />
        </View>
      </View>
    );
  }

  const trendPct = data.previousPeriodRevenue > 0
    ? ((data.revenue - data.previousPeriodRevenue) / data.previousPeriodRevenue) * 100
    : 0;
  const maxWeekly = Math.max(1, ...data.weekly.map((d) => d.revenue));
  const peakDay = data.weekly.reduce((best, d) => (d.revenue > best.revenue ? d : best), data.weekly[0]);

  return (
    <View style={styles.container}>
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="view-dashboard" size={22} color={COLORS.accent} />
          <Text style={styles.brandTitle} numberOfLines={1}>Dashboard</Text>
          <GlobalSearchTrigger navigation={navigation} style={styles.headerIconBtn} />
        </View>
      )}
      <DesktopPageHeader
        icon="view-dashboard"
        title="Dashboard"
        right={(
          <>
            <DateRangeFilter
              preset={preset}
              customFrom={customFrom}
              customTo={customTo}
              onChange={(p, f, t) => { setPreset(p); setCustomFrom(f); setCustomTo(t); }}
            />
            <TouchableOpacity style={styles.headerExportBtn} onPress={handleExportPdf} disabled={exporting !== null}>
              {exporting === 'pdf' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="file-pdf-box" size={16} color="#FFFFFF" />
              )}
              <Text style={styles.headerExportText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.headerExportBtn, styles.headerExportExcelBtn]} onPress={handleExportExcel} disabled={exporting !== null}>
              {exporting === 'excel' ? (
                <ActivityIndicator size="small" color={COLORS.heading} />
              ) : (
                <Icon name="grid" size={16} color={COLORS.heading} />
              )}
              <Text style={[styles.headerExportText, styles.headerExportExcelText]}>Excel</Text>
            </TouchableOpacity>
          </>
        )}
      />

      <ScreenContainer maxWidth={isDesktopWeb ? 1280 : 900} style={{ flex: 1, width: '100%', alignSelf: 'center', minHeight: 0 }}>
      <Body isDesktop={isDesktop} style={isDesktop ? styles.desktopBody : undefined}>
        {!isDesktopWeb && (
          <View style={{ paddingHorizontal: 6, marginBottom: 6 }}>
            <DateRangeFilter
              preset={preset}
              customFrom={customFrom}
              customTo={customTo}
              onChange={(p, f, t) => { setPreset(p); setCustomFrom(f); setCustomTo(t); }}
            />
          </View>
        )}

        {/* The 3-up row packs a fixed-width icon circle + label/value + fixed-width sparkline
            into each card — real desktop has room for that; a tablet-width browser doesn't,
            and the label text collapsed to a sliver narrow enough to wrap character-by-character
            ("REVE"/"NUE"). Tablet falls back to the same swipeable single-card carousel mobile
            already uses instead of forcing three cards into a too-narrow row. */}
        {isDesktop ? (
          <View style={styles.statsRow}>
            <View style={[styles.revenueCard, styles.statCardFlex]}>
              <View style={styles.revenueCardHeaderRow}>
                <View style={styles.statIconCircle}>
                  <Icon name="currency-inr" size={20} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardLabel}>REVENUE ({rangeLabel.toUpperCase()})</Text>
                  <Text style={styles.revenueValue}>₹{data.revenue.toFixed(2)}</Text>
                </View>
                <WeeklySparkline weekly={data.weekly} max={maxWeekly} color={trendPct >= 0 ? COLORS.accent : COLORS.dangerAccent} styles={styles} />
              </View>
              <View style={styles.trendRow}>
                <Icon name={trendPct >= 0 ? 'trending-up' : 'trending-down'} size={14} color={trendPct >= 0 ? COLORS.accent : COLORS.dangerAccent} />
                <Text style={[styles.trendText, trendPct < 0 && { color: COLORS.dangerAccent }]}>
                  {trendPct >= 0 ? '+' : ''}{trendPct.toFixed(1)}% vs previous period
                </Text>
              </View>
            </View>

            <View style={[styles.smallCard, styles.statCardFlex]}>
              <View style={styles.revenueCardHeaderRow}>
                <View style={styles.statIconCircle}>
                  <Icon name="shopping-outline" size={20} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardLabel}>SALES</Text>
                  <Text style={styles.smallCardValue}>{data.salesCount}</Text>
                  <Text style={styles.smallCardSub}>Paid Tickets</Text>
                </View>
                <WeeklySparkline weekly={data.weekly} max={maxWeekly} color={COLORS.accent} styles={styles} />
              </View>
            </View>
            <View style={[styles.smallCard, styles.accentCard, styles.statCardFlex]}>
              <View style={styles.revenueCardHeaderRow}>
                <View style={[styles.statIconCircle, { backgroundColor: '#FFFFFF' }]}>
                  <Icon name="receipt" size={20} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accentCardLabel}>AVG ORDER VALUE</Text>
                  <Text style={styles.accentCardValue}>₹{data.avgOrderValue.toFixed(2)}</Text>
                  <Text style={styles.accentCardSub}>Per ticket</Text>
                </View>
                <WeeklySparkline weekly={data.weekly} max={maxWeekly} color={COLORS.accent} styles={styles} />
              </View>
            </View>
          </View>
        ) : (
          <StatCarousel
            styles={styles}
            cards={[
              <View style={styles.fullCard}>
                <View style={styles.revenueCardHeaderRow}>
                  <Text style={styles.fullCardLabel}>REVENUE ({rangeLabel.toUpperCase()})</Text>
                </View>
                <Text style={styles.fullCardValue}>₹{data.revenue.toFixed(2)}</Text>
                <View style={styles.trendRow}>
                  <Icon name={trendPct >= 0 ? 'trending-up' : 'trending-down'} size={16} color={trendPct >= 0 ? COLORS.accent : COLORS.dangerAccent} />
                  <Text style={[styles.trendText, trendPct < 0 && { color: COLORS.dangerAccent }]}>
                    {trendPct >= 0 ? '+' : ''}{trendPct.toFixed(1)}% vs previous period
                  </Text>
                </View>
              </View>,
              <View style={styles.fullCard}>
                <Text style={styles.fullCardLabel}>SALES</Text>
                <Text style={styles.fullCardValue}>{data.salesCount}</Text>
                <Text style={styles.fullCardSub}>Paid Tickets</Text>
              </View>,
              <View style={[styles.fullCard, styles.fullAccentCard]}>
                <Text style={styles.accentCardLabel}>AVG ORDER VALUE</Text>
                <Text style={[styles.fullCardValue, { color: COLORS.accent }]}>₹{data.avgOrderValue.toFixed(2)}</Text>
                <Text style={styles.fullCardSub}>Per ticket</Text>
              </View>,
            ]}
          />
        )}

        <View style={styles.midRow}>
          <View style={[styles.chartCard, styles.midRowCard]}>
            <View style={styles.chartHeaderRow}>
              <Text style={styles.chartTitle}>DAILY PERFORMANCE</Text>
              <Text style={styles.periodPillText}>{rangeLabel}</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.barChartScroll}
              contentContainerStyle={styles.barChartRow}
            >
              {data.weekly.map((d, i) => {
                const isPeak = d.day === peakDay.day && d.revenue > 0;
                const pct = maxWeekly > 0 ? (d.revenue / maxWeekly) * 100 : 0;
                return (
                  <View key={`${d.day}-${i}`} style={styles.barColumn}>
                    {isPeak && <Text style={styles.peakLabel}>Peak</Text>}
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { height: `${pct}%`, minHeight: 4, backgroundColor: isPeak ? COLORS.heading : COLORS.inputBorder },
                        ]}
                      />
                    </View>
                    <Text style={styles.barDayLabel}>{d.day}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          <View style={[styles.chartCard, styles.midRowCard]}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconCircle}>
                <Icon name="clock-time-four-outline" size={16} color={COLORS.accent} />
              </View>
              <Text style={styles.chartTitle}>PEAK HOURS DENSITY</Text>
            </View>
            <View style={styles.peakHoursList}>
              {data.peakHours.map((h) => (
                <View key={h.time} style={styles.peakRow}>
                  <Text style={styles.peakTime}>{h.time}</Text>
                  <View style={styles.peakTrack}>
                    <View
                      style={[
                        styles.peakFill,
                        { width: `${h.pctOfPeak}%`, backgroundColor: h.pctOfPeak >= 90 ? COLORS.heading : COLORS.aiCardBg },
                      ]}
                    />
                  </View>
                  <Text style={styles.peakPct}>{h.orderCount}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.bottomRow}>
          {data.topItems.length > 0 && (
            <View style={[styles.chartCard, styles.bottomRowCard]}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionIconCircle}>
                  <Icon name="chart-bar" size={16} color={COLORS.accent} />
                </View>
                <Text style={styles.chartTitle}>TOP SELLING ITEMS</Text>
              </View>
              <View style={{ marginTop: 7, gap: 5 }}>
                {data.topItems.map((item) => (
                  <View key={item.name} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14, color: COLORS.heading, fontWeight: '600' }}>{item.name}</Text>
                    <Text style={{ fontSize: 14, color: COLORS.muted }}>{item.qty} sold</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={styles.cardLinkRow} onPress={() => navigation.navigate('Menu')}>
                <Text style={styles.cardLinkText}>View all items</Text>
                <Icon name="chevron-right" size={16} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.chartCard, styles.bottomRowCard]}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconCircle}>
                <Icon name="package-variant-closed" size={16} color={COLORS.accent} />
              </View>
              <Text style={styles.chartTitle}>INVENTORY VALUE</Text>
            </View>
            <Text style={styles.inventoryValue}>₹{data.inventoryValue.toFixed(2)}</Text>
            <Text style={styles.inventorySub}>Total inventory value</Text>
            <TouchableOpacity style={styles.cardLinkRow} onPress={() => navigation.navigate('Inventory')}>
              <Text style={styles.cardLinkText}>View inventory</Text>
              <Icon name="chevron-right" size={16} color={COLORS.muted} />
            </TouchableOpacity>
          </View>

          <View style={[styles.chartCard, styles.bottomRowCard]}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconCircle}>
                <Icon name="lightning-bolt-outline" size={16} color={COLORS.accent} />
              </View>
              <Text style={styles.chartTitle}>QUICK ACTIONS</Text>
            </View>
            <View style={styles.quickActionsGrid}>
              <TouchableOpacity style={styles.quickActionBtn} onPress={() => navigation.navigate('MainTabs', { screen: 'POS' })}>
                <Icon name="cash-register" size={20} color={COLORS.heading} />
                <Text style={styles.quickActionLabel}>POS</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionBtn} onPress={() => navigation.navigate('Menu')}>
                <Icon name="plus-box-outline" size={20} color={COLORS.heading} />
                <Text style={styles.quickActionLabel}>Add Item</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionBtn} onPress={() => navigation.navigate('TakeawayDelivery')}>
                <Icon name="moped-outline" size={20} color={COLORS.heading} />
                <Text style={styles.quickActionLabel}>Takeaway Order</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionBtn} onPress={() => navigation.navigate('Reports')}>
                <Icon name="file-chart-outline" size={20} color={COLORS.heading} />
                <Text style={styles.quickActionLabel}>View Reports</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Desktop/tablet-web get the export buttons in the header instead (next to the
            date range filter) — only plain mobile still needs them down here. */}
        {!isDesktopWeb && (
          <View style={styles.exportRow}>
            <TouchableOpacity style={styles.exportPdfBtn} onPress={handleExportPdf} disabled={exporting !== null}>
              {exporting === 'pdf' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="file-pdf-box" size={16} color="#FFFFFF" />
              )}
              <Text style={styles.exportPdfText}>Export PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.exportExcelBtn} onPress={handleExportExcel} disabled={exporting !== null}>
              {exporting === 'excel' ? (
                <ActivityIndicator size="small" color={COLORS.heading} />
              ) : (
                <Icon name="grid" size={16} color={COLORS.heading} />
              )}
              <Text style={styles.exportExcelText}>Export Excel</Text>
            </TouchableOpacity>
          </View>
        )}
      </Body>
      </ScreenContainer>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean, isDesktop: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  // Real desktop-width browsers only: the whole dashboard fills the viewport
  // height exactly (no ScrollView — see the `Body` component), so it splits
  // that height between a fixed-size stat row and two flexible rows below.
  desktopBody: {
    flex: 1,
    minHeight: 0,
    paddingBottom: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isDesktopWeb ? 10 : 7.5,
  },
  modalSheet: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: isDesktopWeb ? 10 : 7.5,
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  modalTitle: {
    fontSize: isDesktopWeb ? 16 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 7 : 5.25,
    paddingVertical: isDesktopWeb ? 6 : 4.5,
    marginBottom: isDesktopWeb ? 4 : 3,
  },
  presetRowActive: {
    backgroundColor: COLORS.button,
  },
  presetRowText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  presetRowTextActive: {
    color: '#FFFFFF',
  },
  customRangeLabel: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 5 : 3.75,
    marginBottom: isDesktopWeb ? 4 : 3,
  },
  customRangeRow: {
    flexDirection: 'row',
    gap: isDesktopWeb ? 5 : 3.75,
    marginBottom: isDesktopWeb ? 7 : 5.25,
  },
  dateField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 4.5,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 8 : 6,
    paddingVertical: isDesktopWeb ? 6 : 4.5,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dateFieldActive: {
    borderColor: COLORS.accent,
  },
  dateFieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
  },
  dateFieldValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  calendarBox: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 10,
    padding: isDesktopWeb ? 8 : 6,
    marginBottom: isDesktopWeb ? 7 : 5.25,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: isDesktopWeb ? 4 : 3,
  },
  calendarNavBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginBottom: isDesktopWeb ? 2 : 1.5,
  },
  calendarWeekday: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
  },
  calendarDaysWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayCell: {
    width: '14.28%',
    alignItems: 'center',
    paddingVertical: isDesktopWeb ? 2 : 1.5,
  },
  calendarDayInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDaySelected: {
    backgroundColor: COLORS.button,
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  calendarDayText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
  },
  applyRangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 3 : 2.25,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 7 : 5.25,
  },
  applyRangeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 5 : 3.75,
    paddingHorizontal: isDesktopWeb ? 8 : 6,
    paddingTop: isDesktopWeb ? 6 : 4.5,
    paddingBottom: isDesktopWeb ? 6 : 4.5,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.heading,
    flex: 1,
  },
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 8 : 6,
    backgroundColor: COLORS.aiCardBg,
    marginHorizontal: isDesktopWeb ? 16 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 14 : 10.5,
    marginBottom: isDesktopWeb ? 16 : 12,
  },
  aiBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  aiDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: isDesktopWeb ? 8 : 6,
    gap: isDesktopWeb ? 6 : 4.5,
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  revenueCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 3.75,
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
    marginBottom: isDesktopWeb ? 3 : 2.25,
  },
  revenueValue: {
    fontSize: isDesktopWeb ? 14 : 12,
    fontWeight: 'bold',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 4 : 3,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 2 : 1.5,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accent,
  },
  smallCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 3.75,
    justifyContent: 'center',
  },
  smallCardValue: {
    fontSize: isDesktopWeb ? 14 : 12,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  smallCardSub: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 1 : 0.75,
  },
  accentCard: {
    backgroundColor: COLORS.aiCardBg,
  },
  accentCardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 0.5,
    marginBottom: isDesktopWeb ? 3 : 2.25,
  },
  accentCardValue: {
    fontSize: isDesktopWeb ? 14 : 12,
    fontWeight: 'bold',
    color: COLORS.accent,
  },
  accentCardSub: {
    fontSize: 12,
    color: COLORS.heading,
    marginTop: isDesktopWeb ? 1 : 0.75,
  },
  // Full-width carousel cards (mobile) — one stat card fills the whole screen width
  // at a time, swiped between via StatCarousel, instead of cramped side-by-side
  // cards.
  fullCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 8 : 6,
    borderRadius: 14,
    padding: isDesktopWeb ? 20 : 15,
    minHeight: 130,
    justifyContent: 'center',
  },
  fullAccentCard: {
    backgroundColor: COLORS.aiCardBg,
  },
  fullCardLabel: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  fullCardValue: {
    fontSize: isDesktopWeb ? 32 : 12,
    fontWeight: 'bold',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  fullCardSub: {
    fontSize: isDesktopWeb ? 13 : 12,
    color: COLORS.muted,
  },
  carouselDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 4.5,
    marginTop: isDesktopWeb ? 10 : 7.5,
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.divider,
  },
  dotActive: {
    width: 18,
    backgroundColor: COLORS.heading,
  },
  chartCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 8 : 6,
    borderRadius: 8,
    padding: isDesktopWeb ? 9 : 6.75,
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  // Wraps Daily Performance + Peak Hours Density side by side. On desktop it's
  // one of two flex:1 rows sharing the leftover viewport height with bottomRow
  // below; elsewhere it just stacks the two cards like before.
  midRow: {
    flexDirection: isDesktop ? 'row' : 'column',
    alignItems: 'stretch',
    paddingHorizontal: isDesktopWeb ? 8 : 6,
    gap: isDesktopWeb ? 8 : 6,
    marginBottom: isDesktopWeb ? 8 : 6,
    flex: isDesktop ? 1 : undefined,
    minHeight: isDesktop ? 0 : undefined,
  },
  midRowCard: {
    flex: isDesktop ? 1 : undefined,
    marginHorizontal: 0,
    marginBottom: isDesktop ? 0 : (isDesktopWeb ? 8 : 6),
    minHeight: isDesktop ? 0 : undefined,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
  },
  periodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 2 : 1.5,
    backgroundColor: COLORS.background,
    paddingHorizontal: isDesktopWeb ? 5 : 3.75,
    paddingVertical: isDesktopWeb ? 2 : 1.5,
    borderRadius: 10,
  },
  revenueCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: isDesktopWeb ? 10 : 0,
    marginBottom: isDesktopWeb ? 3 : 2.25,
  },
  statCardFlex: {
    flex: 1,
  },
  statIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.aiCardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.aiCardBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    width: isDesktopWeb ? 60 : 0,
    height: 34,
  },
  sparklineBar: {
    flex: 1,
    minWidth: 2,
    borderRadius: 2,
    opacity: 0.75,
  },
  periodPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  // On desktop this is the ScrollView's own `style` (not contentContainerStyle),
  // so it can flex:1 to claim the chart card's full remaining height.
  barChartScroll: {
    flex: isDesktop ? 1 : undefined,
    minHeight: isDesktop ? 0 : undefined,
  },
  barChartRow: {
    flexDirection: 'row',
    alignItems: isDesktop ? 'stretch' : 'flex-end',
    height: isDesktop ? undefined : 140,
    flexGrow: isDesktop ? 1 : undefined,
    marginTop: isDesktopWeb ? 10 : 7.5,
    gap: isDesktopWeb ? 8 : 6,
    paddingHorizontal: isDesktopWeb ? 1 : 0.75,
    minWidth: '100%',
    justifyContent: 'space-between',
  },
  barColumn: {
    alignItems: 'center',
    width: 40,
  },
  peakLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 2 : 1.5,
  },
  barTrack: {
    width: 20,
    height: isDesktop ? undefined : 90,
    flex: isDesktop ? 1 : undefined,
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barDayLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 4 : 3,
  },
  // On desktop the 5 rows spread out with space-between to fill the card's
  // full flex:1 height instead of clumping at a fixed 7px gap.
  peakHoursList: isDesktop
    ? { marginTop: 7, flex: 1, minHeight: 0, justifyContent: 'space-between' }
    : { marginTop: 7, gap: 7 },
  peakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 5 : 3.75,
  },
  peakTime: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    width: 44,
  },
  peakTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.background,
    overflow: 'hidden',
  },
  peakFill: {
    height: 8,
    borderRadius: 4,
  },
  peakPct: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
    width: 34,
    textAlign: 'right',
  },
  inventoryValue: {
    fontSize: isDesktopWeb ? 22 : 18,
    fontWeight: 'bold',
    color: COLORS.heading,
    marginTop: isDesktopWeb ? 6 : 4.5,
  },
  inventorySub: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 2 : 1.5,
  },
  bottomRow: {
    flexDirection: isDesktopWeb ? 'row' : 'column',
    alignItems: 'stretch',
    paddingHorizontal: isDesktopWeb ? 8 : 6,
    gap: isDesktopWeb ? 8 : 6,
    marginBottom: isDesktopWeb ? 8 : 6,
    flex: isDesktop ? 1 : undefined,
    minHeight: isDesktop ? 0 : undefined,
  },
  bottomRowCard: {
    flex: isDesktopWeb ? 1 : undefined,
    marginHorizontal: 0,
    marginBottom: isDesktopWeb ? 0 : 6,
    minHeight: isDesktop ? 0 : undefined,
  },
  cardLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: COLORS.background,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 7 : 5.25,
    // Pinned to the bottom edge of its flex:1 card on desktop so the button
    // sits flush at the card's foot regardless of how much extra height the
    // no-scroll layout hands the card, instead of hugging the short list above it.
    marginTop: isDesktop ? 'auto' : (isDesktopWeb ? 9 : 7),
  },
  cardLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: isDesktop ? 'center' : 'flex-start',
    marginTop: isDesktopWeb ? 9 : 7,
    flex: isDesktop ? 1 : undefined,
    minHeight: isDesktop ? 0 : undefined,
  },
  quickActionBtn: {
    width: '48%',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingVertical: isDesktopWeb ? 12 : 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: isDesktopWeb ? 6 : 4.5,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  exportRow: {
    flexDirection: 'row',
    paddingHorizontal: isDesktopWeb ? 8 : 6,
    gap: 4.5,
  },
  exportPdfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: 5.25,
  },
  exportPdfText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  exportExcelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 6,
    paddingVertical: 5.25,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  exportExcelText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  // Compact twins of exportPdfBtn/exportExcelBtn for the desktop/tablet-web header's
  // right slot, where there's no room for the full-width buttons below. Keeps the
  // icon + label + colored-pill look of the originals so they still read as buttons
  // instead of fading into the header as bare icons.
  headerExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.button,
  },
  headerExportExcelBtn: {
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  headerExportText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerExportExcelText: {
    color: COLORS.heading,
  },
});
