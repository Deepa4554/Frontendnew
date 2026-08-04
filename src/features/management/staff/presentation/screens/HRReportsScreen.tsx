import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { reportsApi } from '../../../../../core/api/reportsApi';
import { useDailyAttendanceReport, useMonthlyAttendanceReport, useOvertimeReport, useEmployeeListReport } from '../../../../../core/api/hooks/useReports';
import { useLeaveRequests } from '../../../../../core/api/hooks/useStaff';
import { usePayrollRuns } from '../../../../../core/api/hooks/usePayroll';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { downloadAndShare } from '../../../../../core/utils/fileDownload';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { DatePickerModal } from '../../../../../shared/components/atoms/DatePickerModal';
import { CategoryFilterModal, CategoryFilterTrigger } from '../../../../../shared/components/molecules/CategoryFilterModal';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const pad = (n: number) => n.toString().padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type ReportKey = 'daily' | 'monthly' | 'overtime' | 'employees' | 'leave' | 'salary';
const REPORT_TABS: { key: ReportKey; label: string }[] = [
  { key: 'daily', label: 'Daily Attendance' },
  { key: 'monthly', label: 'Monthly Attendance' },
  { key: 'overtime', label: 'Overtime' },
  { key: 'employees', label: 'Employees' },
  { key: 'leave', label: 'Leave' },
  { key: 'salary', label: 'Salary Register' },
];

