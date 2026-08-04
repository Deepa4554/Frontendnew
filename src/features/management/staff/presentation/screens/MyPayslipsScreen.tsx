import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useMyPayslips } from '../../../../../core/api/hooks/usePayroll';
import { payrollApi, PayrollLine } from '../../../../../core/api/payrollApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { downloadAndShare } from '../../../../../core/utils/fileDownload';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

export const MyPayslipsScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  const { data: payslips = [], isLoading } = useMyPayslips();
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const downloadPayslip = async (line: PayrollLine) => {
    setDownloadingId(line.id);
    try {
      await downloadAndShare(payrollApi.myPayslipPdfPath(line.id), `payslip-${line.id}.pdf`, 'application/pdf');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not download payslip'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="file-document-outline" title="My Payslips" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Payslips</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {isLoading ? (
          <SkeletonList rows={5} />
        ) : payslips.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="file-document-outline" size={28} color={COLORS.muted} />
            <Text style={styles.emptyText}>No payslips yet — these appear once payroll has been generated and paid.</Text>
          </View>
        ) : (
          payslips.map((line) => (
            <View key={line.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.netSalary}>₹{line.netSalary.toFixed(2)}</Text>
                <Text style={styles.metaText}>{line.presentDays} present · {line.overtimeHours.toFixed(1)}h overtime</Text>
              </View>
              <TouchableOpacity style={styles.downloadBtn} onPress={() => downloadPayslip(line)} disabled={downloadingId === line.id}>
                {downloadingId === line.id ? <ActivityIndicator size="small" color={COLORS.heading} /> : <Icon name="file-pdf-box" size={20} color={COLORS.heading} />}
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7.5 : 7.5, paddingHorizontal: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 6 : 6 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 35 : 37.5, gap: isDesktopWeb ? 6 : 6 },
  emptyText: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, textAlign: 'center', paddingHorizontal: isDesktopWeb ? 21 : 22.5 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 10 : 10.5, marginBottom: isDesktopWeb ? 9 : 9 },
  netSalary: { fontSize: isDesktopWeb ? 18 : 12, fontWeight: '800', color: COLORS.heading },
  metaText: { fontSize: 12, color: COLORS.muted, marginTop: 1.5 },
  downloadBtn: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
});
