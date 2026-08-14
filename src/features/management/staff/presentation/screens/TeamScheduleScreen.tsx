import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { ScreenContainer } from '../../../../../core/components/ScreenContainer';
import { InitialsAvatar } from '../../../../../shared/components/InitialsAvatar';
import { useAllShifts, useStaff, useShiftTypes, useQuickAssignShift } from '../../../../../core/api/hooks/useStaff';
import { ShiftWithStaff } from '../../../../../core/api/staffApi';
import { showToast } from '../../../../../core/store/uiSlice';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const pad = (n: number) => n.toString().padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toHHmm = (hhmmss: string) => hhmmss.slice(0, 5);
const startOfWeek = (d: Date) => {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=Sun
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

export const TeamScheduleScreen = ({ navigation }: any) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const [weekOffset, setWeekOffset] = useState(0);
  const [activeDate, setActiveDate] = useState(() => toDateInput(new Date()));

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date());
    base.setDate(base.getDate() + weekOffset * 7);
    return base;
  }, [weekOffset]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
    [weekStart],
  );

  const { data: shifts = [], isLoading, isError, refetch } = useAllShifts(activeDate);
  const sortedShifts = useMemo(() => [...shifts].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()), [shifts]);

  const dispatch = useDispatch();
  const { data: staffList = [] } = useStaff();
  const { data: shiftTypes = [] } = useShiftTypes();
  const quickAssign = useQuickAssignShift();
  const [assigningKey, setAssigningKey] = useState<string | null>(null);

  // staffId -> set of ShiftType ids they're already assigned to on activeDate, so the
  // chip row can render which one is active without a second round trip.
  const assignedShiftTypesByStaff = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const s of shifts) {
      if (s.shiftTypeId == null) continue;
      if (!map.has(s.staffId)) map.set(s.staffId, new Set());
      map.get(s.staffId)!.add(s.shiftTypeId);
    }
    return map;
  }, [shifts]);

  const handleQuickAssign = async (staffId: number, shiftTypeId: number) => {
    const key = `${staffId}-${shiftTypeId}`;
    setAssigningKey(key);
    try {
      await quickAssign.mutateAsync({ staffId, date: activeDate, shiftTypeId });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update shift'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setAssigningKey(null);
    }
  };

  const weekLabel = `${days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  const openShift = (shift: ShiftWithStaff) => navigation.navigate('EditShift', { shift });
  const openAddShift = () => navigation.navigate('EditShift', { defaultDate: activeDate });
  const openShiftTypes = () => navigation.navigate('ShiftTypes');

  const weekNav = (
    <View style={styles.weekHeader}>
      <Text style={styles.weekTitle}>{weekLabel}</Text>
      <View style={styles.weekNav}>
        <TouchableOpacity style={styles.weekNavBtn} onPress={() => setWeekOffset((w) => w - 1)}>
          <Icon name="chevron-left" size={isDesktopWeb ? 16 : 18} color={COLORS.heading} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.weekNavBtn} onPress={() => setWeekOffset((w) => w + 1)}>
          <Icon name="chevron-right" size={isDesktopWeb ? 16 : 18} color={COLORS.heading} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={24} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Team Portal</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={openShiftTypes} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="cog-outline" size={22} color={COLORS.heading} />
          </TouchableOpacity>
        </View>
      )}
      <DesktopPageHeader
        icon="calendar-clock"
        title="Team Schedule"
        center={weekNav}
        right={
          <TouchableOpacity style={styles.manageBtn} onPress={openShiftTypes}>
            <Icon name="cog-outline" size={16} color={COLORS.heading} />
            <Text style={styles.manageBtnText}>Shift Types</Text>
          </TouchableOpacity>
        }
      />

      <ScreenContainer maxWidth={1000} style={{ flex: 1, width: '100%', alignSelf: 'center' }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {!isDesktopWeb && weekNav}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
          {days.map((d) => {
            const iso = toDateInput(d);
            const active = iso === activeDate;
            return (
              <TouchableOpacity
                key={iso}
                style={[styles.dayCard, active && styles.dayCardActive]}
                onPress={() => setActiveDate(iso)}
              >
                <Text style={[styles.dayDow, active && styles.dayTextActive]}>{d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</Text>
                <Text style={[styles.dayDate, active && styles.dayTextActive]}>{d.getDate()}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.quickAssignSection}>
          <Text style={styles.sectionLabel}>QUICK ASSIGN</Text>
          {shiftTypes.length === 0 ? (
            <TouchableOpacity style={styles.quickAssignEmptyCard} onPress={openShiftTypes}>
              <Icon name="clock-plus-outline" size={20} color={COLORS.muted} />
              <Text style={styles.emptyHint}>Set up shift types (e.g. Morning, Evening) to one-tap assign staff here.</Text>
            </TouchableOpacity>
          ) : staffList.length === 0 ? (
            <Text style={styles.emptyHint}>No staff yet — add one from Team Portal first.</Text>
          ) : (
            staffList.map((member) => {
              const assigned = assignedShiftTypesByStaff.get(member.id);
              return (
                <View key={member.id} style={styles.quickAssignRow}>
                  <InitialsAvatar name={member.name} size={32} />
                  <Text style={styles.quickAssignName} numberOfLines={1}>{member.name}</Text>
                  <View style={styles.quickAssignChips}>
                    {shiftTypes.map((t) => {
                      const active = !!assigned?.has(t.id);
                      const busy = assigningKey === `${member.id}-${t.id}`;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          style={[styles.quickAssignChip, active && styles.quickAssignChipActive]}
                          onPress={() => handleQuickAssign(member.id, t.id)}
                          disabled={busy}
                        >
                          {busy ? (
                            <ActivityIndicator size="small" color={active ? '#FFFFFF' : COLORS.heading} />
                          ) : (
                            <Text style={[styles.quickAssignChipText, active && styles.quickAssignChipTextActive]}>{t.name}</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.timeline}>
          {isError && shifts.length === 0 ? (
            <ErrorState
              title="Couldn't load shifts"
              message="Check your connection and try again."
              onRetry={() => refetch()}
            />
          ) : isLoading ? (
            <SkeletonList rows={5} avatar />
          ) : sortedShifts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Icon name="calendar-blank-outline" size={28} color={COLORS.muted} />
              <Text style={styles.emptyText}>No shifts scheduled for this day.</Text>
              <Text style={styles.emptyHint}>Tap the + button to add one.</Text>
            </View>
          ) : (
            sortedShifts.map((s) => {
              const start = new Date(s.startsAt);
              const end = new Date(s.endsAt);
              const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
              return (
                <View key={s.id} style={styles.timelineRow}>
                  <Text style={styles.timeLabel}>{fmt(start)}</Text>
                  <TouchableOpacity style={styles.shiftCard} onPress={() => openShift(s)} activeOpacity={0.85}>
                    <InitialsAvatar name={s.staffName} size={44} style={{ borderRadius: 12 }} />
                    <View style={styles.shiftInfo}>
                      <Text style={styles.shiftName}>{s.staffName}</Text>
                      <Text style={styles.shiftRole}>{s.staffRole} · {fmt(start)} - {fmt(end)}</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={COLORS.muted} />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
      </ScreenContainer>

      <TouchableOpacity style={styles.fab} onPress={openAddShift}>
        <Icon name="plus" size={26} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 16 : 12, paddingTop: isDesktopWeb ? 12 : 9, paddingBottom: isDesktopWeb ? 12 : 9, gap: isDesktopWeb ? 12 : 9 },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  weekHeader: { flexDirection: 'row', justifyContent: isDesktopWeb ? 'flex-start' : 'space-between', alignItems: 'center', gap: isDesktopWeb ? 10 : 0, paddingHorizontal: isDesktopWeb ? 0 : 12, marginBottom: isDesktopWeb ? 0 : 10.5 },
  weekTitle: { fontSize: isDesktopWeb ? 13 : 14, fontWeight: '700', color: COLORS.heading },
  weekNav: { flexDirection: 'row', gap: isDesktopWeb ? 4 : 6 },
  weekNavBtn: {
    width: isDesktopWeb ? 24 : 36,
    height: isDesktopWeb ? 24 : 36,
    borderRadius: isDesktopWeb ? 12 : 18,
    backgroundColor: COLORS.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayRow: { paddingHorizontal: isDesktopWeb ? 12 : 12, gap: isDesktopWeb ? 7 : 7.5, marginBottom: isDesktopWeb ? 12 : 15, marginTop: isDesktopWeb ? 10 : 0 },
  dayCard: {
    width: isDesktopWeb ? 52 : 60,
    paddingVertical: isDesktopWeb ? 7 : 10.5,
    borderRadius: 8,
    backgroundColor: COLORS.cardAlt,
    alignItems: 'center',
  },
  dayCardActive: { backgroundColor: COLORS.button },
  dayDow: { fontSize: isDesktopWeb ? 11 : 12, fontWeight: '600', color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 4.5 },
  dayDate: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: 'bold', color: COLORS.heading },
  dayTextActive: { color: '#FFFFFF' },
  timeline: { paddingHorizontal: isDesktopWeb ? 12 : 12 },
  timelineRow: { flexDirection: 'row', marginBottom: isDesktopWeb ? 12 : 12, gap: isDesktopWeb ? 7 : 7.5 },
  timeLabel: { width: 60, fontSize: 12, fontWeight: '600', color: COLORS.muted, paddingTop: isDesktopWeb ? 13 : 13.5 },
  shiftCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 10.5,
    gap: isDesktopWeb ? 9 : 9,
  },
  shiftAvatar: { width: 44, height: 44, borderRadius: 12 },
  shiftInfo: { flex: 1 },
  shiftName: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '700', color: COLORS.heading },
  shiftRole: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 1.5 : 1.5, lineHeight: 17 },
  emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 35 : 37.5, gap: isDesktopWeb ? 6 : 6 },
  emptyText: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  emptyHint: { fontSize: 12, color: COLORS.muted, flexShrink: 1 },
  manageBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  manageBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, paddingHorizontal: 12, marginBottom: isDesktopWeb ? 7 : 9 },
  quickAssignSection: { marginBottom: isDesktopWeb ? 12 : 20 },
  quickAssignEmptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12,
    backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 10 : 14,
  },
  quickAssignRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 9 : 9, paddingHorizontal: 12, marginBottom: isDesktopWeb ? 6 : 10 },
  quickAssignName: { flexBasis: 90, flexShrink: 0, fontSize: 12, fontWeight: '700', color: COLORS.heading },
  quickAssignChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  quickAssignChip: {
    minWidth: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.cardAlt, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7,
  },
  quickAssignChipActive: { backgroundColor: COLORS.button },
  quickAssignChipText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  quickAssignChipTextActive: { color: '#FFFFFF' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 6,
    backgroundColor: COLORS.button,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
