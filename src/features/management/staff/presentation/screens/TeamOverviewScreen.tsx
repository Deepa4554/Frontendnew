import React, { useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, Switch } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../../../core/store/rootReducer';
import { canAccessRoute } from '../../../../../core/auth/permissions';
import { usePlanCategory } from '../../../../../core/plan/planCategory';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { showToast } from '../../../../../core/store/uiSlice';
import { useStaff, useCreateStaff } from '../../../../../core/api/hooks/useStaff';
import { ApiStaff, StaffStatus, LoginRole, LOGIN_ROLES, LOGIN_ROLE_LABEL, STAFF_ROLE_OPTIONS } from '../../../../../core/api/staffApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonGrid } from '../../../../../shared/components/atoms/Skeleton';
import { SearchClearButton } from '../../../../../shared/components/atoms/SearchClearButton';
import { CategoryFilterModal, CategoryFilterTrigger } from '../../../../../shared/components/molecules/CategoryFilterModal';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const FILTERS = ['All', 'Active', 'On Leave', 'Suspended'];
const SORT_OPTIONS = ['Name (A-Z)', 'Name (Z-A)', 'Role (A-Z)', 'Status'];
const TREND_MONTHS = 6;

const STATUS_LABEL: Record<StaffStatus, string> = {
  ACTIVE: 'Active',
  ON_LEAVE: 'On Leave',
  SUSPENDED: 'Suspended',
  TERMINATED: 'Terminated',
};

const STATUS_FILTER: Record<string, StaffStatus | null> = {
  All: null,
  Active: 'ACTIVE',
  'On Leave': 'ON_LEAVE',
  Suspended: 'SUSPENDED',
};

/** Real join-date histogram (last 6 calendar months) for a status subset — used for the
 * stat-card sparkline. Not a fabricated series: it's actually how many of these staff
 * joined each month, just like the Dashboard KPI bars derive from real daily revenue. */
const monthlyJoinCounts = (list: ApiStaff[]): number[] => {
  const now = new Date();
  const buckets = new Array(TREND_MONTHS).fill(0);
  list.forEach((s) => {
    const joined = new Date(s.joinedAt);
    if (Number.isNaN(joined.getTime())) return;
    const diff = (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth());
    if (diff >= 0 && diff < TREND_MONTHS) buckets[TREND_MONTHS - 1 - diff] += 1;
  });
  return buckets;
};

