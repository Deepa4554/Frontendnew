import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { useStaffScreenAccess, useUpdateStaffScreenAccess } from '../../../../../core/api/hooks/useStaff';
import { usePlanCategory, PLAN_CATEGORY_LABEL, categoryMeetsMin } from '../../../../../core/plan/planCategory';
import { PARENT_SCREENS, childrenOf, SCREEN_CATALOG, SCREEN_MIN_PLAN, isValidScreenKey } from '../../../../../core/auth/screenCatalog';
import { AppRole, ROLE_LABELS, isScreenInRoleDefault } from '../../../../../core/auth/permissions';
import { StaffAccessMode } from '../../../../../core/api/staffApi';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

/**
 * Lets an Owner/Manager pick exactly which screens one staff login can see — Automatic
 * (the long-standing role default, e.g. every Waiter/Chef/KitchenStaff login hides the
 * same management screens) or Custom (an explicit allow-list, checked screen by screen,
 * grouped parent → children the way the app itself is organized). Screens above the
 * cafe's current plan are never selectable here regardless of mode — the backend
 * re-validates the same rule on save, this is just the UI reflecting it up front.
 * Saving takes effect on the staff member's own device within moments via a live
 * "accessChanged" push (see useLiveAccessSync + useOrdersRealtime, and
 * RealtimeNotifier.NotifyAccessChangedAsync on the API) — no re-login required either way.
 */
