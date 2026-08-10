import React, { useState, useEffect } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Switch, Modal, ActivityIndicator, Image } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useSettings,
  useUpdateSettings,
  useNotificationCategoryPreferences,
  useUpdateNotificationCategoryPreference,
} from '../../../../../core/api/hooks/useSettings';
import { notificationCategoryLabel } from '../../../../../core/notifications/categoryLabels';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { RootState } from '../../../../../core/store/rootReducer';
import { canAccessRoute, isOwnerOrManager } from '../../../../../core/auth/permissions';
import { usePlanCategory, categoryMeetsMin, PlanCategory } from '../../../../../core/plan/planCategory';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useBranches } from '../../../../../core/api/hooks/useBranches';
import { setActiveBranch } from '../../../../../core/store/branchSlice';
import { SkeletonRow, SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { LoadingOverlay } from '../../../../../shared/components/atoms/LoadingOverlay';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { InitialsAvatar } from '../../../../../shared/components/InitialsAvatar';
import { GlobalSearchTrigger } from '../../../../../shared/components/search/GlobalSearchTrigger';
import { SearchClearButton } from '../../../../../shared/components/atoms/SearchClearButton';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

type SettingId = /* 'security' | */ 'taxSlabs' | 'receipt' | 'receiptBuilder' | 'notif' | 'lang' | 'printer' | 'kitchen' | 'stations' | 'orderTypes' | 'autoCharges' | 'activeBranch';

/** `route` is the screen-catalog key for tiles that push their own Stack screen — each one
 * is separately grantable under Custom Screen Access, so the tile has to be filtered by the
 * same canAccessRoute the route guard uses. Without it a revoked tile still rendered here
 * and tapping it bounced silently back to MainTabs. Tiles that open an in-place modal
 * (receipt/notif/lang) have no route: they're part of Cafe Settings itself. */
const SETTINGS: { id: SettingId; title: string; desc: string; icon: string; ownerOnly?: boolean; ownerOrManagerOnly?: boolean; minPlan?: PlanCategory; route?: string }[] = [
  // Account Security — commented out for now, see the matching Modal below.
  // { id: 'security', title: 'Account Security', desc: 'Manage 2FA and terminal passcodes', icon: 'shield-outline' },
  { id: 'taxSlabs', title: 'Tax & GST Configuration', desc: 'Set the default tax rate and charge different GST rates per item (5% food, 12% packaged), with a per-rate split on the bill', icon: 'percent-outline', ownerOnly: true, route: 'TaxSlabManagement' },
  { id: 'receipt', title: 'Receipt Customization', desc: 'Edit business name, footer, and digital styles', icon: 'receipt' },
  { id: 'receiptBuilder', title: 'Receipt Builder', desc: 'Choose what prints on the bill — address, waiter, GST number, and more', icon: 'format-list-checks', ownerOnly: true, route: 'ReceiptBuilder' },
  { id: 'printer', title: 'Printer Settings', desc: 'Connect a WiFi or Bluetooth receipt printer', icon: 'printer-outline', route: 'PrinterSettings' },
  { id: 'kitchen', title: 'Kitchen Flow', desc: 'Choose 2-step or 3-step KDS status flow', icon: 'chef-hat', ownerOnly: true, route: 'KitchenFlowSettings' },
  { id: 'stations', title: 'Kitchen Stations', desc: 'Set up prep stations (Main Kitchen, Bar, Dessert) for KDS filtering and KOT routing', icon: 'chef-hat', ownerOnly: true, route: 'StationManagement' },
  { id: 'orderTypes', title: 'Order Types', desc: 'Choose which order types POS offers (Dine In/Takeaway/Delivery/Token)', icon: 'silverware-fork-knife', ownerOnly: true, route: 'OrderTypesSettings' },
  { id: 'autoCharges', title: 'Auto Charges', desc: 'Set default Service/Packing/Delivery charges that apply automatically by order type', icon: 'cash-plus', ownerOnly: true, route: 'AutoChargesSettings' },
  // Not gated by `route`/canAccessRoute like the tiles above — this opens an in-place
  // modal (no Stack screen of its own), so it needs its own role+plan check mirroring
  // BranchesController's actual server-side gate (Policies.OwnerOrManager + RequirePlus)
  // exactly, otherwise the tile would show for a login that gets a 403 the moment it
  // tries to list branches.
  { id: 'activeBranch', title: 'Active Branch', desc: "Switch which branch POS, Inventory, Dashboard, and Reports show — or view every location combined", icon: 'storefront-outline', ownerOrManagerOnly: true, minPlan: 'PLUS' },
  { id: 'notif', title: 'Notification Preferences', desc: 'Order, inventory, and shift alerts', icon: 'bell-outline' },
  { id: 'lang', title: 'Language & Region', desc: 'Default currency and local time', icon: 'web' },
];

const REGION_OPTIONS = [
  { currency: 'INR (₹)', region: 'Asia/Kolkata' },
  { currency: 'USD ($)', region: 'America/New_York' },
  { currency: 'GBP (£)', region: 'Europe/London' },
];

export const CafeSettingsScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [openModal, setOpenModal] = useState<SettingId | null>(null);

  const { data: settings, isLoading, isError, refetch } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: categoryPrefsData } = useNotificationCategoryPreferences();
  const updateCategoryPref = useUpdateNotificationCategoryPreference();
  const categoryPrefs = categoryPrefsData ?? [];
  const user = useSelector((s: RootState) => s.auth.user);
  const role = user?.role;
  const { category: planCategory } = usePlanCategory();

  // Matches BranchesController's backend gate (OwnerOrManager + Plus) exactly — a
  // Cashier/Accountant login would otherwise see the tile and hit a silent 403 the
  // moment it opens (they're not in canAccessRoute's floor-staff hidden set, so that
  // check alone isn't enough). ANDed with canAccessRoute so a Manager who's had
  // 'Branches' explicitly revoked under Custom Screen Access still loses this tile too.
  const branchSwitcherEligible =
    isOwnerOrManager(role) && categoryMeetsMin(planCategory, 'PLUS') && canAccessRoute(user ?? undefined, 'Branches', planCategory);
  const activeBranchId = useSelector((s: RootState) => s.branch.activeBranchId);
  const {
    data: branches = [],
    isLoading: branchesLoading,
    isError: branchesError,
    refetch: refetchBranches,
  } = useBranches({ enabled: branchSwitcherEligible });

  const [nameDraft, setNameDraft] = useState('');
  const [footerDraft, setFooterDraft] = useState('');

  useEffect(() => {
    if (settings) {
      setNameDraft(settings.businessName);
      setFooterDraft(settings.receiptFooter);
    }
  }, [settings]);

  const filteredSettings = SETTINGS.filter(
    (s) => (!s.ownerOnly || role === 'Owner')
      && (!s.ownerOrManagerOnly || isOwnerOrManager(role))
      && (!s.minPlan || categoryMeetsMin(planCategory, s.minPlan))
      && (!s.route || canAccessRoute(user ?? undefined, s.route, planCategory))
      && (s.title.toLowerCase().includes(search.toLowerCase()) || s.desc.toLowerCase().includes(search.toLowerCase())),
  );

  const openSetting = (id: SettingId) => {
    if (id === 'printer') {
      navigation.navigate('PrinterSettings');
      return;
    }
    if (id === 'kitchen') {
      navigation.navigate('KitchenFlowSettings');
      return;
    }
    if (id === 'stations') {
      navigation.navigate('StationManagement');
      return;
    }
    if (id === 'taxSlabs') {
      navigation.navigate('TaxSlabManagement');
      return;
    }
    if (id === 'orderTypes') {
      navigation.navigate('OrderTypesSettings');
      return;
    }
    if (id === 'autoCharges') {
      navigation.navigate('AutoChargesSettings');
      return;
    }
    if (id === 'receiptBuilder') {
      navigation.navigate('ReceiptBuilder');
      return;
    }
    if (id === 'activeBranch') {
      setOpenModal(id);
      return;
    }
    if (!settings) return;
    if (id === 'receipt') {
      setNameDraft(settings.businessName);
      setFooterDraft(settings.receiptFooter);
    }
    setOpenModal(id);
  };

  const saveReceipt = async () => {
    try {
      await updateSettings.mutateAsync({
        businessName: nameDraft.trim() || 'PrabandhOS',
        receiptFooter: footerDraft.trim(),
      });
      dispatch(showToast({ message: 'Receipt customization updated — check your next printed receipt.', icon: 'check-circle', tone: 'success' }));
      setOpenModal(null);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  // 'twoFactorEnabled' | 'terminalPasscodeRequired' dropped from here while Account
  // Security is commented out below — see the matching Modal's own comment.
  const toggleSetting = (
    field:
      | 'inventoryAlertsEnabled'
      | 'shiftReportsEnabled'
      | 'orderPlacedAlertsEnabled'
      | 'orderPendingConfirmationAlertsEnabled'
      | 'orderReadyAlertsEnabled'
      | 'approvalAlertsEnabled'
      | 'requireStaffOrderConfirmation',
  ) => {
    if (!settings) return;
    updateSettings.mutate({ [field]: !settings[field] });
  };

  const selectRegion = (opt: { currency: string; region: string }) => {
    updateSettings.mutate({ currency: opt.currency, region: opt.region });
  };

  // null = "All Branches" — the same activeBranchId POS/Inventory/Dashboard/Reports
  // all read (see branchSlice). Left selectable even for an inactive branch (matches
  // the Branches screen's own switch buttons, which allow the same thing so a closed
  // location's historical data stays reachable).
  const selectActiveBranch = (id: number | null, name: string) => {
    dispatch(setActiveBranch(id));
    dispatch(showToast({ message: `Now viewing ${name}`, icon: 'storefront-outline', tone: 'success' }));
  };

  if (isError && !settings) {
    return (
      <View style={styles.container}>
        <ErrorState
          title="Couldn't load settings"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  if (isLoading || !settings) {
    return (
      <View style={styles.container}>
        <View style={{ padding: 16 }}>
          <SkeletonRow avatar style={{ marginBottom: 20 }} />
          <SkeletonList rows={5} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="store-cog" title="Settings" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="store-cog" size={22} color={COLORS.accent} />
          <Text style={styles.headerTitle}>Cafe Settings</Text>
          <View style={{ flex: 1 }} />
          <GlobalSearchTrigger navigation={navigation} style={styles.iconBtn} />
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, paddingTop: 8 }}>
        <View style={styles.searchWrapper}>
          <Icon name="magnify" size={20} color={COLORS.muted} style={{ marginRight: 8 }} />
          <View style={styles.searchInputWrap}>
            <TextInput
              style={[styles.searchInput, { paddingRight: 24 }]}
              placeholder="Search settings..."
              placeholderTextColor={COLORS.placeholder}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && <SearchClearButton onPress={() => setSearch('')} />}
          </View>
        </View>

        {/* Admin profile card */}
        <TouchableOpacity style={styles.profileCard} onPress={() => navigation?.navigate?.('CafeProfileDetail')}>
          <View style={styles.profileAccent} />
          {settings.logoUrl ? (
            <Image source={{ uri: settings.logoUrl }} style={styles.profileImage} />
          ) : (
            <InitialsAvatar name={settings.businessName} size={56} style={styles.profileImage} />
          )}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{settings.businessName}</Text>
            <Text style={styles.profileRole}>Owner · Premium Tier</Text>
          </View>
          <View style={styles.activePill}>
            <Icon name="check-decagram" size={12} color={COLORS.accent} />
            <Text style={styles.activeText}>Active</Text>
          </View>
        </TouchableOpacity>

        {filteredSettings.map((s) => (
          <TouchableOpacity key={s.id} style={styles.settingCard} activeOpacity={0.85} onPress={() => openSetting(s.id)}>
            <View style={styles.settingIcon}>
              <Icon name={s.icon} size={20} color={COLORS.accent} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>{s.title}</Text>
              <Text style={styles.settingDesc}>{s.desc}</Text>
            </View>
            <Icon name="chevron-right" size={20} color={COLORS.muted} />
          </TouchableOpacity>
        ))}

        <Text style={styles.versionText}>App Version 4.2.0-stable</Text>
      </ScrollView>

      {/* ---------- Account Security ----------
      Commented out: TwoFactorEnabled/TerminalPasscodeRequired save fine but were never
      enforced anywhere (no OTP-at-login check, no terminal lock screen) — a toggle that
      controls nothing. Re-enable once those are actually built.
      <Modal visible={openModal === 'security'} transparent animationType="fade" onRequestClose={() => setOpenModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Account Security</Text>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Two-Factor Authentication</Text>
                <Text style={styles.toggleSub}>Require an OTP code at login</Text>
              </View>
              <Switch
                value={settings.twoFactorEnabled}
                onValueChange={() => toggleSetting('twoFactorEnabled')}
                trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Terminal Passcode</Text>
                <Text style={styles.toggleSub}>Require a passcode to unlock this POS terminal</Text>
              </View>
              <Switch
                value={settings.terminalPasscodeRequired}
                onValueChange={() => toggleSetting('terminalPasscodeRequired')}
                trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                thumbColor="#FFFFFF"
              />
            </View>
            <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setOpenModal(null)}>
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      */}

      {/* ---------- Receipt Customization ---------- */}
      <Modal visible={openModal === 'receipt'} transparent animationType="fade" onRequestClose={() => setOpenModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Receipt Customization</Text>
              <CloseButton onPress={() => setOpenModal(null)} size={18} />
            </View>
            <Text style={styles.fieldLabel}>Business Name (receipt header)</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput style={styles.input} value={nameDraft} onChangeText={setNameDraft} placeholder="PrabandhOS" placeholderTextColor={COLORS.placeholder} />
            </View>
            <Text style={styles.fieldLabel}>Receipt Footer Message</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.input, styles.footerInput]}
                value={footerDraft}
                onChangeText={setFooterDraft}
                multiline
                textAlignVertical="top"
                placeholder="Thank you for your visit!"
                placeholderTextColor={COLORS.placeholder}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setOpenModal(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveReceipt}>
                {updateSettings.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Icon name="check" size={14} color="#FFFFFF" />
                    <Text style={styles.modalSaveText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Notification Preferences ---------- */}
      <Modal visible={openModal === 'notif'} transparent animationType="fade" onRequestClose={() => setOpenModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Notification Preferences</Text>
              <CloseButton onPress={() => setOpenModal(null)} size={18} />
            </View>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Order Placed</Text>
                <Text style={styles.toggleSub}>New order / items fired to the kitchen</Text>
              </View>
              <Switch
                value={settings.orderPlacedAlertsEnabled}
                onValueChange={() => toggleSetting('orderPlacedAlertsEnabled')}
                trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Order Awaiting Confirmation</Text>
                <Text style={styles.toggleSub}>
                  A guest QR order needs staff sign-off — only fires while QR Ordering's Staff
                  Confirmation is also on
                </Text>
              </View>
              <Switch
                value={settings.orderPendingConfirmationAlertsEnabled}
                onValueChange={() => toggleSetting('orderPendingConfirmationAlertsEnabled')}
                trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Order Ready to Serve</Text>
                <Text style={styles.toggleSub}>A fired batch finishes and is ready to bring out</Text>
              </View>
              <Switch
                value={settings.orderReadyAlertsEnabled}
                onValueChange={() => toggleSetting('orderReadyAlertsEnabled')}
                trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Inventory Alerts</Text>
                <Text style={styles.toggleSub}>An ingredient's stock crosses its reorder level</Text>
              </View>
              <Switch
                value={settings.inventoryAlertsEnabled}
                onValueChange={() => toggleSetting('inventoryAlertsEnabled')}
                trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Shift Reports</Text>
                <Text style={styles.toggleSub}>Summary posted whenever a staff member clocks out</Text>
              </View>
              <Switch
                value={settings.shiftReportsEnabled}
                onValueChange={() => toggleSetting('shiftReportsEnabled')}
                trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Approval Requests</Text>
                <Text style={styles.toggleSub}>A refund, discount or leave needs sign-off, and its outcome</Text>
              </View>
              <Switch
                value={settings.approvalAlertsEnabled}
                onValueChange={() => toggleSetting('approvalAlertsEnabled')}
                trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Every category that has no named toggle above, straight from the server's own
                enum walk — so a category added on the backend becomes controllable here with
                no change to this screen. Empty only if every category has been promoted to a
                named toggle, in which case there's nothing to say. */}
            {categoryPrefs.length > 0 && (
              <>
                <Text style={styles.toggleGroupHeading}>Other Alerts</Text>
                {categoryPrefs.map((p) => (
                  <View key={p.category} style={styles.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.toggleLabel}>{notificationCategoryLabel(p.category)}</Text>
                    </View>
                    <Switch
                      value={p.enabled}
                      disabled={updateCategoryPref.isPending}
                      onValueChange={() => updateCategoryPref.mutate({ category: p.category, enabled: !p.enabled })}
                      trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                ))}
              </>
            )}

            <Text style={styles.toggleFootnote}>
              These switches control the whole cafe. Each staff member can also mute categories
              just for themselves from the bell screen.
            </Text>

            <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setOpenModal(null)}>
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Inside the Modal, not at the screen root — on native a Modal is its own
              window, so an overlay outside it would be painted underneath. */}
          <LoadingOverlay visible={updateSettings.isPending || updateCategoryPref.isPending} message="Saving…" />
        </View>
      </Modal>

      {/* ---------- Language & Region ---------- */}
      <Modal visible={openModal === 'lang'} transparent animationType="fade" onRequestClose={() => setOpenModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Language & Region</Text>
              <CloseButton onPress={() => setOpenModal(null)} size={18} />
            </View>
            <Text style={styles.fieldLabel}>Currency & Timezone</Text>
            {REGION_OPTIONS.map((opt) => {
              const active = settings.currency === opt.currency;
              return (
                <TouchableOpacity
                  key={opt.currency}
                  style={[styles.regionRow, active && styles.regionRowActive]}
                  onPress={() => selectRegion(opt)}
                >
                  <Text style={[styles.regionText, active && styles.regionTextActive]}>{opt.currency}</Text>
                  <Text style={[styles.regionSub, active && styles.regionTextActive]}>{opt.region}</Text>
                  {active && <Icon name="check-circle" size={14} color="#FFFFFF" />}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setOpenModal(null)}>
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ---------- Active Branch ---------- */}
      <Modal visible={openModal === 'activeBranch'} transparent animationType="fade" onRequestClose={() => setOpenModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Active Branch</Text>
              <CloseButton onPress={() => setOpenModal(null)} size={18} />
            </View>
            <Text style={styles.helperText}>
              POS, Inventory, Dashboard, and Reports will only show this branch's data. Pick "All Branches" to see every location combined.
            </Text>

            {branchesError && branches.length === 0 ? (
              <ErrorState
                title="Couldn't load branches"
                message="Check your connection and try again."
                onRetry={() => refetchBranches()}
              />
            ) : branchesLoading ? (
              <SkeletonList rows={3} />
            ) : branches.length === 0 ? (
              <View style={styles.branchEmptyState}>
                <Icon name="storefront-outline" size={28} color={COLORS.muted} />
                <Text style={styles.branchEmptyText}>
                  You haven't added any branches yet. Add one from Business &gt; Branches, then come back here to switch between them.
                </Text>
                <TouchableOpacity
                  style={styles.modalDoneBtn}
                  onPress={() => {
                    setOpenModal(null);
                    navigation?.navigate?.('Branches');
                  }}
                >
                  <Text style={styles.modalDoneText}>Go to Branches</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.regionRow, activeBranchId === null && styles.regionRowActive]}
                  onPress={() => selectActiveBranch(null, 'All Branches')}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.regionText, activeBranchId === null && styles.regionTextActive]}>All Branches</Text>
                    <Text style={[styles.regionSub, activeBranchId === null && styles.regionTextActive]}>Combined data from every location</Text>
                  </View>
                  {activeBranchId === null && <Icon name="check-circle" size={14} color="#FFFFFF" />}
                </TouchableOpacity>

                {branches.map((b) => {
                  const active = activeBranchId === b.id;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.regionRow, active && styles.regionRowActive]}
                      onPress={() => selectActiveBranch(b.id, b.name)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.regionText, active && styles.regionTextActive]}>
                          {b.name}
                          {!b.isActive ? '  ·  Inactive' : ''}
                        </Text>
                        {!!b.address && (
                          <Text style={[styles.regionSub, active && styles.regionTextActive]}>{b.address}</Text>
                        )}
                      </View>
                      {active && <Icon name="check-circle" size={14} color="#FFFFFF" />}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setOpenModal(null)}>
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 12 : 12, paddingTop: isDesktopWeb ? 9 : 9, paddingBottom: isDesktopWeb ? 9 : 9, gap: isDesktopWeb ? 7 : 7.5 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    marginHorizontal: isDesktopWeb ? 16 : 12,
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    height: 50,
    marginBottom: isDesktopWeb ? 14 : 15,
  },
  searchInputWrap: { flex: 1 },
  searchInput: { width: '100%', fontSize: 16, color: COLORS.heading },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 16 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 14 : 15,
    gap: isDesktopWeb ? 10 : 10.5,
    overflow: 'hidden',
  },
  profileAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: COLORS.accent },
  profileImage: { width: 56, height: 56, borderRadius: 14 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: isDesktopWeb ? 20 : 12, fontWeight: 'bold', color: COLORS.heading, lineHeight: 26 },
  profileRole: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 3 : 3,
    backgroundColor: COLORS.proTipBg,
    borderRadius: 10,
    paddingHorizontal: isDesktopWeb ? 8 : 7.5,
    paddingVertical: isDesktopWeb ? 5 : 4.5,
  },
  activeText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 16 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 8 : 9,
    gap: isDesktopWeb ? 10 : 10.5,
  },
  settingIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: COLORS.proTipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingInfo: { flex: 1 },
  settingTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '700', color: COLORS.heading },
  settingDesc: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  versionText: { fontSize: 12, fontStyle: 'italic', color: COLORS.muted, textAlign: 'center', marginTop: isDesktopWeb ? 9 : 9 },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43,24,16,0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 16 : 16.5 },
  modalSheet: { width: '100%', backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 12 : 12, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 6, flexShrink: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.heading, marginBottom: isDesktopWeb ? 3 : 3 },
  input: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 34,
    fontSize: 12,
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  footerInput: {
    height: 54,
    paddingTop: isDesktopWeb ? 6 : 6,
  },
  helperText: { fontSize: 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 3 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: isDesktopWeb ? 6 : 6, gap: isDesktopWeb ? 6 : 6 },
  toggleLabel: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  toggleSub: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  toggleGroupHeading: { fontSize: 11, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.6, marginTop: 14, marginBottom: 2, textTransform: 'uppercase' },
  toggleFootnote: { fontSize: 11, color: COLORS.muted, marginTop: 12, lineHeight: 16 },
  modalDoneBtn: {
    marginTop: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 8 : 7.5,
    alignItems: 'center',
  },
  modalDoneText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  modalActions: { flexDirection: 'row', gap: isDesktopWeb ? 6 : 6, marginTop: isDesktopWeb ? 6 : 6 },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 8 : 7.5,
  },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: 7.5,
  },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7.5,
    marginBottom: 6,
  },
  regionRowActive: { backgroundColor: COLORS.button },
  regionText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  regionSub: { fontSize: 12, color: COLORS.muted },
  regionTextActive: { color: '#FFFFFF' },
  branchEmptyState: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  branchEmptyText: { fontSize: 12, color: COLORS.muted, textAlign: 'center', lineHeight: 17 },
});
