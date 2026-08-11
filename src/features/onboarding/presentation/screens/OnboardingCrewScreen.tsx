import React, { useState } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, Modal, ScrollView, Platform, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';
import { showToast } from '../../../../core/store/uiSlice';
import { CloseButton } from '../../../../shared/components/atoms/CloseButton';
import { useCreateStaff, useUpdateStaffScreenAccess } from '../../../../core/api/hooks/useStaff';
import { useCompleteOnboarding } from '../../../../core/api/hooks/useSettings';
import { getApiErrorMessage } from '../../../../core/network/api';
import { LoginRole, StaffAccessMode } from '../../../../core/api/staffApi';
import { ROLE_LABELS } from '../../../../core/auth/permissions';
import { PARENT_SCREENS, childrenOf, SCREEN_MIN_PLAN } from '../../../../core/auth/screenCatalog';
import { usePlanCategory, categoryMeetsMin, PLAN_CATEGORY_LABEL } from '../../../../core/plan/planCategory';
import { WarmColors as COLORS } from '../../../../shared/design/warmTheme';
import { OnboardingScaffold } from '../components/OnboardingScaffold';
import { useResponsive } from '../../../../core/utils/useResponsive';

interface Member {
  id: string;
  contact: string;
  role: LoginRole;
  password: string;
  hasLoginPlanned: boolean;
  accessMode: StaffAccessMode;
  allowedScreens: string[];
}

const LOGIN_ROLES: LoginRole[] = ['Manager', 'Cashier', 'Chef', 'Waiter', 'KitchenStaff', 'Accountant'];

