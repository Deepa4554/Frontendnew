import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { WarmColors as COLORS } from '../../../../shared/design/warmTheme';
import { modalHeadingOverride } from '../../../../shared/design/commonStyles';
import { showToast } from '../../../../core/store/uiSlice';
import { getApiErrorMessage } from '../../../../core/network/api';
import { useTenantScreenAccess, useUpdateTenantScreenAccess } from '../../../../core/api/hooks/useSuperAdmin';
import { ApiTenantSummary } from '../../../../core/api/superAdminApi';
import { PARENT_SCREENS, childrenOf, ancestorsOf, SCREEN_MIN_PLAN, isValidScreenKey } from '../../../../core/auth/screenCatalog';
import { PLAN_CATEGORY_LABEL, PlanCategory } from '../../../../core/plan/planCategory';

const PLAN_RANK: Record<PlanCategory, number> = { NORMAL: 0, PLUS: 1, PREMIUM: 2 };
const meetsPlan = (current: PlanCategory, min: PlanCategory) => PLAN_RANK[current] >= PLAN_RANK[min];

type ScreenMode = 'PlanDefault' | 'Custom';

/**
 * Platform-admin-only picker for the CAFE-level screen ceiling — see
 * Tenant.ScreenMode/EnabledScreens on the backend and core/auth/permissions.ts's
 * isScreenEnabledForTenant. This is one level ABOVE the per-staff Screen Access picker
 * (StaffAccessScreen): whatever is switched off here is invisible to every login in the
 * cafe, Owner included, regardless of that login's own role/Custom access. PlanDefault (the
 * default for every cafe) means "everything the plan includes"; Custom means only the
 * screens ticked below, always a subset of what the plan currently allows.
 *
 * Picking a child screen auto-includes its parent (a child can't be reachable without it);
 * dropping a parent auto-drops every child under it — same cascade rule
 * ScreenCatalog.Normalize enforces server-side on save, applied here too so the picker never
 * shows a state Save would silently rewrite.
 */
export const TenantScreenAccessModal = ({ tenant, onClose }: { tenant: ApiTenantSummary | null; onClose: () => void }) => {
  const dispatch = useDispatch();
  const { data, isLoading } = useTenantScreenAccess(tenant?.id ?? null);
  const updateAccess = useUpdateTenantScreenAccess();

  const [mode, setMode] = useState<ScreenMode>('PlanDefault');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const hydrated = useRef<number | null>(null);

  // Re-hydrate once per tenant (not on every background refetch) so an in-progress edit
  // never gets stomped — same convention as StaffAccessScreen.
  useEffect(() => {
    if (!data || hydrated.current === data.tenantId) return;
    hydrated.current = data.tenantId;
    setMode(data.screenMode);
    setSelected(new Set(data.enabledScreens.filter(isValidScreenKey)));
  }, [data]);

  const planCategory = (data?.plan ?? 'NORMAL') as PlanCategory;
  const isPlanDefault = mode === 'PlanDefault';

  const planDefaultScreens = useMemo(
    () => PARENT_SCREENS.flatMap((p) => [p, ...childrenOf(p.key)]).filter((s) => meetsPlan(planCategory, s.minPlan)).map((s) => s.key),
    [planCategory],
  );

  const switchMode = (next: ScreenMode) => {
    // Same "never start Custom from an empty allow-list" rule as the staff picker —
    // seed with what PlanDefault was just previewing.
    if (next === 'Custom' && selected.size === 0) setSelected(new Set(planDefaultScreens));
    setMode(next);
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        for (const child of childrenOf(key)) next.delete(child.key);
      } else {
        next.add(key);
        for (const ancestor of ancestorsOf(key)) next.add(ancestor);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!tenant) return;
    try {
      await updateAccess.mutateAsync({
        tenantId: tenant.id,
        req: { screenMode: mode, enabledScreens: mode === 'Custom' ? Array.from(selected) : undefined },
      });
      dispatch(showToast({ message: `Screen access updated for ${tenant.name}.`, icon: 'check-circle', tone: 'success' }));
      onClose();
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update screen access'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const renderRow = (key: string, label: string, icon: string, indent: boolean) => {
    const minPlan = (SCREEN_MIN_PLAN[key] ?? 'NORMAL') as PlanCategory;
    const lockedByPlan = !meetsPlan(planCategory, minPlan);
    const inSelection = selected.has(key);
    const checked = isPlanDefault ? !lockedByPlan : inSelection;
    const disabled = isPlanDefault || (lockedByPlan && !inSelection);
    const dimmed = disabled && !checked;

    return (
      <TouchableOpacity
        key={key}
        style={[styles.row, indent && styles.rowIndent]}
        onPress={() => !disabled && toggle(key)}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked, checked && isPlanDefault && styles.checkboxReadOnly, dimmed && styles.checkboxDisabled]}>
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

  return (
    <Modal visible={!!tenant} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxHeight: '88%' }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>{tenant?.name} — Screen Access</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="close" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          </View>

          {isLoading || !data ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={COLORS.superAdmin} />
            </View>
          ) : (
            <>
              <Text style={styles.modalSubtitle}>Which of this cafe's plan screens are actually available — applies to every login, including the Owner.</Text>

              <View style={styles.modeCard}>
                <TouchableOpacity style={[styles.modeOption, isPlanDefault && styles.modeOptionActive]} onPress={() => switchMode('PlanDefault')} activeOpacity={0.8}>
                  <Text style={[styles.modeOptionText, isPlanDefault && styles.modeOptionTextActive]}>Plan Default</Text>
                  <Text style={[styles.modeOptionHint, isPlanDefault && styles.modeOptionHintActive]}>Everything the plan includes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modeOption, !isPlanDefault && styles.modeOptionActive]} onPress={() => switchMode('Custom')} activeOpacity={0.8}>
                  <Text style={[styles.modeOptionText, !isPlanDefault && styles.modeOptionTextActive]}>Custom</Text>
                  <Text style={[styles.modeOptionHint, !isPlanDefault && styles.modeOptionHintActive]}>Curate for this cafe</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { backgroundColor: COLORS.cardAlt, borderRadius: 12, padding: 12, width: '100%', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 3 },
  modalTitle: { fontSize: 14, fontWeight: '700', color: COLORS.heading, flexShrink: 1 },
  modalSubtitle: { fontSize: 12, color: COLORS.muted, marginBottom: 10, lineHeight: 16 },
  modeCard: { flexDirection: 'row', backgroundColor: COLORS.background, borderRadius: 8, padding: 4, gap: 4, marginBottom: 10 },
  modeOption: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  modeOptionActive: { backgroundColor: COLORS.accent },
  modeOptionText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modeOptionTextActive: { color: '#FFFFFF' },
  modeOptionHint: { fontSize: 10, color: COLORS.muted, marginTop: 1.5 },
  modeOptionHintActive: { color: 'rgba(255,255,255,0.85)' },
  listCard: { backgroundColor: COLORS.background, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  rowIndent: { paddingLeft: 26 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: COLORS.inputBorder, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  checkboxReadOnly: { backgroundColor: COLORS.muted, borderColor: COLORS.muted },
  checkboxDisabled: { opacity: 0.4 },
  rowIconBox: { width: 20, alignItems: 'center' },
  rowLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.heading },
  rowLabelDisabled: { color: COLORS.muted },
  planBadge: { backgroundColor: COLORS.chipBg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  planBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.muted },
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: 6, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
