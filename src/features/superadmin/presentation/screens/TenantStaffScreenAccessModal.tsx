import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CloseButton } from '../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { WarmColors as COLORS } from '../../../../shared/design/warmTheme';
import { modalHeadingOverride } from '../../../../shared/design/commonStyles';
import { showToast } from '../../../../core/store/uiSlice';
import { getApiErrorMessage } from '../../../../core/network/api';
import {
  useTenantStaff,
  useTenantScreenAccess,
  useTenantStaffScreenAccess,
  useUpdateTenantStaffScreenAccess,
} from '../../../../core/api/hooks/useSuperAdmin';
import { ApiTenantSummary } from '../../../../core/api/superAdminApi';
import { ApiStaff, StaffAccessMode } from '../../../../core/api/staffApi';
import { PARENT_SCREENS, childrenOf, SCREEN_MIN_PLAN, isValidScreenKey } from '../../../../core/auth/screenCatalog';
import { PLAN_CATEGORY_LABEL, PlanCategory, categoryMeetsMin } from '../../../../core/plan/planCategory';
import { AppRole, ROLE_LABELS, isScreenInRoleDefault, isScreenEnabledForTenant } from '../../../../core/auth/permissions';

/**
 * Platform-admin-only picker for one tenant's STAFF-level screen access — one step below
 * TenantScreenAccessModal's cafe-wide ceiling. Exists because the normal per-staff picker
 * (StaffAccessScreen) is Owner/Manager-only and scoped to the caller's own tenant, so a
 * platform admin had no way to reach into a cafe and fix one login's access without owner
 * credentials. Same Automatic/Custom rules as StaffAccessScreen, just checked against the
 * TARGET tenant's plan/ceiling (fetched here) instead of the logged-in admin's own (it has
 * none — a platform admin isn't a member of any cafe's plan).
 */