export const OnboardingCrewScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const dispatch = useDispatch();
  const currentUser = useSelector((state: any) => state.auth.user);
  const ownerName: string = currentUser?.name ?? 'Owner';
  const ownerEmail: string = currentUser?.email ?? '';
  const ownerInitials = ownerName.slice(0, 2).toUpperCase();
  const createStaff = useCreateStaff();
  const updateScreenAccess = useUpdateStaffScreenAccess();
  const completeOnboarding = useCompleteOnboarding();
  const { category: planCategory } = usePlanCategory();

  const [contact, setContact] = useState('');
  const [role, setRole] = useState<LoginRole>('Waiter');
  const [password, setPassword] = useState('');
  const [accessMode, setAccessMode] = useState<StaffAccessMode>('Automatic');
  const [customScreens, setCustomScreens] = useState<Set<string>>(new Set());
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [accessPickerOpen, setAccessPickerOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [finishing, setFinishing] = useState(false);

  // A contact that's a 10-digit phone number gets a real app login (see
  // StaffController.Create's wantsLogin rule — staff sign in with a mobile number,
  // not email) — email-only contacts stay roster-only.
  const willHaveLogin = /^\d{10}$/.test(contact.trim());

  const resetForm = () => {
    setContact('');
    setRole('Waiter');
    setPassword('');
    setAccessMode('Automatic');
    setCustomScreens(new Set());
  };

  const addMember = () => {
    const trimmedContact = contact.trim();
    if (!trimmedContact) return;
    if (!willHaveLogin && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedContact)) {
      dispatch(showToast({ message: 'Enter a valid 10-digit phone number or email address.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (willHaveLogin && password.length < 6) {
      dispatch(showToast({ message: 'Set a password (6+ characters) to give this member app access, or use an email address for a roster-only entry.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    setMembers((prev) => [
      ...prev,
      {
        id: `${Date.now()}`,
        contact: contact.trim(),
        role,
        password,
        hasLoginPlanned: willHaveLogin,
        accessMode: willHaveLogin ? accessMode : 'Automatic',
        allowedScreens: willHaveLogin ? Array.from(customScreens) : [],
      },
    ]);
    resetForm();
  };

  const finish = async () => {
    setFinishing(true);
    // Each invited crew member becomes a real Staff record on the backend — one with a
    // phone number also gets a real app login (password + role), so their screen access
    // (if Custom) can actually be attached to something. Members are removed from state
    // as they're created so a failure partway through (duplicate number, network blip)
    // doesn't re-submit already-created members on retry — the owner just fixes the
    // failing one and taps Finish again.
    for (const m of members) {
      try {
        const isPhone = /^\d{10}$/.test(m.contact);
        const created = await createStaff.mutateAsync({
          name: m.contact,
          role: m.role,
          email: isPhone ? undefined : m.contact,
          phone: isPhone ? m.contact : undefined,
          password: isPhone ? m.password : undefined,
          loginRole: isPhone ? m.role : undefined,
        });
        if (created.hasLogin && m.accessMode === 'Custom') {
          await updateScreenAccess.mutateAsync({ id: created.id, req: { accessMode: 'Custom', allowedScreens: m.allowedScreens } });
        }
        setMembers((prev) => prev.filter((x) => x.id !== m.id));
      } catch (err) {
        dispatch(showToast({ message: getApiErrorMessage(err, `Couldn't add ${m.contact}`), icon: 'alert-circle-outline', tone: 'danger' }));
        setFinishing(false);
        return;
      }
    }
    try {
      await completeOnboarding.mutateAsync();
      // RootNavigator swaps to the main app automatically once the settings
      // query re-fetches and hasCompletedOnboarding is true.
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Setup failed'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setFinishing(false);
    }
  };

  const toggleScreen = (key: string) => {
    setCustomScreens((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <OnboardingScaffold
      step={4}
      onBack={() => navigation.goBack()}
      onNext={finish}
      nextLabel={finishing ? 'Finishing…' : 'Finish Setup'}
      nextEnabled={!finishing}
    >
      <Text style={styles.headline}>Build your crew</Text>
      <Text style={styles.subtitle}>
        Invite your team to join PrabandhOS. Give each of them a role and, optionally, exactly
        which screens they can see — you can always change this later from Team Portal.
      </Text>

      {/* Owner card */}
      <View style={styles.ownerCard}>
        <View style={styles.ownerAvatar}>
          <Text style={styles.ownerAvatarText}>{ownerInitials}</Text>
        </View>
        <View style={styles.ownerInfo}>
          <Text style={styles.ownerName}>{ownerName} (You)</Text>
          <Text style={styles.ownerMeta}>Owner{ownerEmail ? ` · ${ownerEmail}` : ''}</Text>
        </View>
        <View style={styles.adminBadge}>
          <Text style={styles.adminBadgeText}>ADMIN</Text>
        </View>
      </View>

      {/* Added members */}
      {members.map((m) => (
        <View key={m.id} style={styles.memberRow}>
          <View style={styles.memberAvatar}>
            <Icon name="account" size={18} color={COLORS.heading} />
          </View>
          <View style={styles.ownerInfo}>
            <Text style={styles.memberContact}>{m.contact}</Text>
            <Text style={styles.ownerMeta}>
              {ROLE_LABELS[m.role]}
              {m.hasLoginPlanned
                ? m.accessMode === 'Custom'
                  ? ` · Custom access (${m.allowedScreens.length} screen${m.allowedScreens.length === 1 ? '' : 's'})`
                  : ' · Automatic access'
                : ' · No app login'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setMembers((p) => p.filter((x) => x.id !== m.id))}>
            <Icon name="close" size={18} color={COLORS.muted} />
          </TouchableOpacity>
        </View>
      ))}

      {/* Add form */}
      <View style={styles.addBox}>
        <Text style={styles.fieldLabel}>Phone or Email</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            value={contact}
            onChangeText={setContact}
            placeholder="Mobile number or barista@cafe.com"
            placeholderTextColor={COLORS.placeholder}
            autoCapitalize="none"
          />
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Role</Text>
        <TouchableOpacity style={styles.dropdown} onPress={() => setRolePickerOpen(true)}>
          <Text style={styles.dropdownText}>{ROLE_LABELS[role]}</Text>
          <Icon name="chevron-down" size={20} color={COLORS.muted} />
        </TouchableOpacity>

        {willHaveLogin && (
          <>
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>App Login Password</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                placeholderTextColor={COLORS.placeholder}
                secureTextEntry
              />
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Screen Access</Text>
            <View style={styles.accessModeRow}>
              <TouchableOpacity
                style={[styles.accessModeChip, accessMode === 'Automatic' && styles.accessModeChipActive]}
                onPress={() => setAccessMode('Automatic')}
              >
                <Text style={[styles.accessModeChipText, accessMode === 'Automatic' && styles.accessModeChipTextActive]}>Automatic</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.accessModeChip, accessMode === 'Custom' && styles.accessModeChipActive]}
                onPress={() => setAccessMode('Custom')}
              >
                <Text style={[styles.accessModeChipText, accessMode === 'Custom' && styles.accessModeChipTextActive]}>Custom</Text>
              </TouchableOpacity>
            </View>
            {accessMode === 'Automatic' ? (
              <Text style={styles.accessHint}>This login will see whatever {ROLE_LABELS[role]} normally sees.</Text>
            ) : (
              <TouchableOpacity style={styles.customizeBtn} onPress={() => setAccessPickerOpen(true)}>
                <Icon name="shield-key-outline" size={16} color={COLORS.heading} />
                <Text style={styles.customizeBtnText}>
                  {customScreens.size === 0 ? 'Choose screens…' : `${customScreens.size} screen${customScreens.size === 1 ? '' : 's'} selected`}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <TouchableOpacity style={styles.addBtn} onPress={addMember}>
          <Icon name="plus" size={18} color={COLORS.heading} />
          <Text style={styles.addBtnText}>Add Team Member</Text>
        </TouchableOpacity>
      </View>

      {/* Quote card */}
      <View style={styles.quoteCard}>
        <View style={styles.quoteOverlay}>
          <Text style={styles.quoteText}>
            "A great team is the secret ingredient to any successful cafe."
          </Text>
        </View>
      </View>

      {/* Role picker */}
      <Modal visible={rolePickerOpen} transparent animationType="fade" onRequestClose={() => setRolePickerOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setRolePickerOpen(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Select Role</Text>
            {LOGIN_ROLES.map((r) => (
              <TouchableOpacity key={r} style={styles.pickerRow} onPress={() => { setRole(r); setRolePickerOpen(false); }}>
                <Text style={styles.pickerRowText}>{ROLE_LABELS[r]}</Text>
                {role === r && <Icon name="check" size={18} color={COLORS.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Screen access picker */}
      <Modal visible={accessPickerOpen} transparent animationType="fade" onRequestClose={() => setAccessPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.accessSheet}>
            <View style={styles.accessSheetHeader}>
              <Text style={styles.pickerTitle}>Choose Screens</Text>
              <CloseButton onPress={() => setAccessPickerOpen(false)} size={22} color={COLORS.heading} />
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {PARENT_SCREENS.map((parent) => {
                const children = childrenOf(parent.key);
                return [parent, ...children].map((s) => {
                  const locked = !categoryMeetsMin(planCategory, SCREEN_MIN_PLAN[s.key] ?? 'NORMAL');
                  const checked = customScreens.has(s.key);
                  return (
                    <TouchableOpacity
                      key={s.key}
                      style={[styles.accessRow, s.parent && styles.accessRowIndent]}
                      onPress={() => !locked && toggleScreen(s.key)}
                      disabled={locked}
                    >
                      <View style={[styles.checkbox, checked && !locked && styles.checkboxChecked, locked && styles.checkboxDisabled]}>
                        {checked && !locked && <Icon name="check" size={13} color="#FFFFFF" />}
                      </View>
                      <Text style={[styles.accessRowText, locked && styles.accessRowTextDisabled]} numberOfLines={1}>{s.label}</Text>
                      {locked && (
                        <View style={styles.planBadge}>
                          <Text style={styles.planBadgeText}>{PLAN_CATEGORY_LABEL[s.minPlan]}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                });
              })}
            </ScrollView>
            <TouchableOpacity style={styles.doneBtn} onPress={() => setAccessPickerOpen(false)}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </OnboardingScaffold>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  headline: {
    fontSize: isDesktopWeb ? 32 : 12,
    fontWeight: '800',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  subtitle: {
    fontSize: isDesktopWeb ? 15 : 14,
    color: COLORS.muted,
    lineHeight: 22,
    marginBottom: isDesktopWeb ? 24 : 18,
  },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputTint,
    borderRadius: 8,
    padding: isDesktopWeb ? 16 : 12,
    gap: isDesktopWeb ? 12 : 9,
    marginBottom: isDesktopWeb ? 16 : 12,
  },
  ownerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: isDesktopWeb ? 15 : 12,
  },
  ownerInfo: {
    flex: 1,
  },
  ownerName: {
    fontSize: isDesktopWeb ? 15 : 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  ownerMeta: {
    fontSize: isDesktopWeb ? 13 : 12,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 2 : 1.5,
  },
  adminBadge: {
    backgroundColor: COLORS.chipBg,
    paddingHorizontal: isDesktopWeb ? 12 : 9,
    paddingVertical: isDesktopWeb ? 6 : 4.5,
    borderRadius: 10,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.heading,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 9,
    gap: isDesktopWeb ? 12 : 9,
    marginBottom: isDesktopWeb ? 10 : 7.5,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.inputTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberContact: {
    fontSize: isDesktopWeb ? 14 : 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  addBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.inputBorder,
    borderRadius: 8,
    padding: isDesktopWeb ? 18 : 13.5,
    marginBottom: isDesktopWeb ? 20 : 15,
  },
  fieldLabel: {
    fontSize: isDesktopWeb ? 14 : 12,
    fontWeight: '600',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  inputWrapper: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    height: 50,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  input: {
    fontSize: 16,
    color: COLORS.heading,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    height: 50,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  dropdownText: {
    fontSize: isDesktopWeb ? 15 : 12,
    color: COLORS.heading,
  },
  accessModeRow: {
    flexDirection: 'row',
    gap: isDesktopWeb ? 8 : 6,
  },
  accessModeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: isDesktopWeb ? 10 : 7.5,
    borderRadius: 10,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  accessModeChipActive: {
    backgroundColor: COLORS.button,
    borderColor: COLORS.button,
  },
  accessModeChipText: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  accessModeChipTextActive: {
    color: '#FFFFFF',
  },
  accessHint: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 8 : 6,
    lineHeight: 17,
  },
  customizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 8 : 6,
    marginTop: isDesktopWeb ? 10 : 7.5,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: isDesktopWeb ? 14 : 10.5,
    paddingVertical: isDesktopWeb ? 11 : 8.25,
  },
  customizeBtnText: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 8 : 6,
    borderWidth: 1.5,
    borderColor: COLORS.heading,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 13 : 9.75,
    marginTop: isDesktopWeb ? 18 : 13.5,
  },
  addBtnText: {
    fontSize: isDesktopWeb ? 15 : 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  quoteCard: {
    height: 180,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.button,
  },
  quoteOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    justifyContent: 'flex-end',
    padding: isDesktopWeb ? 18 : 13.5,
  },
  quoteText: {
    fontSize: isDesktopWeb ? 17 : 12,
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#FFFFFF',
    lineHeight: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: isDesktopWeb ? 20 : 15,
  },
  pickerSheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 12,
    padding: isDesktopWeb ? 14 : 10.5,
    overflow: 'hidden',
  },
  pickerTitle: {
    fontSize: isDesktopWeb ? 16 : 14,
    fontWeight: '800',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: isDesktopWeb ? 8 : 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  pickerRowText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  accessSheet: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 12,
    padding: isDesktopWeb ? 18 : 13.5,
  },
  accessSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  accessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 10 : 7.5,
    paddingVertical: isDesktopWeb ? 11 : 8.25,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  accessRowIndent: {
    paddingLeft: isDesktopWeb ? 24 : 18,
  },
  accessRowText: {
    flex: 1,
    fontSize: isDesktopWeb ? 14 : 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  accessRowTextDisabled: {
    color: COLORS.muted,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.button,
    borderColor: COLORS.button,
  },
  checkboxDisabled: {
    opacity: 0.4,
  },
  planBadge: {
    backgroundColor: COLORS.chipBg,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2.25,
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
  },
  doneBtn: {
    marginTop: 10.5,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: 9.75,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