export const TeamOverviewScreen = ({ navigation }: any) => {
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  // HR Reports is its own catalog key, so plain Team Portal access doesn't imply it —
  // hide the shortcut rather than let it bounce off HRReports' own route guard.
  const user = useSelector((s: RootState) => s.auth.user);
  const { category: planCategory } = usePlanCategory();
  const canSeeHRReports = canAccessRoute(user ?? undefined, 'HRReports', planCategory);
  const STATUS_DOT: Record<StaffStatus, string> = {
    ACTIVE: COLORS.success,
    ON_LEAVE: COLORS.warning,
    SUSPENDED: COLORS.muted,
    TERMINATED: COLORS.muted,
  };
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [filterPickerVisible, setFilterPickerVisible] = useState(false);
  const [sortOption, setSortOption] = useState(SORT_OPTIONS[0]);
  const [sortPickerVisible, setSortPickerVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [rolePickerVisible, setRolePickerVisible] = useState(false);
  const [grantAccess, setGrantAccess] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newLoginRole, setNewLoginRole] = useState<LoginRole>('Waiter');
  // Only an Owner can grant another Owner login — Manager still sees the regular list
  // (backend enforces this too; see StaffController.Create).
  const newLoginRoleOptions = user?.role === 'Owner' ? (['Owner', ...LOGIN_ROLES] as LoginRole[]) : LOGIN_ROLES;

  const { data: staff = [], isLoading } = useStaff();
  const createStaff = useCreateStaff();

  const filtered = staff.filter((s) => {
    const statusFilter = STATUS_FILTER[filter];
    return (statusFilter === null || s.status === statusFilter) && s.name.toLowerCase().includes(search.toLowerCase());
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortOption) {
      case 'Name (Z-A)':
        return b.name.localeCompare(a.name);
      case 'Role (A-Z)':
        return a.role.localeCompare(b.role);
      case 'Status':
        return a.status.localeCompare(b.status);
      default:
        return a.name.localeCompare(b.name);
    }
  });

  const filterCounts = FILTERS.reduce<Record<string, number>>((acc, f) => {
    const statusFilter = STATUS_FILTER[f];
    acc[f] = statusFilter === null ? staff.length : staff.filter((s) => s.status === statusFilter).length;
    return acc;
  }, {});

  const activeCount = staff.filter((s) => s.status === 'ACTIVE').length;
  const onLeaveCount = staff.filter((s) => s.status === 'ON_LEAVE').length;
  const activePct = staff.length > 0 ? (activeCount / staff.length) * 100 : 0;
  const onLeavePct = staff.length > 0 ? (onLeaveCount / staff.length) * 100 : 0;
  const activeTrend = monthlyJoinCounts(staff.filter((s) => s.status === 'ACTIVE'));
  const onLeaveTrend = monthlyJoinCounts(staff.filter((s) => s.status === 'ON_LEAVE'));
  const activeTrendMax = Math.max(1, ...activeTrend);
  const onLeaveTrendMax = Math.max(1, ...onLeaveTrend);

  const resetAddForm = () => {
    setNewName('');
    setNewRole('');
    setCustomRole('');
    setGrantAccess(false);
    setNewPhone('');
    setNewPassword('');
    setNewLoginRole('Waiter');
  };

  const effectiveRole = newRole === 'Other' ? customRole.trim() : newRole;

  const handleAddStaff = async () => {
    if (!newName.trim() || !effectiveRole) {
      dispatch(showToast({ message: 'Enter both name and role.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (grantAccess) {
      if (!newPhone.trim() || !/^\d{10}$/.test(newPhone.trim())) {
        dispatch(showToast({ message: 'Enter a valid 10-digit mobile number to give this staff member app access.', icon: 'alert-circle-outline', tone: 'warning' }));
        return;
      }
      if (newPassword.length < 6) {
        dispatch(showToast({ message: 'Password must be at least 6 characters.', icon: 'alert-circle-outline', tone: 'warning' }));
        return;
      }
    }
    try {
      await createStaff.mutateAsync({
        name: newName.trim(),
        role: effectiveRole,
        ...(grantAccess ? { phone: newPhone.trim(), password: newPassword, loginRole: newLoginRole } : {}),
      });
      setAddVisible(false);
      resetAddForm();
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add staff'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  return (
    <View style={styles.container}>
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="account-group" size={22} color={COLORS.accent} />
          <Text style={styles.headerTitle}>Team Portal</Text>
          <View style={{ flex: 1 }} />
          {canSeeHRReports && (
            <TouchableOpacity onPress={() => navigation.navigate('HRReports')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="file-chart-outline" size={22} color={COLORS.heading} />
            </TouchableOpacity>
          )}
        </View>
      )}
      <DesktopPageHeader
        icon="account-group"
        title="Team"
        right={canSeeHRReports ? (
          <TouchableOpacity style={styles.desktopReportsBtn} onPress={() => navigation.navigate('HRReports')}>
            <Icon name="file-chart-outline" size={16} color={COLORS.heading} />
            <Text style={styles.desktopReportsBtnText}>Reports</Text>
          </TouchableOpacity>
        ) : undefined}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={[styles.statsRow, isDesktopWeb && { paddingHorizontal: 16 }]}>
          <View style={styles.statCard}>
            <View style={styles.statCardTopRow}>
              <View style={[styles.statIconCircle, { backgroundColor: COLORS.aiCardBg }]}>
                <Icon name="account-group-outline" size={isDesktopWeb ? 18 : 20} color={COLORS.accent} />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel}>Active Staff</Text>
                <Text style={styles.statValue}>
                  {activeCount} <Text style={styles.statValueSub}>/ {staff.length} staff</Text>
                </Text>
              </View>
              {activeTrend.some((v) => v > 0) && (
                <View style={styles.miniSparkline}>
                  {activeTrend.map((v, i) => (
                    <View
                      key={i}
                      style={[
                        styles.miniSparkBar,
                        { height: Math.max(3, (v / activeTrendMax) * 32), backgroundColor: COLORS.success },
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>
            <View style={styles.statPctRow}>
              <View style={[styles.statDot, { backgroundColor: COLORS.success }]} />
              <Text style={styles.statPctText}>{activePct.toFixed(1)}% active</Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statCardTopRow}>
              <View style={[styles.statIconCircle, { backgroundColor: COLORS.aiCardBg }]}>
                <Icon name="calendar-account-outline" size={isDesktopWeb ? 18 : 20} color={COLORS.aiIconBg} />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel}>On Leave</Text>
                <Text style={styles.statValue}>
                  {onLeaveCount} <Text style={styles.statValueSub}>staff</Text>
                </Text>
              </View>
              {onLeaveTrend.some((v) => v > 0) && (
                <View style={styles.miniSparkline}>
                  {onLeaveTrend.map((v, i) => (
                    <View
                      key={i}
                      style={[
                        styles.miniSparkBar,
                        { height: Math.max(3, (v / onLeaveTrendMax) * 32), backgroundColor: COLORS.aiIconBg },
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>
            <View style={styles.statPctRow}>
              <View style={[styles.statDot, { backgroundColor: COLORS.muted }]} />
              <Text style={styles.statPctText}>{onLeavePct.toFixed(1)}% on leave</Text>
            </View>
          </View>
        </View>

        {isDesktopWeb ? (
          <View style={styles.desktopFilterRow}>
            <View style={styles.desktopSearchWrapper}>
              <Icon name="magnify" size={18} color={COLORS.muted} style={{ marginRight: 8 }} />
              <View style={styles.searchInputWrap}>
                <TextInput
                  style={[styles.searchInput, { paddingRight: 24 }]}
                  placeholder="Search staff by name or role..."
                  placeholderTextColor={COLORS.placeholder}
                  value={search}
                  onChangeText={setSearch}
                />
                {!!search && <SearchClearButton onPress={() => setSearch('')} />}
              </View>
            </View>
            <View style={styles.pillsRow}>
              {FILTERS.map((f) => {
                const active = f === filter;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[styles.filterPill, active && styles.filterPillActive]}
                    onPress={() => setFilter(f)}
                  >
                    <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{f}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.sortDropdown} onPress={() => setSortPickerVisible(true)}>
              <Text style={styles.sortDropdownText} numberOfLines={1}>{sortOption}</Text>
              <Icon name="chevron-down" size={16} color={COLORS.muted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.funnelBtn} onPress={() => setFilterPickerVisible(true)}>
              <Icon name="tune-variant" size={16} color={COLORS.heading} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.searchWrapper}>
              <Icon name="magnify" size={20} color={COLORS.muted} style={{ marginRight: 8 }} />
              <View style={styles.searchInputWrap}>
                <TextInput
                  style={[styles.searchInput, { paddingRight: 24 }]}
                  placeholder="Search staff by name or role..."
                  placeholderTextColor={COLORS.placeholder}
                  value={search}
                  onChangeText={setSearch}
                />
                {!!search && <SearchClearButton onPress={() => setSearch('')} />}
              </View>
            </View>
            <CategoryFilterTrigger label={`${filter} · ${filterCounts[filter] ?? 0}`} onPress={() => setFilterPickerVisible(true)} />
          </>
        )}

        <CategoryFilterModal
          visible={filterPickerVisible}
          onClose={() => setFilterPickerVisible(false)}
          title="Filter by Status"
          categories={FILTERS}
          activeCategory={filter}
          counts={filterCounts}
          onSelect={setFilter}
        />
        <CategoryFilterModal
          visible={sortPickerVisible}
          onClose={() => setSortPickerVisible(false)}
          title="Sort by"
          categories={SORT_OPTIONS}
          activeCategory={sortOption}
          onSelect={setSortOption}
        />

        <View style={[styles.directoryHeaderRow, isDesktopWeb && { paddingHorizontal: 16 }]}>
          <Text style={styles.directoryLabel}>Directory</Text>
          {isDesktopWeb && (
            <TouchableOpacity style={styles.addStaffBtn} onPress={() => setAddVisible(true)}>
              <Icon name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.addStaffBtnText}>Add Staff</Text>
            </TouchableOpacity>
          )}
        </View>

        {!isLoading && filtered.length === 0 && (
          <Text style={styles.emptyText}>No staff yet — tap + to add your first team member</Text>
        )}

        {isLoading && <SkeletonGrid items={6} columns={2} style={isDesktopWeb ? undefined : { paddingHorizontal: 16 }} />}

        <View style={isDesktopWeb && styles.staffGridDesktop}>
        {!isLoading && sorted.map((s: ApiStaff) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.staffCard, isDesktopWeb && styles.staffCardDesktop]}
            onPress={() => navigation.navigate('StaffProfile', { staffId: s.id })}
            activeOpacity={0.85}
          >
            <View style={styles.staffAvatar}>
              <Text style={styles.staffAvatarText}>{s.name.substring(0, 2).toUpperCase()}</Text>
            </View>
            <View style={styles.staffInfo}>
              <View style={styles.staffNameRow}>
                <Text style={styles.staffName} numberOfLines={1}>{s.name}</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{s.role.toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_DOT[s.status] }]} />
                <Text style={styles.statusText}>{STATUS_LABEL[s.status]}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.staffMoreBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={(e) => {
                e.stopPropagation();
                navigation.navigate('StaffProfile', { staffId: s.id });
              }}
            >
              <Icon name="dots-vertical" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
        </View>
      </ScrollView>

      {!isDesktopWeb && (
        <TouchableOpacity style={styles.fab} onPress={() => setAddVisible(true)}>
          <Icon name="plus" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      <Modal visible={addVisible} transparent animationType="slide" onRequestClose={() => setAddVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Add Staff Member</Text>
              <CloseButton onPress={() => { setAddVisible(false); resetAddForm(); }} size={18} />
            </View>
            <View style={{ borderRadius: 12 }}>
              <TextInput
                style={styles.modalInput}
                placeholder="Name"
                placeholderTextColor={COLORS.placeholder}
                value={newName}
                onChangeText={setNewName}
              />
            </View>
            <TouchableOpacity style={styles.modalInput} onPress={() => setRolePickerVisible(true)}>
              <View style={styles.rolePickerRow}>
                <Text style={newRole ? styles.rolePickerValue : styles.rolePickerPlaceholder}>
                  {newRole || 'Select role'}
                </Text>
                <Icon name="chevron-down" size={16} color={COLORS.muted} />
              </View>
            </TouchableOpacity>
            {newRole === 'Other' && (
              <View style={{ borderRadius: 12 }}>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Enter role"
                  placeholderTextColor={COLORS.placeholder}
                  value={customRole}
                  onChangeText={setCustomRole}
                />
              </View>
            )}

            <View style={styles.accessRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.accessTitle}>Give app access</Text>
                <Text style={styles.accessDesc}>Lets this person log in to PrabandhOS on this cafe's account.</Text>
              </View>
              <Switch
                value={grantAccess}
                onValueChange={setGrantAccess}
                trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                thumbColor="#FFFFFF"
              />
            </View>

            {grantAccess && (
              <>
                <View style={{ borderRadius: 12 }}>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Login mobile number"
                    placeholderTextColor={COLORS.placeholder}
                    value={newPhone}
                    onChangeText={(t) => setNewPhone(t.replace(/[^\d]/g, '').slice(0, 10))}
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>
                <View style={{ borderRadius: 12 }}>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Password (min 6 characters)"
                    placeholderTextColor={COLORS.placeholder}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                  />
                </View>
                <View style={styles.loginRoleRow}>
                  {newLoginRoleOptions.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.loginRolePill, newLoginRole === r && styles.loginRolePillActive]}
                      onPress={() => setNewLoginRole(r)}
                    >
                      <Text style={[styles.loginRolePillText, newLoginRole === r && styles.loginRolePillTextActive]}>
                        {LOGIN_ROLE_LABEL[r]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setAddVisible(false); resetAddForm(); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAddBtn} onPress={handleAddStaff} disabled={createStaff.isPending}>
                <Text style={styles.modalAddText}>{createStaff.isPending ? 'Adding…' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CategoryFilterModal
        visible={rolePickerVisible}
        onClose={() => setRolePickerVisible(false)}
        title="Select Role"
        categories={[...STAFF_ROLE_OPTIONS]}
        activeCategory={newRole}
        onSelect={setNewRole}
      />
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  desktopReportsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4 : 4.5,
    marginLeft: isDesktopWeb ? 12 : 12,
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    paddingVertical: isDesktopWeb ? 6 : 6,
    borderRadius: 8,
    backgroundColor: COLORS.cardAlt,
  },
  desktopReportsBtnText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading },
  staffGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: isDesktopWeb ? 16 : 24,
    gap: isDesktopWeb ? 8 : 12,
  },
  staffCardDesktop: {
    width: '31%',
    marginHorizontal: isDesktopWeb ? 0 : 6,
    marginBottom: isDesktopWeb ? 0 : 9,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    paddingTop: isDesktopWeb ? 12 : 9,
    paddingBottom: isDesktopWeb ? 12 : 9,
    gap: isDesktopWeb ? 10 : 7.5,
  },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  statsRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 12 : 12, gap: isDesktopWeb ? 12 : 9, marginBottom: isDesktopWeb ? 14 : 12 },
  statCard: { flex: 1, backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: isDesktopWeb ? 14 : 12 },
  statCardTopRow: { flexDirection: 'row', alignItems: 'center' },
  statIconCircle: {
    width: isDesktopWeb ? 40 : 36,
    height: isDesktopWeb ? 40 : 36,
    borderRadius: isDesktopWeb ? 20 : 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: isDesktopWeb ? 12 : 10,
  },
  statTextCol: { flexShrink: 1 },
  statLabel: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '600', color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 3 },
  statValue: { fontSize: isDesktopWeb ? 22 : 16, fontWeight: 'bold', color: COLORS.heading },
  statValueSub: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '600', color: COLORS.muted },
  statHint: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 1.5 : 1.5 },
  statPctRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: isDesktopWeb ? 10 : 8 },
  statDot: { width: 7, height: 7, borderRadius: 3.5 },
  statPctText: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  miniSparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    width: isDesktopWeb ? 70 : 50,
    height: 36,
    marginLeft: 8,
  },
  miniSparkBar: {
    flex: 1,
    opacity: 0.7,
    borderRadius: 2,
    minWidth: 2,
  },
  desktopFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
    gap: 10,
  },
  desktopSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    flex: 1.4,
  },
  pillsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.chipBg,
  },
  filterPillActive: { backgroundColor: COLORS.chipActiveBg },
  filterPillText: { fontSize: 13, fontWeight: '700', color: COLORS.heading },
  filterPillTextActive: { color: '#FFFFFF' },
  sortDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    maxWidth: 160,
  },
  sortDropdownText: { fontSize: 13, fontWeight: '600', color: COLORS.heading, flexShrink: 1 },
  funnelBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    height: isDesktopWeb ? 38 : 50,
    marginBottom: isDesktopWeb ? 8 : 12,
  },
  searchInputWrap: { flex: 1 },
  searchInput: { width: '100%', fontSize: 16, color: COLORS.heading },
  directoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 10 : 9,
  },
  directoryLabel: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: '700', color: COLORS.heading },
  addStaffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.button,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  addStaffBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 12,
    padding: isDesktopWeb ? 14 : 9,
    marginBottom: isDesktopWeb ? 9 : 9,
    gap: isDesktopWeb ? 10 : 9,
  },
  staffAvatar: {
    width: isDesktopWeb ? 48 : 52,
    height: isDesktopWeb ? 48 : 52,
    borderRadius: isDesktopWeb ? 24 : 26,
    backgroundColor: COLORS.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffAvatarText: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: '700', color: COLORS.heading },
  staffInfo: { flex: 1 },
  staffNameRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 6, marginBottom: isDesktopWeb ? 4 : 3.75 },
  staffName: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '700', color: COLORS.heading, flexShrink: 1 },
  roleBadge: { paddingHorizontal: isDesktopWeb ? 6 : 6, paddingVertical: isDesktopWeb ? 1.5 : 1.5, borderRadius: 8, backgroundColor: COLORS.chipBg },
  roleBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.muted },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4 : 4.5 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: 12, color: COLORS.muted },
  staffMoreBtn: { padding: 4 },
  emptyText: { textAlign: 'center', color: COLORS.muted, paddingVertical: isDesktopWeb ? 18 : 18, paddingHorizontal: isDesktopWeb ? 24 : 24 },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: isDesktopWeb ? 'center' : 'flex-end',
    alignItems: isDesktopWeb ? 'center' : 'stretch',
  },
  modalCard: {
    backgroundColor: COLORS.cardAlt,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: isDesktopWeb ? 12 : 0,
    borderBottomRightRadius: isDesktopWeb ? 12 : 0,
    padding: isDesktopWeb ? 16 : 12,
    overflow: 'hidden',
    width: isDesktopWeb ? 440 : '100%',
  },
  rolePickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rolePickerValue: { fontSize: 12, color: COLORS.heading },
  rolePickerPlaceholder: { fontSize: 12, color: COLORS.placeholder },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '700', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 6, flexShrink: 1 },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: isDesktopWeb ? 10 : 8,
    paddingHorizontal: 10,
    paddingVertical: isDesktopWeb ? 6 : undefined,
    height: isDesktopWeb ? undefined : 34,
    fontSize: 12,
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  accessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: isDesktopWeb ? 7 : 7.5,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  accessTitle: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  accessDesc: { fontSize: 11, color: COLORS.muted, marginTop: 1.5 },
  loginRoleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  loginRolePill: {
    paddingHorizontal: 9,
    paddingVertical: 5.25,
    borderRadius: 16,
    backgroundColor: COLORS.background,
  },
  loginRolePillActive: { backgroundColor: COLORS.button },
  loginRolePillText: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  loginRolePillTextActive: { color: '#FFFFFF' },
  modalActions: { flexDirection: 'row', gap: 6, marginTop: 6 },
  modalCancelBtn: { flex: 1, paddingVertical: 7.5, borderRadius: 6, alignItems: 'center', backgroundColor: COLORS.background },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  modalAddBtn: { flex: 1, paddingVertical: 7.5, borderRadius: 6, alignItems: 'center', backgroundColor: COLORS.button },
  modalAddText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