export const StaffAccessScreen = ({ navigation, route }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const staffId: number | undefined = route?.params?.staffId;
  const staffName: string = route?.params?.staffName ?? 'this staff member';

  const { category: planCategory } = usePlanCategory();
  const { data, isLoading, isError, refetch } = useStaffScreenAccess(staffId ?? null);
  const updateAccess = useUpdateStaffScreenAccess();

  const [mode, setMode] = useState<StaffAccessMode>('Automatic');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const hydrated = useRef(false);

  // Only hydrate local state from the server once per screen visit — otherwise a
  // background refetch (React Query refocus, etc.) would stomp on edits the owner is
  // mid-way through making before they've hit Save.
  useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    setMode(data.accessMode);
    setSelected(new Set(data.allowedScreens.filter(isValidScreenKey)));
  }, [data]);

  const staffRole = data?.role as AppRole | undefined;
  const isAutomatic = mode === 'Automatic';

  /** The role default, minus anything above the cafe's plan — what Automatic mode actually
   * resolves to right now. Doubles as the seed when an owner first switches to Custom. */
  const roleDefaultScreens = useMemo(
    () =>
      SCREEN_CATALOG.filter((s) => categoryMeetsMin(planCategory, s.minPlan) && isScreenInRoleDefault(staffRole, s.key))
        .map((s) => s.key),
    [planCategory, staffRole],
  );

  // Switching to Custom used to drop the owner into an empty allow-list, i.e. "this login
  // sees nothing" — which is almost never the intent. Seed it with the role default the
  // Automatic preview was just showing so Custom starts as "same as now, minus what I
  // untick". Only seeds a genuinely empty selection, never overwrites a saved Custom list.
  const switchMode = (next: StaffAccessMode) => {
    if (next === 'Custom' && selected.size === 0) setSelected(new Set(roleDefaultScreens));
    setMode(next);
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    if (!staffId) return;
    try {
      await updateAccess.mutateAsync({
        id: staffId,
        req: { accessMode: mode, allowedScreens: mode === 'Custom' ? Array.from(selected) : undefined },
      });
      dispatch(showToast({ message: `Screen access updated for ${staffName}.`, icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update screen access'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const renderRow = (key: string, label: string, icon: string, indent: boolean) => {
    const minPlan = SCREEN_MIN_PLAN[key] ?? 'NORMAL';
    const lockedByPlan = !categoryMeetsMin(planCategory, minPlan);
    const inSelection = selected.has(key);
    // Automatic renders the very same list as a read-only preview of what this login's
    // role already gets, so an owner can see the role default screen-by-screen instead of
    // taking the banner's word for it. Custom renders the editable allow-list.
    const checked = isAutomatic ? !lockedByPlan && isScreenInRoleDefault(staffRole, key) : inSelection;
    // A locked-but-already-checked row (e.g. the cafe's plan was downgraded after this
    // screen was granted) must stay removable — only block granting NEW locked screens.
    // Otherwise the owner can never uncheck it here, and Save keeps failing server-side
    // since UpdateScreenAccess rejects any above-plan screen in the submitted list.
    const disabled = isAutomatic || (lockedByPlan && !inSelection);
    const dimmed = disabled && !checked;

    return (
      <TouchableOpacity
        key={key}
        style={[styles.row, indent && styles.rowIndent]}
        onPress={() => !disabled && toggle(key)}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.checkbox,
            checked && styles.checkboxChecked,
            // Ticked but not editable — a flatter fill than the accent-blue Custom check,
            // so "this is what the role gets" never reads as "I just selected this".
            checked && isAutomatic && styles.checkboxReadOnly,
            dimmed && styles.checkboxDisabled,
          ]}
        >
          {checked && <Icon name="check" size={14} color="#FFFFFF" />}
        </View>
        <View style={styles.rowIconBox}>
          <Icon name={icon} size={16} color={dimmed ? COLORS.muted : COLORS.heading} />
        </View>
        <Text style={[styles.rowLabel, dimmed && styles.rowLabelDisabled]} numberOfLines={1}>{label}</Text>
        {lockedByPlan && (
          <View style={styles.planBadge}>
            <Text style={styles.planBadgeText}>{PLAN_CATEGORY_LABEL[minPlan]}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (!staffId) return null;

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="shield-account-outline" title="Screen Access" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Screen Access</Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      {isLoading ? (
        <View style={{ padding: 16 }}>
          <SkeletonList rows={6} />
        </View>
      ) : isError ? (
        <ErrorState
          title="Couldn't load screen access"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.subtitle}>{staffName} — choose which screens this login can see.</Text>

            <View style={styles.modeCard}>
              <TouchableOpacity
                style={[styles.modeOption, mode === 'Automatic' && styles.modeOptionActive]}
                onPress={() => switchMode('Automatic')}
                activeOpacity={0.8}
              >
                <Text style={[styles.modeOptionText, mode === 'Automatic' && styles.modeOptionTextActive]}>Automatic</Text>
                <Text style={[styles.modeOptionHint, mode === 'Automatic' && styles.modeOptionHintActive]}>Follow role default</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeOption, mode === 'Custom' && styles.modeOptionActive]}
                onPress={() => switchMode('Custom')}
                activeOpacity={0.8}
              >
                <Text style={[styles.modeOptionText, mode === 'Custom' && styles.modeOptionTextActive]}>Custom</Text>
                <Text style={[styles.modeOptionHint, mode === 'Custom' && styles.modeOptionHintActive]}>Pick screens yourself</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoBanner}>
              <Icon name={isAutomatic ? 'information-outline' : 'pencil-outline'} size={16} color={COLORS.muted} />
              <Text style={styles.infoBannerText}>
                {isAutomatic ? (
                  <>
                    <Text style={styles.infoBannerStrong}>
                      {staffRole ? ROLE_LABELS[staffRole] : 'This role'} sees the {roleDefaultScreens.length} ticked screen
                      {roleDefaultScreens.length === 1 ? '' : 's'} below.
                    </Text>
                    {' '}That's the role default on this cafe's plan — read-only here. Switch to Custom to pick screens
                    yourself.
                  </>
                ) : (
                  <>
                    <Text style={styles.infoBannerStrong}>
                      {selected.size} screen{selected.size === 1 ? '' : 's'} selected.
                    </Text>
                    {' '}Only these are visible to this login — the role default no longer applies.
                  </>
                )}
              </Text>
            </View>

            <View style={styles.listCard}>
              {PARENT_SCREENS.map((parent) => {
                const children = childrenOf(parent.key);
                return (
                  <View key={parent.key}>
                    {renderRow(parent.key, parent.label, parent.icon, false)}
                    {children.map((child) => renderRow(child.key, child.label, child.icon, true))}
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <View style={[styles.saveBar, { paddingBottom: insets.bottom + 14 }]}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={updateAccess.isPending} activeOpacity={0.8}>
              {updateAccess.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Screen Access</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 12 : 9,
    paddingBottom: isDesktopWeb ? 12 : 9,
  },
  iconBtn: { padding: isDesktopWeb ? 8 : 6 },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading, marginLeft: isDesktopWeb ? 4 : 3 },
  scrollContent: { padding: isDesktopWeb ? 16 : 12, paddingBottom: isDesktopWeb ? 100 : 75 },
  subtitle: { fontSize: 13, color: COLORS.muted, marginBottom: isDesktopWeb ? 16 : 12, lineHeight: 19 },
  modeCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 6 : 4.5,
    gap: isDesktopWeb ? 6 : 4.5,
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  modeOption: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: isDesktopWeb ? 10 : 7.5,
    alignItems: 'center',
  },
  modeOptionActive: { backgroundColor: COLORS.accent },
  modeOptionText: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: COLORS.heading },
  modeOptionTextActive: { color: '#FFFFFF' },
  modeOptionHint: { fontSize: 11, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  modeOptionHintActive: { color: 'rgba(255,255,255,0.85)' },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: isDesktopWeb ? 8 : 6,
    backgroundColor: COLORS.aiCardBg,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 9,
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  infoBannerText: { flex: 1, fontSize: 12, color: COLORS.muted, lineHeight: 17 },
  infoBannerStrong: { fontWeight: '700', color: COLORS.heading },
  listCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 10 : 7.5,
    paddingHorizontal: isDesktopWeb ? 14 : 10.5,
    paddingVertical: isDesktopWeb ? 12 : 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  rowIndent: { paddingLeft: isDesktopWeb ? 34 : 25.5, backgroundColor: COLORS.background },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  checkboxReadOnly: { backgroundColor: COLORS.muted, borderColor: COLORS.muted },
  checkboxDisabled: { opacity: 0.4 },
  rowIconBox: { width: 22, alignItems: 'center' },
  rowLabel: { flex: 1, fontSize: isDesktopWeb ? 14 : 12, fontWeight: '600', color: COLORS.heading },
  rowLabelDisabled: { color: COLORS.muted },
  planBadge: {
    backgroundColor: COLORS.chipBg,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 8 : 6,
    paddingVertical: isDesktopWeb ? 3 : 2.25,
  },
  planBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.muted },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 9,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 6,
    paddingVertical: 10.5,
    alignItems: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
