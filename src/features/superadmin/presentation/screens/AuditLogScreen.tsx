import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { confirmAlert } from '../../../../shared/components/ConfirmDialogHost';
import { useDispatch } from 'react-redux';
import { WarmColors as COLORS } from '../../../../shared/design/warmTheme';
import { useAuditLog } from '../../../../core/api/hooks/useAudit';
import { AuditEntry } from '../../../../core/api/auditApi';
import { logout } from '../../../auth/presentation/viewmodels/authSlice';
import { AppDispatch } from '../../../../core/store';
import { SkeletonList } from '../../../../shared/components/atoms/Skeleton';
import { SearchClearButton } from '../../../../shared/components/atoms/SearchClearButton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { CategoryFilterModal, CategoryFilterTrigger } from '../../../../shared/components/molecules/CategoryFilterModal';

const confirmLogout = (dispatch: AppDispatch) => {
  confirmAlert('Sign out', 'Sign out of the Super Admin account?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign Out', style: 'destructive', onPress: () => dispatch(logout()) },
  ]);
};

type SeverityFilter = 'ALL' | AuditEntry['severity'];

const QUICK_FILTERS: SeverityFilter[] = ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const SEVERITY_STYLE: Record<AuditEntry['severity'], { bg: string; color: string }> = {
  LOW: { bg: COLORS.chipBg, color: COLORS.muted },
  MEDIUM: { bg: COLORS.warningBg, color: COLORS.warning },
  HIGH: { bg: COLORS.dangerBg, color: COLORS.dangerAccent },
  CRITICAL: { bg: COLORS.dangerBg, color: COLORS.dangerAccent },
};

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
}