export const TenantStaffScreenAccessModal = ({ tenant, onClose }: { tenant: ApiTenantSummary | null; onClose: () => void }) => {
  const dispatch = useDispatch();
  const [staff, setStaff] = useState<ApiStaff | null>(null);

  const { data: roster = [], isLoading: rosterLoading } = useTenantStaff(tenant?.id ?? null);
  const { data: ceiling } = useTenantScreenAccess(tenant?.id ?? null);
  const { data, isLoading } = useTenantStaffScreenAccess(tenant?.id ?? null, staff?.id ?? null);
  const updateAccess = useUpdateTenantStaffScreenAccess();

  const [mode, setMode] = useState<StaffAccessMode>('Automatic');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const hydrated = useRef<number | null>(null);

  useEffect(() => {
    if (!tenant) { setStaff(null); hydrated.current = null; }
  }, [tenant]);

  useEffect(() => {
    if (!data || hydrated.current === data.staffId) return;
    hydrated.current = data.staffId;
    setMode(data.accessMode);
    setSelected(new Set(data.allowedScreens.filter(isValidScreenKey)));
  }, [data]);

  const planCategory = (ceiling?.plan ?? 'NORMAL') as PlanCategory;
  const isTenantEnabled = (key: string) =>
    isScreenEnabledForTenant({ role: undefined, tenantScreenMode: ceiling?.screenMode, tenantEnabledScreens: ceiling?.enabledScreens }, key);
  const isAutomatic = mode === 'Automatic';
  const staffRole = data?.role as AppRole | undefined;

  const roleDefaultScreens = useMemo(
    () =>
      PARENT_SCREENS.flatMap((p) => [p, ...childrenOf(p.key)])
        .filter((s) => categoryMeetsMin(planCategory, s.minPlan) && isScreenInRoleDefault(staffRole, s.key) && isTenantEnabled(s.key))
        .map((s) => s.key),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planCategory, staffRole, ceiling?.screenMode, ceiling?.enabledScreens],
  );

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

  const close = () => { setStaff(null); onClose(); };

  const handleSave = async () => {
    if (!tenant || !staff) return;
    try {
      await updateAccess.mutateAsync({
        tenantId: tenant.id,
        staffId: staff.id,
        req: { accessMode: mode, allowedScreens: mode === 'Custom' ? Array.from(selected) : undefined },
      });
      dispatch(showToast({ message: `Screen access updated for ${staff.name}.`, icon: 'check-circle', tone: 'success' }));
      setStaff(null);
      hydrated.current = null;
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update screen access'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const renderRow = (key: string, label: string, icon: string, indent: boolean) => {
    const minPlan = (SCREEN_MIN_PLAN[key] ?? 'NORMAL') as PlanCategory;
    const lockedByPlan = !categoryMeetsMin(planCategory, minPlan);
    const inSelection = selected.has(key);
    const checked = isAutomatic ? !lockedByPlan && isScreenInRoleDefault(staffRole, key) && isTenantEnabled(key) : inSelection;
    const disabled = isAutomatic || (lockedByPlan && !inSelection) || !isTenantEnabled(key);
    const dimmed = disabled && !checked;

    return (
      <TouchableOpacity
        key={key}
        style={[styles.row, indent && styles.rowIndent]}
        onPress={() => !disabled && toggle(key)}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked, checked && isAutomatic && styles.checkboxReadOnly, dimmed && styles.checkboxDisabled]}>
          {checked && <Icon name="check" size={13} color="#FFFFFF" />}
        </View>
        <View style={styles.rowIconBox}>
          <Icon name={icon} size={15} color={dimmed ? COLORS.muted : COLORS.heading} />
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

  const loginRoster = roster.filter((s) => s.hasLogin);

  return (
    <Modal visible={!!tenant} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxHeight: '88%' }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>
              {staff ? `${tenant?.name} — ${staff.name}` : `${tenant?.name} — Staff Access`}
            </Text>
            <CloseButton onPress={close} size={18} />
          </View>

          {!staff ? (
            <>
              <Text style={styles.modalSubtitle}>Pick a login to change which screens it can see.</Text>
              {rosterLoading ? (
                <View style={{ paddingVertical: 15, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={COLORS.superAdmin} />
                </View>
              ) : loginRoster.length === 0 ? (
                <Text style={styles.emptyText}>No staff logins on this cafe yet.</Text>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={styles.listCard}>
                    {loginRoster.map((s) => (
                      <TouchableOpacity key={s.id} style={styles.staffRow} onPress={() => setStaff(s)} activeOpacity={0.7}>
                        <View style={styles.rowIconBox}>
                          <Icon name="account-outline" size={16} color={COLORS.heading} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.staffName}>{s.name}</Text>
                          <Text style={styles.staffRole}>{s.role}</Text>
                        </View>
                        <Icon name="chevron-right" size={16} color={COLORS.muted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}
            </>
          ) : isLoading || !data ? (
            <View style={{ paddingVertical: 15, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={COLORS.superAdmin} />
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.backRow} onPress={() => setStaff(null)}>
                <Icon name="arrow-left" size={14} color={COLORS.muted} />
                <Text style={styles.backText}>Back to staff list</Text>
              </TouchableOpacity>

              <View style={styles.modeCard}>
                <TouchableOpacity style={[styles.modeOption, isAutomatic && styles.modeOptionActive]} onPress={() => switchMode('Automatic')} activeOpacity={0.8}>
                  <Text style={[styles.modeOptionText, isAutomatic && styles.modeOptionTextActive]}>Automatic</Text>
                  <Text style={[styles.modeOptionHint, isAutomatic && styles.modeOptionHintActive]}>Follow role default</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modeOption, !isAutomatic && styles.modeOptionActive]} onPress={() => switchMode('Custom')} activeOpacity={0.8}>
                  <Text style={[styles.modeOptionText, !isAutomatic && styles.modeOptionTextActive]}>Custom</Text>
                  <Text style={[styles.modeOptionHint, !isAutomatic && styles.modeOptionHintActive]}>Pick screens yourself</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalSubtitle}>
                {isAutomatic
                  ? `${staffRole ? ROLE_LABELS[staffRole] : 'This role'} sees the ${roleDefaultScreens.length} ticked screen${roleDefaultScreens.length === 1 ? '' : 's'} below — the role default on this cafe's plan.`
                  : `${selected.size} screen${selected.size === 1 ? '' : 's'} selected — only these are visible to this login.`}
              </Text>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.listCard}>
                  {PARENT_SCREENS.filter((p) => isTenantEnabled(p.key)).map((parent) => {
                    const children = childrenOf(parent.key).filter((c) => isTenantEnabled(c.key));
                    return (
                      <View key={parent.key}>
                        {renderRow(parent.key, parent.label, parent.icon, false)}
                        {children.map((child) => renderRow(child.key, child.label, child.icon, true))}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={updateAccess.isPending} activeOpacity={0.8}>
                {updateAccess.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Save Screen Access</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 9 },
  modalCard: { backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 6, width: '100%', maxWidth: 520, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4, marginBottom: 1.5 },
  modalTitle: { fontSize: 14, fontWeight: '700', color: COLORS.heading, flexShrink: 1 },
  modalSubtitle: { fontSize: 12, color: COLORS.muted, marginBottom: 5, lineHeight: 16 },
  emptyText: { textAlign: 'center', color: COLORS.muted, paddingVertical: 12 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4.5 },
  backText: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  staffName: { fontSize: 13, fontWeight: '700', color: COLORS.heading },
  staffRole: { fontSize: 11, color: COLORS.muted, marginTop: 0.5 },
  modeCard: { flexDirection: 'row', backgroundColor: COLORS.background, borderRadius: 8, padding: 2, gap: 2, marginBottom: 5 },
  modeOption: { flex: 1, borderRadius: 8, paddingVertical: 4, alignItems: 'center' },
  modeOptionActive: { backgroundColor: COLORS.accent },
  modeOptionText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modeOptionTextActive: { color: '#FFFFFF' },
  modeOptionHint: { fontSize: 10, color: COLORS.muted, marginTop: 0.75 },
  modeOptionHintActive: { color: 'rgba(255,255,255,0.85)' },
  listCard: { backgroundColor: COLORS.background, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  rowIndent: { paddingLeft: 13 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: COLORS.inputBorder, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  checkboxReadOnly: { backgroundColor: COLORS.muted, borderColor: COLORS.muted },
  checkboxDisabled: { opacity: 0.4 },
  rowIconBox: { width: 20, alignItems: 'center' },
  rowLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.heading },
  rowLabelDisabled: { color: COLORS.muted },
  planBadge: { backgroundColor: COLORS.chipBg, borderRadius: 8, paddingHorizontal: 3, paddingVertical: 1 },
  planBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.muted },
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: 6, paddingVertical: 5, alignItems: 'center', marginTop: 5 },
  saveBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