export const HRReportsScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<ReportKey>('daily');
  const [tabPickerVisible, setTabPickerVisible] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [datePickerType, setDatePickerType] = useState<'daily' | 'periodStart' | 'periodEnd' | null>(null);

  const now = new Date();
  const [date, setDate] = useState(toDateInput(now));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [periodStart, setPeriodStart] = useState(toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [periodEnd, setPeriodEnd] = useState(toDateInput(now));
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const daily = useDailyAttendanceReport(date);
  const monthly = useMonthlyAttendanceReport(parseInt(year, 10) || now.getFullYear(), parseInt(month, 10) || now.getMonth() + 1);
  const overtime = useOvertimeReport(periodStart, periodEnd);
  const employees = useEmployeeListReport();
  const { data: leaveRequests = [], isLoading: leaveLoading } = useLeaveRequests();
  const { data: payrollRuns = [] } = usePayrollRuns();

  const exportCsv = async (path: string, fileName: string) => {
    setExporting(true);
    try {
      await downloadAndShare(path, fileName, 'text/csv');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not export report'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setExporting(false);
    }
  };

  const tabLabels = REPORT_TABS.map((t) => t.label);
  const activeLabel = REPORT_TABS.find((t) => t.key === tab)!.label;
  const tabCounts: Record<string, number> = {
    'Daily Attendance': daily.data?.length ?? 0,
    'Monthly Attendance': monthly.data?.length ?? 0,
    Overtime: overtime.data?.length ?? 0,
    Employees: employees.data?.length ?? 0,
    Leave: leaveRequests.length,
    'Salary Register': payrollRuns.length,
  };

  const ExportBtn = ({ onPress }: { onPress: () => void }) => (
    <TouchableOpacity style={styles.exportBtn} onPress={onPress} disabled={exporting}>
      {exporting ? <ActivityIndicator size="small" color={COLORS.heading} /> : <Icon name="download-outline" size={16} color={COLORS.heading} />}
      <Text style={styles.exportBtnText}>Export CSV</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="file-chart-outline" title="HR Reports" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>HR Reports</Text>
        </View>
      )}

      <CategoryFilterTrigger label={activeLabel} onPress={() => setTabPickerVisible(true)} />
      <CategoryFilterModal
        visible={tabPickerVisible}
        onClose={() => setTabPickerVisible(false)}
        title="Choose a Report"
        categories={tabLabels}
        activeCategory={activeLabel}
        counts={tabCounts}
        onSelect={(label) => {
          const found = REPORT_TABS.find((t) => t.label === label);
          if (found) setTab(found.key);
        }}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {tab === 'daily' && (
          <>
            <View style={styles.filterRow}>
              <TouchableOpacity style={[styles.textInput, { justifyContent: 'center' }]} onPress={() => setDatePickerType('daily')}>
                <Text style={{ fontSize: 16, color: COLORS.heading, paddingTop: 2 }}>{date}</Text>
              </TouchableOpacity>
              <ExportBtn onPress={() => exportCsv(reportsApi.dailyAttendanceExportPath(date), `daily-attendance-${date}.csv`)} />
            </View>
            {daily.isLoading ? <SkeletonList rows={4} /> : (daily.data ?? []).map((l) => (
              <View key={l.staffId} style={styles.row}>
                <Text style={styles.rowTitle}>{l.staffName}</Text>
                <Text style={styles.rowMeta}>{l.status} · {l.workedMinutes != null ? `${(l.workedMinutes / 60).toFixed(1)}h` : '—'} · {l.lateMinutes}m late</Text>
              </View>
            ))}
            {!daily.isLoading && (daily.data ?? []).length === 0 && <Text style={styles.emptyText}>No data for this date.</Text>}
          </>
        )}

        {tab === 'monthly' && (
          <>
            <View style={styles.filterRow}>
              <View style={styles.yearInputWrap}>
                <TextInput style={styles.textInput} placeholder="Year" placeholderTextColor={COLORS.placeholder} keyboardType="number-pad" value={year} onChangeText={setYear} />
              </View>
              <View style={styles.monthInputWrap}>
                <TextInput style={styles.textInput} placeholder="Month" placeholderTextColor={COLORS.placeholder} keyboardType="number-pad" value={month} onChangeText={setMonth} />
              </View>
              <ExportBtn onPress={() => exportCsv(reportsApi.monthlyAttendanceExportPath(parseInt(year, 10), parseInt(month, 10)), `monthly-attendance-${year}-${month}.csv`)} />
            </View>
            {monthly.isLoading ? <SkeletonList rows={4} /> : (monthly.data ?? []).map((l) => (
              <View key={l.staffId} style={styles.row}>
                <Text style={styles.rowTitle}>{l.staffName}</Text>
                <Text style={styles.rowMeta}>
                  {l.presentDays} present · {l.lateDays} late · {l.halfDays} half · {l.absentDays} absent · {l.leaveDays} leave · {l.totalWorkedHours.toFixed(1)}h
                </Text>
              </View>
            ))}
          </>
        )}

        {tab === 'overtime' && (
          <>
            <View style={styles.filterRow}>
              <TouchableOpacity style={[styles.textInput, { flex: 1, justifyContent: 'center' }]} onPress={() => setDatePickerType('periodStart')}>
                <Text style={{ fontSize: 16, color: COLORS.heading, paddingTop: 2 }}>{periodStart}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.textInput, { flex: 1, justifyContent: 'center' }]} onPress={() => setDatePickerType('periodEnd')}>
                <Text style={{ fontSize: 16, color: COLORS.heading, paddingTop: 2 }}>{periodEnd}</Text>
              </TouchableOpacity>
              <ExportBtn onPress={() => exportCsv(reportsApi.overtimeExportPath(periodStart, periodEnd), `overtime-${periodStart}-${periodEnd}.csv`)} />
            </View>
            {overtime.isLoading ? <SkeletonList rows={4} /> : (overtime.data ?? []).map((l) => (
              <View key={l.staffId} style={styles.row}>
                <Text style={styles.rowTitle}>{l.staffName}</Text>
                <Text style={styles.rowMeta}>{l.totalOvertimeHours.toFixed(1)}h over {l.overtimeDays} day(s)</Text>
              </View>
            ))}
            {!overtime.isLoading && (overtime.data ?? []).length === 0 && <Text style={styles.emptyText}>No overtime in this period.</Text>}
          </>
        )}

        {tab === 'employees' && (
          <>
            <View style={styles.filterRow}>
              <View style={{ flex: 1 }} />
              <ExportBtn onPress={() => exportCsv(reportsApi.employeeListExportPath(), 'employee-list.csv')} />
            </View>
            {employees.isLoading ? <SkeletonList rows={4} /> : (employees.data ?? []).map((l) => (
              <View key={l.staffId} style={styles.row}>
                <Text style={styles.rowTitle}>{l.name}</Text>
                <Text style={styles.rowMeta}>{l.role}{l.department ? ` · ${l.department}` : ''} · {l.status}</Text>
              </View>
            ))}
          </>
        )}

        {tab === 'leave' && (
          <>
            <View style={styles.filterRow}>
              <View style={{ flex: 1 }} />
              <ExportBtn onPress={() => exportCsv(reportsApi.leaveExportPath(), 'leave-report.csv')} />
            </View>
            {leaveLoading ? <SkeletonList rows={4} /> : leaveRequests.map((l) => (
              <View key={l.id} style={styles.row}>
                <Text style={styles.rowTitle}>{l.staffName}</Text>
                <Text style={styles.rowMeta}>{l.type} · {l.startDate} → {l.endDate} · {l.status}</Text>
              </View>
            ))}
          </>
        )}

        {tab === 'salary' && (
          <>
            <Text style={styles.fieldLabel}>Choose a payroll run</Text>
            {payrollRuns.map((run) => (
              <TouchableOpacity
                key={run.id}
                style={[styles.row, selectedRunId === run.id && styles.rowSelected]}
                onPress={() => setSelectedRunId(run.id)}
              >
                <Text style={styles.rowTitle}>{run.periodStart} → {run.periodEnd}</Text>
                <Text style={styles.rowMeta}>{run.status} · {run.staffCount} staff · ₹{run.totalNetSalary.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
            {selectedRunId != null && (
              <View style={{ marginTop: 12 }}>
                <ExportBtn onPress={() => exportCsv(reportsApi.salaryRegisterExportPath(selectedRunId), `salary-register-${selectedRunId}.csv`)} />
              </View>
            )}
          </>
        )}
      </ScrollView>

      <DatePickerModal
        visible={datePickerType === 'daily'}
        value={date}
        title="Select Date"
        onCancel={() => setDatePickerType(null)}
        onConfirm={(selectedDate) => {
          setDate(selectedDate);
          setDatePickerType(null);
        }}
      />

      <DatePickerModal
        visible={datePickerType === 'periodStart'}
        value={periodStart}
        title="Select Start Date"
        onCancel={() => setDatePickerType(null)}
        onConfirm={(selectedDate) => {
          setPeriodStart(selectedDate);
          setDatePickerType(null);
        }}
      />

      <DatePickerModal
        visible={datePickerType === 'periodEnd'}
        value={periodEnd}
        title="Select End Date"
        onCancel={() => setDatePickerType(null)}
        onConfirm={(selectedDate) => {
          setPeriodEnd(selectedDate);
          setDatePickerType(null);
        }}
      />
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7.5 : 10, paddingHorizontal: isDesktopWeb ? 12 : 16, paddingBottom: isDesktopWeb ? 6 : 8 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.heading },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7.5 : 10, marginBottom: isDesktopWeb ? 10.5 : 14, marginTop: isDesktopWeb ? 10.5 : 14 },
  yearInputWrap: { flex: 1, borderRadius: 8 },
  monthInputWrap: { flex: 1, borderRadius: 8 },
  textInput: { backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 9 : 12, paddingVertical: isDesktopWeb ? 7.5 : 10, fontSize: 16, color: COLORS.heading, flex: 1 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4.5 : 6, paddingHorizontal: isDesktopWeb ? 10.5 : 14, paddingVertical: isDesktopWeb ? 7.5 : 10, borderRadius: 8, backgroundColor: COLORS.cardAlt },
  exportBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  row: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 9 : 12, marginBottom: isDesktopWeb ? 6 : 8 },
  rowSelected: { borderWidth: 2, borderColor: COLORS.accent },
  rowTitle: { fontSize: 14, fontWeight: '700', color: COLORS.heading },
  rowMeta: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 1.5 : 2 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted, marginBottom: isDesktopWeb ? 7.5 : 10 },
  emptyText: { fontSize: 13, color: COLORS.muted, textAlign: 'center', marginTop: isDesktopWeb ? 22 : 30 },
});
