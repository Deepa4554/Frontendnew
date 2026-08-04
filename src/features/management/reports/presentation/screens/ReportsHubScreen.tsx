import React from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector } from 'react-redux';
import { RootState } from '../../../../../core/store/rootReducer';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';
import { canAccessRoute } from '../../../../../core/auth/permissions';
import { usePlanCategory } from '../../../../../core/plan/planCategory';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';

interface ReportItem {
  label: string;
  icon: string;
  route: string;
  /** Only set when the target screen lives inside a different nested navigator
   * (e.g. HRReports lives inside TeamPortalNavigator) — navigated to via
   * navigation.navigate(parent, { screen: route }) instead of a flat navigate. */
  parentRoute?: string;
}

interface ReportSection {
  title: string;
  items: ReportItem[];
}

const SECTIONS: ReportSection[] = [
  {
    title: 'Sales & Revenue',
    items: [
      { label: 'Revenue Report', icon: 'cash-multiple', route: 'RevenueReport' },
      { label: 'Sales Report', icon: 'point-of-sale', route: 'SalesReport' },
      { label: 'Order Detail Report', icon: 'receipt-text-outline', route: 'OrderDetailReport' },
      { label: 'Tax / GST Report', icon: 'percent-outline', route: 'TaxGstReport' },
    ],
  },
  {
    title: 'Inventory & Purchasing',
    items: [
      { label: 'Stock Report', icon: 'archive-outline', route: 'StockReport' },
      { label: 'Purchase Report', icon: 'clipboard-text-outline', route: 'PurchaseReport' },
      { label: 'Variance Report', icon: 'chart-bell-curve', route: 'VarianceReport' },
      { label: 'Food Cost Report', icon: 'chart-pie', route: 'FoodCostReport' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Profit Report', icon: 'chart-line', route: 'ProfitReport' },
      { label: 'Expense Report', icon: 'cash-minus', route: 'ExpenseReport' },
    ],
  },
  {
    title: 'Customers',
    items: [
      { label: 'Customer (CRM) Report', icon: 'account-heart-outline', route: 'CrmReport' },
    ],
  },
];

const TEAM_REPORT: ReportItem = { label: 'Team & Payroll Reports', icon: 'file-chart-outline', route: 'HRReports', parentRoute: 'TeamPortal' };

export const ReportsHubScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const user = useSelector((s: RootState) => s.auth.user);
  const { category: planCategory, isLoading: planLoading } = usePlanCategory();

  const go = (item: ReportItem) => {
    if (item.parentRoute) navigation.navigate(item.parentRoute, { screen: item.route });
    else navigation.navigate(item.route);
  };

  const sections = SECTIONS
    .map((section) => ({ ...section, items: section.items.filter((item) => canAccessRoute(user ?? undefined, item.route, planCategory)) }))
    .filter((section) => section.items.length > 0);
  const showTeamReport = canAccessRoute(user ?? undefined, TEAM_REPORT.route, planCategory);

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="file-chart-outline" title="Reports" />
      {!isDesktopWeb && (
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="arrow-left" size={22} color={COLORS.heading} />
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>Reports</Text>
          </View>
          <Text style={styles.subtitle}>Everything for your daily audit, in one place.</Text>
        </View>
      )}

      {planLoading ? (
        <View style={styles.scrollContent}><SkeletonList rows={6} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionCard}>
                {section.items.map((item, index) => (
                  <TouchableOpacity
                    key={item.route}
                    style={[styles.row, index !== section.items.length - 1 && styles.rowDivider]}
                    onPress={() => go(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowIconBox}>
                      <Icon name={item.icon} size={20} color={COLORS.heading} />
                    </View>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    <Icon name="chevron-right" size={20} color={COLORS.muted} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          {showTeamReport && (
            <TouchableOpacity style={styles.teamReportRow} onPress={() => go(TEAM_REPORT)} activeOpacity={0.7}>
              <Icon name={TEAM_REPORT.icon} size={18} color={COLORS.accent} />
              <Text style={styles.teamReportText}>{TEAM_REPORT.label}</Text>
              <Icon name="chevron-right" size={18} color={COLORS.accent} />
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: isDesktopWeb ? 20 : 15, paddingTop: isDesktopWeb ? 16 : 12, paddingBottom: isDesktopWeb ? 12 : 9 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: isDesktopWeb ? 20 : 18, fontWeight: 'bold', color: COLORS.heading },
  subtitle: { fontSize: 13, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  scrollContent: { paddingHorizontal: isDesktopWeb ? 20 : 15, paddingBottom: isDesktopWeb ? 40 : 30 },
  section: { marginBottom: isDesktopWeb ? 20 : 15 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginBottom: isDesktopWeb ? 8 : 6, marginLeft: isDesktopWeb ? 4 : 3, textTransform: 'uppercase' },
  sectionCard: { backgroundColor: COLORS.cardAlt, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 16 : 12, paddingVertical: isDesktopWeb ? 14 : 10.5, gap: isDesktopWeb ? 12 : 9 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  rowIconBox: { width: 36, height: 36, borderRadius: 8, backgroundColor: COLORS.aiCardBg, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: isDesktopWeb ? 15 : 12, fontWeight: '600', color: COLORS.heading },
  teamReportRow: {
    flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 8 : 6, backgroundColor: COLORS.aiCardBg,
    borderRadius: 8, padding: isDesktopWeb ? 14 : 10.5, marginTop: isDesktopWeb ? 4 : 3,
  },
  teamReportText: { flex: 1, fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: COLORS.accent },
});
