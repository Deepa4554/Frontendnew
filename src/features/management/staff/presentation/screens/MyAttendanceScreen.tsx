import React, { useMemo } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { showToast } from '../../../../../core/store/uiSlice';
import { useMyAttendance, usePunchIn, usePunchOut, useBreakStart, useBreakEnd } from '../../../../../core/api/hooks/useAttendance';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { getCurrentLocation } from '../../../../../core/utils/geolocation';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const pad = (n: number) => n.toString().padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (iso: string | null) => {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const MyAttendanceScreen = ({ navigation }: any) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  const today = toDateInput(new Date());
  const periodStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return toDateInput(d);
  }, []);
  const { data: records = [], isLoading, refetch } = useMyAttendance(periodStart, today);
  const todayRecord = records.find((r) => r.date === today);

  const punchIn = usePunchIn();
  const punchOut = usePunchOut();
  const breakStart = useBreakStart();
  const breakEnd = useBreakEnd();

  // The open session isn't necessarily today's row — a night shift that crossed
  // midnight still lives on YESTERDAY's record until punch-out. Keying the buttons off
  // todayRecord alone showed "Punch In" at 1 AM with yesterday's session still open,
  // inviting a duplicate record; the backend's punch-out resolves localDate=today back
  // to that open session (see AttendanceController.FindOpenRecordAsync), so the UI just
  // has to recognise it. records is newest-first, so find() lands on the latest open one.
  const openRecord = records.find((r) => r.punchInAt && !r.punchOutAt);
  const notPunchedIn = !openRecord && !todayRecord?.punchInAt;
  const punchedIn = !!openRecord;
  const punchedOut = !openRecord && !!todayRecord?.punchOutAt;

  const run = async (mutation: () => Promise<unknown>, successMessage: string) => {
    try {
      await mutation();
      dispatch(showToast({ message: successMessage, icon: 'check-circle-outline', tone: 'success' }));
      refetch();
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'That action failed'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  /// Location is mandatory for punch-in/out (see AttendanceController.
  /// EnsureWithinGeofenceAsync) — resolve it once here so both handlers share the same
  /// "can't get a location" failure message instead of each hitting the backend 400.
  const runWithLocation = async (
    mutation: (loc: { latitude: number; longitude: number }) => Promise<unknown>,
    successMessage: string,
  ) => {
    const loc = await getCurrentLocation();
    if (!loc.ok) {
      dispatch(showToast({ message: loc.message, icon: 'map-marker-off-outline', tone: 'danger' }));
      return;
    }
    await run(() => mutation(loc.coords), successMessage);
  };

  const handlePunchIn = () => runWithLocation((loc) => punchIn.mutateAsync({ localDate: today, ...loc }), 'Punched in.');
  const handlePunchOut = () => runWithLocation((loc) => punchOut.mutateAsync({ localDate: today, ...loc }), 'Punched out.');
  const handleBreakStart = () => run(() => breakStart.mutateAsync({ localDate: today }), 'Break started.');
  const handleBreakEnd = () => run(() => breakEnd.mutateAsync({ localDate: today }), 'Break ended.');

  const busy = punchIn.isPending || punchOut.isPending || breakStart.isPending || breakEnd.isPending;

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="clock-check-outline" title="My Attendance" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Attendance</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {isDesktopWeb ? (
          <View style={styles.punchCard}>
            <Icon name="cellphone-check" size={22} color={COLORS.muted} />
            <Text style={[styles.punchStatus, { marginTop: 7, textAlign: 'center' }]}>
              Punch in/out is only available on your phone
            </Text>
            <Text style={[styles.punchSubStatus, { textAlign: 'center' }]}>
              Attendance is location-verified, which needs your phone's GPS — open this screen on your mobile device to punch in or out.
            </Text>
          </View>
        ) : (
          <View style={styles.punchCard}>
            <Text style={styles.punchStatus}>
              {notPunchedIn ? "You haven't punched in today" : punchedOut ? 'Done for today' : `Punched in at ${toTimeInput(openRecord?.punchInAt ?? null)}`}
            </Text>
            {punchedIn && (
              <Text style={styles.punchSubStatus}>
                {openRecord?.status === 'LATE' ? `${openRecord.lateMinutes} min late` : 'On time'}
              </Text>
            )}
            {punchedOut && todayRecord?.workedMinutes != null && (
              <Text style={styles.punchSubStatus}>{(todayRecord.workedMinutes / 60).toFixed(1)}h worked</Text>
            )}

            {notPunchedIn && (
              <TouchableOpacity style={styles.primaryBtn} onPress={handlePunchIn} disabled={busy}>
                {punchIn.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="login" size={18} color="#FFFFFF" />}
                <Text style={styles.primaryBtnText}>Punch In</Text>
              </TouchableOpacity>
            )}

            {punchedIn && (
              <>
                <View style={styles.breakRow}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={handleBreakStart} disabled={busy}>
                    <Icon name="coffee-outline" size={16} color={COLORS.heading} />
                    <Text style={styles.secondaryBtnText}>Start Break</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={handleBreakEnd} disabled={busy}>
                    <Icon name="coffee-off-outline" size={16} color={COLORS.heading} />
                    <Text style={styles.secondaryBtnText}>End Break</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.primaryBtn} onPress={handlePunchOut} disabled={busy}>
                  {punchOut.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="logout" size={18} color="#FFFFFF" />}
                  <Text style={styles.primaryBtnText}>Punch Out</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <Text style={styles.sectionLabel}>LAST 14 DAYS</Text>
        {isLoading ? (
          <SkeletonList rows={5} />
        ) : records.length === 0 ? (
          <Text style={styles.emptyText}>No attendance history yet.</Text>
        ) : (
          [...records].sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => (
            <View key={r.id} style={styles.historyRow}>
              <Text style={styles.historyDate}>{r.date}</Text>
              <Text style={styles.historyMeta}>
                {toTimeInput(r.punchInAt)} → {toTimeInput(r.punchOutAt)}
                {r.workedMinutes != null ? ` · ${(r.workedMinutes / 60).toFixed(1)}h` : ''}
              </Text>
              <Text style={styles.historyStatus}>{r.status.replace('_', ' ')}</Text>
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
  punchCard: { backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: isDesktopWeb ? 14 : 15, alignItems: 'center', marginBottom: isDesktopWeb ? 16 : 18 },
  punchStatus: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: '700', color: COLORS.heading },
  punchSubStatus: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, marginTop: isDesktopWeb ? 3 : 3 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.button, borderRadius: 10, paddingVertical: isDesktopWeb ? 10 : 10.5, paddingHorizontal: isDesktopWeb ? 24 : 24, marginTop: isDesktopWeb ? 12 : 12, width: '100%',
  },
  primaryBtnText: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '700', color: '#FFFFFF' },
  breakRow: { flexDirection: 'row', gap: isDesktopWeb ? 7.5 : 7.5, marginTop: isDesktopWeb ? 12 : 12, width: '100%' },
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 4.5 : 4.5, backgroundColor: COLORS.background, borderRadius: 8, paddingVertical: isDesktopWeb ? 8 : 7.5 },
  secondaryBtnText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginBottom: isDesktopWeb ? 9 : 9 },
  emptyText: { fontSize: 12, color: COLORS.muted },
  historyRow: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: 9, marginBottom: 6 },
  historyDate: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  historyMeta: { fontSize: 12, color: COLORS.muted, marginTop: 1.5 },
  historyStatus: { fontSize: 11, color: COLORS.accent, marginTop: 3, fontWeight: '700' },
});
