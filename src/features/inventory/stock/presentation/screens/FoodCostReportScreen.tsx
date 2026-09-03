import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useFoodCostReport } from '../../../../../core/api/hooks/useReports';
import { useSettings } from '../../../../../core/api/hooks/useSettings';
import { showToast } from '../../../../../core/store/uiSlice';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { SearchClearButton } from '../../../../../shared/components/atoms/SearchClearButton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { ReportExportService } from '../../../../../core/utils/reportExport';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

// Industry benchmark per the doc: 28-35% is healthy.
const healthyMax = 35;

const pctColor = (COLORS: ReturnType<typeof useThemeColors>, pct: number) => {
  if (pct > healthyMax) return COLORS.dangerAccent;
  if (pct > 28) return COLORS.warning;
  return COLORS.success;
};

export const FoodCostReportScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const { data: rows = [], isLoading, isError, refetch } = useFoodCostReport();
  const { data: settings } = useSettings();

  const filtered = rows.filter((r) => r.menuItemName.toLowerCase().includes(search.toLowerCase()));

  const runExport = async (format: 'pdf' | 'excel') => {
    setExporting(format);
    try {
      const def = {
        title: 'Food Cost Report',
        businessName: settings?.businessName ?? 'Business',
        dateRangeLabel: 'Current menu prices & recipe costs',
        sections: [{
          title: 'Food cost by item',
          columns: [
            { key: 'name', label: 'Menu Item' },
            { key: 'cost', label: 'Ingredient Cost', align: 'right' as const },
            { key: 'price', label: 'Menu Price', align: 'right' as const },
            { key: 'pct', label: 'Food Cost %', align: 'right' as const },
          ],
          rows: filtered.map((r) => ({ name: r.menuItemName, cost: r.ingredientCost, price: r.menuPrice, pct: `${r.foodCostPct.toFixed(1)}%` })),
        }],
      };
      if (format === 'pdf') await ReportExportService.exportToPDF(def);
      else await ReportExportService.exportToExcel(def);
    } catch (e: any) {
      dispatch(showToast({ message: e?.message ?? 'Could not build the report file.', icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setExporting(null);
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="food-outline" title="Food Cost Report" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {!isDesktopWeb && (
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="arrow-left" size={22} color={COLORS.heading} />
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>Food Cost Report</Text>
          </View>
        )}

        <View style={styles.searchWrapper}>
          <Icon name="magnify" size={18} color={COLORS.muted} style={{ marginRight: 8 }} />
          <View style={styles.searchInputWrap}>
            <TextInput
              style={[styles.searchInput, { paddingRight: 24 }]}
              placeholder="Search menu item..."
              placeholderTextColor={COLORS.placeholder}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && <SearchClearButton onPress={() => setSearch('')} />}
          </View>
        </View>

        {isError && rows.length === 0 ? (
          <ErrorState title="Couldn't load food cost report" message="Check your connection and try again." onRetry={() => refetch()} />
        ) : (
          <View style={styles.tableCard}>
            {isLoading && (
              <View style={{ padding: 16 }}>
                <SkeletonList rows={6} />
              </View>
            )}
            {!isLoading && filtered.length === 0 && (
              <Text style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No priced recipes yet.</Text>
            )}

            {filtered.map((r, index) => (
              <TouchableOpacity
                key={r.menuItemId}
                style={[styles.row, index !== filtered.length - 1 && styles.rowDivider]}
                onPress={() => navigation.navigate('RecipeBuilder', { menuItemId: r.menuItemId })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{r.menuItemName}</Text>
                  <Text style={styles.metaText}>
                    Cost ₹{r.ingredientCost.toFixed(2)} · Price ₹{r.menuPrice.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.pctBox}>
                  <Text style={[styles.pctValue, { color: pctColor(COLORS, r.foodCostPct) }]}>{r.foodCostPct.toFixed(1)}%</Text>
                  {r.foodCostPct > healthyMax && <Text style={styles.overBudgetText}>Over budget</Text>}
                </View>
                <Icon name="chevron-right" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!isLoading && filtered.length > 0 && (
          <View style={styles.exportRow}>
            <TouchableOpacity style={styles.exportPdfBtn} onPress={() => runExport('pdf')} disabled={exporting !== null}>
              {exporting === 'pdf' ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="file-pdf-box" size={16} color="#FFFFFF" />}
              <Text style={styles.exportPdfText}>Export PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.exportExcelBtn} onPress={() => runExport('excel')} disabled={exporting !== null}>
              {exporting === 'excel' ? <ActivityIndicator size="small" color={COLORS.heading} /> : <Icon name="grid" size={16} color={COLORS.heading} />}
              <Text style={styles.exportExcelText}>Export Excel</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: isDesktopWeb ? 16 : 12, marginTop: isDesktopWeb ? 12 : 9, marginBottom: isDesktopWeb ? 12 : 9 },
  title: { flex: 1, fontSize: isDesktopWeb ? 20 : 18, fontWeight: 'bold', color: COLORS.heading },
  searchWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardAlt, borderRadius: 8,
    marginHorizontal: isDesktopWeb ? 12 : 12, paddingHorizontal: isDesktopWeb ? 10 : 10.5, height: 46, marginBottom: isDesktopWeb ? 12 : 12,
  },
  searchInputWrap: { flex: 1, borderRadius: 8 },
  searchInput: { width: '100%', fontSize: 16, color: COLORS.heading },
  tableCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 12 : 12, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7 : 7.5, paddingHorizontal: isDesktopWeb ? 10 : 10.5, paddingVertical: isDesktopWeb ? 10 : 10.5 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  itemName: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: COLORS.heading },
  metaText: { fontSize: 11, color: COLORS.muted, marginTop: 1.5 },
  pctBox: { alignItems: 'flex-end' },
  pctValue: { fontSize: 12, fontWeight: '800' },
  overBudgetText: { fontSize: 9, fontWeight: '700', color: COLORS.dangerAccent, marginTop: 1.5 },
  exportRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 16 : 12, gap: 8, marginTop: 12 },
  exportPdfBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: 8 },
  exportPdfText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  exportExcelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.cardAlt, borderRadius: 6, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.divider },
  exportExcelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
});