export const AuditLogScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch<AppDispatch>();
  const [activeFilter, setActiveFilter] = useState<SeverityFilter>('ALL');
  const [search, setSearch] = useState('');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);

  const { data, isLoading, isError, refetch } = useAuditLog(activeFilter === 'ALL' ? undefined : { severity: activeFilter });
  const entries = data?.items ?? [];
  const { data: allEntriesForCounts } = useAuditLog();
  const allEntries = allEntriesForCounts?.items ?? [];
  const countFor = (f: SeverityFilter) =>
    f === 'ALL' ? allEntries.length : allEntries.filter((e) => e.severity === f).length;
  const filterCounts = QUICK_FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f] = countFor(f);
    return acc;
  }, {});

  const filtered = entries.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return e.userName.toLowerCase().includes(q) || e.action.toLowerCase().includes(q) || e.resource.toLowerCase().includes(q);
  });

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Icon name="shield-crown" size={20} color={COLORS.superAdmin} />
        <Text style={[styles.headerTitle, { flex: 1 }]}>Audit Logs</Text>
        <TouchableOpacity onPress={() => confirmLogout(dispatch)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="logout" size={20} color={COLORS.heading} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={styles.titleBox}>
          <Text style={styles.title}>Activity Log</Text>
          <Text style={styles.subtitle}>Real-time record of every action taken across this cafe's account.</Text>
        </View>

        <View style={styles.filterBox}>
          <Text style={styles.filterLabel}>SEVERITY:</Text>
          <CategoryFilterTrigger
            label={`${activeFilter} · ${countFor(activeFilter)}`}
            onPress={() => setCategoryPickerVisible(true)}
            style={{ marginHorizontal: 0, marginBottom: 0 }}
          />
          <CategoryFilterModal
            visible={categoryPickerVisible}
            onClose={() => setCategoryPickerVisible(false)}
            title="Filter by Severity"
            categories={QUICK_FILTERS}
            activeCategory={activeFilter}
            counts={filterCounts}
            onSelect={(label) => setActiveFilter(label as SeverityFilter)}
          />
        </View>

        <View style={styles.searchWrapper}>
          <Icon name="magnify" size={18} color={COLORS.muted} style={{ marginRight: 4 }} />
          <View style={styles.searchInputWrap}>
            <TextInput
              style={[styles.searchInput, { paddingRight: 12 }]}
              placeholder="Search target or user..."
              placeholderTextColor={COLORS.placeholder}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && <SearchClearButton onPress={() => setSearch('')} />}
          </View>
        </View>

        {isError && entries.length === 0 ? (
          <ErrorState
            title="Couldn't load audit logs"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : (
        <View style={styles.tableCard}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>TIMESTAMP</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.4 }]}>USER</Text>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>ACTION</Text>
          </View>

          {isLoading && (
            <View style={{ padding: 7 }}>
              <SkeletonList rows={6} />
            </View>
          )}

          {!isLoading && filtered.length === 0 && (
            <Text style={{ padding: 8, color: COLORS.muted, fontSize: 13 }}>No matching activity found.</Text>
          )}

          {filtered.map((entry, index) => {
            const { date, time } = formatTimestamp(entry.timestamp);
            const sev = SEVERITY_STYLE[entry.severity];
            return (
              <View key={entry.id} style={[styles.tableRow, index !== filtered.length - 1 && styles.tableRowDivider]}>
                <View style={{ flex: 1.2 }}>
                  <Text style={styles.timestampDate}>{date}</Text>
                  <Text style={styles.timestampTime}>{time}</Text>
                </View>
                <View style={[styles.userCell, { flex: 1.4 }]}>
                  <View style={[styles.avatarCircle, { backgroundColor: COLORS.heading }]}>
                    <Text style={styles.avatarText}>{entry.userName.slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.userName} numberOfLines={1}>{entry.userName}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={[styles.actionBadge, { backgroundColor: sev.bg }]}>
                    <Text style={[styles.actionBadgeText, { color: sev.color }]} numberOfLines={2}>
                      {entry.action}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}

          {!!data && (
            <View style={styles.paginationRow}>
              <Text style={styles.paginationText}>
                Showing {filtered.length} of {data.totalCount} entries
              </Text>
            </View>
          )}
        </View>
        )}
      </ScrollView>
    </View>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4 : 3,
    paddingHorizontal: isDesktopWeb ? 8 : 6,
    paddingTop: isDesktopWeb ? 6 : 4.5,
    paddingBottom: isDesktopWeb ? 6 : 4.5,
  },
  headerTitle: {
    fontSize: isDesktopWeb ? 18 : 14,
    fontWeight: 'bold',
    color: COLORS.superAdmin,
  },
  titleBox: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 8 : 6,
    borderRadius: 8,
    padding: isDesktopWeb ? 9 : 6.75,
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  title: {
    fontSize: isDesktopWeb ? 24 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 3 : 2.25,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 18,
  },
  filterBox: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 8 : 6,
    borderRadius: 8,
    padding: isDesktopWeb ? 8 : 6,
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
    marginBottom: isDesktopWeb ? 5 : 3.75,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    marginHorizontal: isDesktopWeb ? 8 : 6,
    paddingHorizontal: isDesktopWeb ? 7 : 5.25,
    height: 46,
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  searchInputWrap: {
    flex: 1,
    borderRadius: 8,
  },
  searchInput: {
    width: '100%',
    fontSize: 16,
    color: COLORS.heading,
  },
  tableCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 8 : 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    paddingHorizontal: isDesktopWeb ? 7 : 5.25,
    paddingVertical: isDesktopWeb ? 5 : 3.75,
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.superAdmin,
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 7 : 5.25,
    paddingVertical: isDesktopWeb ? 7 : 5.25,
  },
  tableRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  timestampDate: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  timestampTime: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 1 : 0.75,
  },
  userCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4 : 3,
  },
  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
    flexShrink: 1,
  },
  actionBadge: {
    paddingHorizontal: 3,
    paddingVertical: 1.88,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  paginationRow: {
    padding: 5.25,
    backgroundColor: COLORS.background,
  },
  paginationText: {
    fontSize: 11,
    color: COLORS.muted,
  },
});
