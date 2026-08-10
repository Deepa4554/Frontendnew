import React, { useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { confirmAlert } from '../../../../../shared/components/ConfirmDialogHost';
import { showToast } from '../../../../../core/store/uiSlice';
import { setActiveBranch } from '../../../../../core/store/branchSlice';
import { RootState } from '../../../../../core/store/rootReducer';
import { useBranches, useCreateBranch, useDeactivateBranch } from '../../../../../core/api/hooks/useBranches';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

export const BranchManagementScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const STATUS_VARIANTS = [
    { label: 'Active', dotColor: COLORS.success, iconBg: COLORS.accent, btnBg: COLORS.accent, btnText: '#FFFFFF' },
    { label: 'Inactive', dotColor: COLORS.dangerAccent, iconBg: COLORS.inputBorder, btnBg: COLORS.inputBorder, btnText: COLORS.heading },
  ];
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const { data: branches = [], isLoading, isError, refetch } = useBranches();
  const createBranch = useCreateBranch();
  const deactivateBranch = useDeactivateBranch();

  // Real, persisted, app-wide selection — POS/Orders/Inventory all read this
  // same value to filter what they show. null = "All Branches" (no filter).
  const activeBranchId = useSelector((s: RootState) => s.branch.activeBranchId);

  const [isAddDialogVisible, setAddDialogVisible] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');

  const handleAddBranch = async () => {
    if (!newBranchName.trim()) return;
    try {
      await createBranch.mutateAsync({ name: newBranchName.trim(), address: newBranchAddress.trim() });
      setAddDialogVisible(false);
      setNewBranchName('');
      setNewBranchAddress('');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add branch'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleDeactivate = (id: number, name: string) => {
    confirmAlert('Deactivate Branch', `Deactivate "${name}"? It will stop appearing as an active location.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: () => deactivateBranch.mutate(id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="storefront-outline" title="Branches" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          {!isDesktopWeb && (
            <>
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
                <Icon name="arrow-left" size={20} color={COLORS.heading} />
              </TouchableOpacity>
              <Icon name="storefront" size={22} color={COLORS.accent} />
            </>
          )}
          <Text style={styles.brandTitle}>Branches</Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.networkCard}>
          <View style={styles.networkRow}>
            <View>
              <Text style={styles.cardLabel}>NETWORK STATUS</Text>
              <Text style={styles.networkValue}>
                {branches.filter((b) => b.isActive).length} of {branches.length} Branches Active
              </Text>
            </View>
            <Icon name="check-circle" size={22} color={COLORS.success} />
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>LOCATIONS</Text>
        </View>

        <TouchableOpacity
          style={[styles.switchBtn, styles.allBranchesBtn, activeBranchId === null && { backgroundColor: COLORS.accent }]}
          onPress={() => dispatch(setActiveBranch(null))}
        >
          <Icon name="view-grid-outline" size={16} color={activeBranchId === null ? '#FFFFFF' : COLORS.heading} />
          <Text style={[styles.switchBtnText, { color: activeBranchId === null ? '#FFFFFF' : COLORS.heading }]}>
            {activeBranchId === null ? 'Viewing All Branches' : 'View All Branches'}
          </Text>
        </TouchableOpacity>

        {isError && branches.length === 0 ? (
          <ErrorState
            title="Couldn't load branches"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : (
        <>
        {isLoading && <SkeletonList rows={4} style={{ paddingHorizontal: 16, marginTop: 4 }} />}

        {!isLoading && branches.length === 0 && (
          <Text style={{ paddingHorizontal: 16, color: COLORS.muted, fontSize: 13 }}>
            No branches yet — add your first location.
          </Text>
        )}

        {branches.map((branch) => {
          const variant = STATUS_VARIANTS[branch.isActive ? 0 : 1];
          const isSelected = branch.id === activeBranchId;
          return (
            <View key={branch.id} style={styles.branchCard}>
              <View style={styles.branchTopRow}>
                <View style={[styles.branchIconBox, { backgroundColor: variant.iconBg }]}>
                  <Icon name="coffee-outline" size={22} color={variant.iconBg === COLORS.heading ? '#FFFFFF' : COLORS.heading} />
                </View>
                {branch.isActive && (
                  <TouchableOpacity onPress={() => handleDeactivate(branch.id, branch.name)}>
                    <Icon name="dots-vertical" size={18} color={COLORS.muted} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.branchName}>{branch.name}</Text>
              {!!branch.address && <Text style={styles.branchAddress}>{branch.address}</Text>}
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: variant.dotColor }]} />
                <Text style={styles.statusLabel}>{variant.label}</Text>
              </View>

              <TouchableOpacity
                style={[styles.switchBtn, { backgroundColor: variant.btnBg }]}
                onPress={() => dispatch(setActiveBranch(branch.id))}
              >
                <Icon name="swap-horizontal" size={16} color={variant.btnText} />
                <Text style={[styles.switchBtnText, { color: variant.btnText }]}>
                  {isSelected ? 'Viewing this Branch' : 'View this Branch'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
        </>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setAddDialogVisible(true)}>
        <Icon name="plus" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Plain absolutely-positioned View instead of RN's <Modal> — react-native-web's Modal
          wraps content in a ModalFocusTrap that listens for every document "focus" event and,
          on a timing race, yanks focus back onto its own wrapper right as a TextInput inside
          it tries to take focus, so a tap on Branch Name/Address here never actually let you
          type (see NonBlockingOverlay.web.tsx for the same class of RN-Web Modal quirk hit
          elsewhere in this app). This screen is always a full-screen stack push (never behind
          the tab bar), so a plain absolute-fill overlay covers everything Modal would have. */}
      {isAddDialogVisible && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Add New Branch</Text>
              <CloseButton onPress={() => setAddDialogVisible(false)} size={18} />
            </View>

            <Text style={styles.fieldLabel}>Branch Name</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.formInput, webNoOutline]}
                placeholder="e.g. Koramangala"
                placeholderTextColor={COLORS.placeholder}
                value={newBranchName}
                onChangeText={setNewBranchName}
              />
            </View>

            <Text style={styles.fieldLabel}>Address</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.formInput, webNoOutline]}
                placeholder="e.g. 12th Main Road, Bengaluru"
                placeholderTextColor={COLORS.placeholder}
                value={newBranchAddress}
                onChangeText={setNewBranchAddress}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAddDialogVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAddBranch} disabled={createBranch.isPending || !newBranchName.trim()}>
                {createBranch.isPending ? (
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
      )}
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 7 : 7.5,
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingTop: isDesktopWeb ? 8 : 9,
    paddingBottom: isDesktopWeb ? 8 : 9,
  },
  brandTitle: {
    fontSize: isDesktopWeb ? 20 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 13 : 13.5,
    marginBottom: isDesktopWeb ? 14 : 15,
    gap: isDesktopWeb ? 10 : 10.5,
  },
  networkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
    marginBottom: isDesktopWeb ? 4 : 4.5,
  },
  networkValue: {
    fontSize: isDesktopWeb ? 18 : 12,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 8 : 9,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
  },
  branchCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 12 : 12,
  },
  branchTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: isDesktopWeb ? 7 : 7.5,
  },
  branchIconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchName: {
    fontSize: isDesktopWeb ? 17 : 12,
    fontWeight: 'bold',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 3 : 3,
  },
  branchAddress: {
    fontSize: isDesktopWeb ? 13 : 12,
    color: COLORS.muted,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4.5 : 4.5,
    marginBottom: isDesktopWeb ? 10 : 10.5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 6,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 9 : 9,
  },
  allBranchesBtn: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 12 : 12,
  },
  switchBtnText: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(43, 24, 16, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isDesktopWeb ? 17 : 18,
    // No RN <Modal> means no automatic portal-to-top — pin above the FAB/scroll
    // content explicitly instead (same reasoning as ConfirmDialogHost's overlay).
    zIndex: 999999,
    elevation: 999999,
  },
  modalSheet: { width: '100%', maxWidth: 440, backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 12 : 12, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 6, flexShrink: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 3, marginTop: isDesktopWeb ? 4.5 : 4.5 },
  formInput: {
    backgroundColor: COLORS.cardAlt, borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder,
    paddingHorizontal: 10, height: 34, fontSize: 12, color: COLORS.heading,
  },
  modalActions: { flexDirection: 'row', gap: 6, marginTop: 9 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7.5, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 7.5, borderRadius: 6, backgroundColor: COLORS.button,
  },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
