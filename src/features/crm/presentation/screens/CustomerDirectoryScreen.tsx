import React, { useCallback, useMemo, useState } from 'react';
import { CloseButton } from '../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Image, TextInput, Modal, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { InitialsAvatar } from '../../../../shared/components/InitialsAvatar';
import { useCustomers, useCreateCustomer } from '../../../../core/api/hooks/useCustomers';
import { MembershipTier, customersApi } from '../../../../core/api/customersApi';
import { ReportExportService } from '../../../../core/utils/reportExport';
import { useSettings } from '../../../../core/api/hooks/useSettings';
import { getApiErrorMessage } from '../../../../core/network/api';
import { showToast } from '../../../../core/store/uiSlice';
import { SkeletonList, SkeletonBox } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';
import { GlobalSearchTrigger } from '../../../../shared/components/search/GlobalSearchTrigger';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';

/** Native browser tooltip showing the full text on hover, for anywhere it may get
 * `numberOfLines`-truncated — web only, since `title` isn't a recognized Text prop
 * on native and would just log a warning there. */
const hoverTitle = (text: string) => (Platform.OS === 'web' ? ({ title: text } as any) : undefined);
import { SearchClearButton } from '../../../../shared/components/atoms/SearchClearButton';

import { modalHeadingOverride } from '../../../../shared/design/commonStyles';

type DirectoryMember = NonNullable<ReturnType<typeof useCustomers>['data']>['items'][number];

// One directory row. React.memo'd + given stable props so the whole list skips re-render while
// the user types in the search box (each keystroke re-queries and re-renders the screen) or in
// the Add Customer modal above the still-mounted list. React Query's structural sharing keeps an
// unchanged customer's identity stable, so a row re-renders only when its own data changes.
const MemberCard = React.memo(({ m, styles, COLORS, isDesktopWeb, onOpenProfile }: {
  m: DirectoryMember;
  styles: ReturnType<typeof makeStyles>;
  COLORS: ReturnType<typeof useThemeColors>;
  isDesktopWeb: boolean;
  onOpenProfile: (id: number) => void;
}) => {
  const TIER_STYLES: Record<MembershipTier, { bg: string; text: string }> = {
    PLATINUM: { bg: '#5B4636', text: '#FFFFFF' },
    GOLD: { bg: COLORS.heading, text: '#FFFFFF' },
    SILVER: { bg: '#9E9186', text: '#FFFFFF' },
    BRONZE: { bg: COLORS.vibeCrema, text: COLORS.heading },
  };
  const tier = TIER_STYLES[m.tier] ?? TIER_STYLES.BRONZE;
  const daysSinceVisit = Math.floor((Date.now() - new Date(m.lastVisitAt).getTime()) / 86400000);
  const lapsing = daysSinceVisit >= 21 ? `Lapsing (Last visit: ${daysSinceVisit}d ago)` : null;
  const memberMetaText = `${m.visitCount} Visits · ${m.visitsLast30Days} this month · ${m.totalPoints.toLocaleString()} pts`;
  return (
    <TouchableOpacity
      style={[styles.memberCard, isDesktopWeb && styles.memberCardDesktop, lapsing && styles.memberCardLapsing]}
      onPress={() => onOpenProfile(m.id)}
      activeOpacity={0.85}
    >
      {m.profilePhotoUrl ? (
        <Image source={{ uri: m.profilePhotoUrl }} style={styles.memberImage} />
      ) : (
        <InitialsAvatar name={m.name} size={40} style={{ borderRadius: 11 }} />
      )}
      <View style={styles.memberInfo}>
        <Text style={styles.memberName} numberOfLines={1} {...hoverTitle(m.name)}>{m.name}</Text>
        {lapsing ? (
          <Text style={styles.lapsingText}>{lapsing}</Text>
        ) : (
          <Text style={styles.memberMeta} numberOfLines={1} {...hoverTitle(memberMetaText)}>
            {memberMetaText}
          </Text>
        )}
      </View>
      <View style={[styles.tierBadge, { backgroundColor: tier.bg }]}>
        <Text style={[styles.tierText, { color: tier.text }]}>{m.tier}</Text>
      </View>
      <TouchableOpacity style={styles.pointsBtn} onPress={() => onOpenProfile(m.id)}>
        <Icon name="plus-circle-outline" size={16} color="#FFFFFF" />
        <Text style={styles.pointsBtnText}>Points</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

export const CustomerDirectoryScreen = ({ navigation }: any) => {
  const dispatch = useDispatch();
  const COLORS = useThemeColors();
  const { isDesktopWeb, isTablet } = useResponsive();
  // Memoized so the StyleSheet isn't rebuilt every keystroke and MemberCard's React.memo holds.
  const styles = useMemo(() => makeStyles(COLORS, isDesktopWeb, isTablet), [COLORS, isDesktopWeb, isTablet]);
  const insets = useSafeAreaInsets();
  const onOpenProfile = useCallback((id: number) => navigation.navigate('CustomerProfile', { customerId: id }), [navigation]);
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, refetch } = useCustomers(search || undefined);
  const members = data?.items ?? [];
  const totalPoints = members.reduce((sum, m) => sum + m.totalPoints, 0);

  const { data: settings } = useSettings();
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

  /**
   * The whole customer book as a contact list — name and mobile, which is what this is
   * actually wanted for (a broadcast list, a reminder run), not the visit/spend analysis the
   * date-ranged CRM report already covers.
   *
   * Deliberately re-fetches through listAll rather than exporting `members`: the screen only
   * ever holds one page, so exporting what's on screen would hand over the most recent 20
   * customers under a filename claiming to be all of them. Honours the search box, so a
   * filtered view exports exactly what it says it is showing.
   */
  const handleExport = async (format: 'pdf' | 'excel') => {
    setExporting(format);
    try {
      const all = await customersApi.listAll(search || undefined);
      const withPhone = all.filter((c) => !!c.phone);
      if (all.length === 0) {
        dispatch(showToast({ message: 'No customers to export yet.', icon: 'information-outline', tone: 'warning' }));
        return;
      }
      const def = {
        title: search ? `Customer Contacts (matching "${search}")` : 'Customer Contacts',
        businessName: settings?.businessName ?? 'CafePOS',
        // Not a date range — this is the book as it stands right now, and saying so keeps the
        // export from being mistaken for the period report.
        dateRangeLabel: `${all.length} customers · ${withPhone.length} with a mobile number`,
        sections: [
          {
            title: 'Customers',
            columns: [
              { key: 'name', label: 'Name' },
              { key: 'phone', label: 'Mobile' },
            ],
            rows: all.map((c) => ({ name: c.name, phone: c.phone ?? '' })),
          },
        ],
      };
      if (format === 'pdf') await ReportExportService.exportToPDF(def);
      else await ReportExportService.exportToExcel(def);
    } catch (e: any) {
      dispatch(showToast({ message: getApiErrorMessage(e) ?? 'Could not build the export.', icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setExporting(null);
    }
  };

  const createCustomer = useCreateCustomer();
  const [addVisible, setAddVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const handleAddCustomer = async () => {
    if (!newName.trim()) {
      dispatch(showToast({ message: 'Enter the customer name.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const trimmedPhone = newPhone.trim();
    if (trimmedPhone && !/^\d{10}$/.test(trimmedPhone)) {
      dispatch(showToast({ message: 'Phone must be a 10-digit number.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await createCustomer.mutateAsync({ name: newName.trim(), phone: trimmedPhone || undefined });
      setAddVisible(false);
      setNewName('');
      setNewPhone('');
      dispatch(showToast({ message: 'Customer added.', icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add customer'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  return (
    <View style={styles.container}>
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="account-heart-outline" size={22} color={COLORS.accent} />
          <Text style={styles.headerTitle}>Customers</Text>
          <View style={{ flex: 1 }} />
          <GlobalSearchTrigger navigation={navigation} style={styles.iconBtn} />
        </View>
      )}
      <DesktopPageHeader icon="account-heart-outline" title="Customers" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={[styles.searchWrapper, isDesktopWeb && { marginHorizontal: 16 }]}>
          <Icon name="magnify" size={18} color={COLORS.muted} style={{ marginRight: 8 }} />
          <View style={styles.searchInputWrap}>
            <TextInput
              style={[styles.searchInput, { paddingRight: 24 }]}
              placeholder="Search customers..."
              placeholderTextColor={COLORS.placeholder}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && <SearchClearButton onPress={() => setSearch('')} />}
          </View>
        </View>

        <View style={[styles.summaryCard, isDesktopWeb && { marginHorizontal: 16 }]}>
          <View style={styles.summaryHalf}>
            <Text style={styles.summaryLabel}>TOTAL LOYALTY MEMBERS</Text>
            {isLoading ? (
              <SkeletonBox width="50%" height={20} style={{ marginTop: 2 }} />
            ) : (
              <Text style={styles.summaryValue}>{members.length.toLocaleString()}</Text>
            )}
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryHalf}>
            <Text style={styles.summaryLabel}>ACTIVE POOL</Text>
            {isLoading ? (
              <SkeletonBox width="50%" height={20} style={{ marginTop: 2 }} />
            ) : (
              <Text style={styles.summaryValue}>{totalPoints.toLocaleString()}</Text>
            )}
          </View>
        </View>

        <View style={[styles.directoryRow, isDesktopWeb && { paddingHorizontal: 16 }]}>
          <Text style={styles.sectionLabel}>DIRECTORY</Text>
          <View style={{ flex: 1 }} />
          {(['excel', 'pdf'] as const).map((format) => (
            <TouchableOpacity
              key={format}
              style={styles.exportBtn}
              disabled={exporting !== null}
              onPress={() => handleExport(format)}
            >
              {exporting === format ? (
                <ActivityIndicator size="small" color={COLORS.heading} />
              ) : (
                <Icon name={format === 'excel' ? 'file-excel-outline' : 'file-pdf-box'} size={15} color={COLORS.heading} />
              )}
              <Text style={styles.exportBtnText}>{format === 'excel' ? 'Excel' : 'PDF'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isError && members.length === 0 ? (
          <ErrorState
            title="Couldn't load customers"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : (
          <>
            {isLoading && <SkeletonList rows={6} style={{ paddingHorizontal: 16, marginTop: 4 }} />}

            {!isLoading && members.length === 0 && (
              <Text style={{ paddingHorizontal: 16, color: COLORS.muted, fontSize: 13 }}>
                No customers yet — they'll appear here automatically once orders are placed under a guest name.
              </Text>
            )}

            <View style={isDesktopWeb && styles.memberGridDesktop}>
            {members.map((m) => (
              <MemberCard
                key={m.id}
                m={m}
                styles={styles}
                COLORS={COLORS}
                isDesktopWeb={isDesktopWeb}
                onOpenProfile={onOpenProfile}
              />
            ))}
            </View>
          </>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setAddVisible(true)}>
        <Icon name="account-plus" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal visible={addVisible} transparent animationType="fade" onRequestClose={() => setAddVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Add Customer</Text>
              <CloseButton onPress={() => setAddVisible(false)} size={18} />
            </View>
            <View style={{ borderRadius: 12 }}>
              <TextInput
                style={styles.modalInput}
                placeholder="Full name"
                placeholderTextColor={COLORS.placeholder}
                value={newName}
                onChangeText={setNewName}
              />
            </View>
            <View style={{ borderRadius: 12 }}>
              <TextInput
                style={[styles.modalInput, { marginTop: 6 }]}
                placeholder="Phone (optional)"
                placeholderTextColor={COLORS.placeholder}
                value={newPhone}
                onChangeText={(text) => setNewPhone(text.replace(/[^0-9]/g, '').slice(0, 10))}
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAddVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAddCustomer} disabled={createCustomer.isPending}>
                {createCustomer.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean, isTablet: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  memberGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: isDesktopWeb ? 16 : 24,
    gap: isDesktopWeb ? 8 : 12,
  },
  memberCardDesktop: {
    // 2-up on a tablet-width browser (content column is much narrower than desktop
    // even with the slimmer sidebar), 3-up on real desktop.
    width: isTablet ? '48%' : '31%',
    marginHorizontal: isDesktopWeb ? 0 : 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    paddingTop: isDesktopWeb ? 12 : 9,
    paddingBottom: isDesktopWeb ? 12 : 9,
    gap: isDesktopWeb ? 10 : 7.5,
  },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    marginHorizontal: isDesktopWeb ? 16 : 12,
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    height: isDesktopWeb ? 38 : 46,
    marginBottom: isDesktopWeb ? 8 : 10.5,
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
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 16 : 12,
    borderRadius: 8,
    paddingVertical: isDesktopWeb ? 7 : 9,
    paddingHorizontal: isDesktopWeb ? 10 : 12,
    marginBottom: isDesktopWeb ? 9 : 12,
  },
  summaryHalf: { flex: 1 },
  summaryDivider: { width: 1, height: 28, backgroundColor: COLORS.divider, marginHorizontal: isDesktopWeb ? 10 : 10.5 },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
    marginBottom: isDesktopWeb ? 3 : 3,
  },
  summaryValue: { fontSize: isDesktopWeb ? 20 : 12, fontWeight: 'bold', color: COLORS.heading },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    marginBottom: isDesktopWeb ? 6 : 9,
  },
  /* The label keeps its own horizontal padding, so this row carries none of its own on
     mobile — adding it again would double the inset. */
  directoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: isDesktopWeb ? 0 : 12,
    gap: 8,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.card,
    marginBottom: isDesktopWeb ? 6 : 9,
  },
  exportBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 16 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 7 : 6,
    marginBottom: isDesktopWeb ? 0 : 6,
    gap: isDesktopWeb ? 6 : 6,
  },
  memberCardLapsing: {
    borderWidth: 1.5,
    borderColor: '#E8A9A0',
  },
  memberImage: { width: 40, height: 40, borderRadius: 11 },
  memberInfo: { flex: 1, minWidth: 0 },
  memberName: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: COLORS.heading, marginBottom: isDesktopWeb ? 2 : 1.5 },
  memberMeta: { fontSize: 11, color: COLORS.muted },
  lapsingText: { fontSize: 11, color: COLORS.dangerAccent, fontWeight: '500' },
  tierBadge: {
    paddingHorizontal: isDesktopWeb ? 7 : 5.25,
    paddingVertical: isDesktopWeb ? 3 : 2.25,
    borderRadius: 7,
  },
  tierText: { fontSize: 9, fontWeight: '700' },
  pointsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4 : 3,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingHorizontal: isDesktopWeb ? 9 : 6.75,
    paddingVertical: isDesktopWeb ? 7 : 5.25,
  },
  pointsBtnText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: '#FFFFFF' },
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
    backgroundColor: 'rgba(43, 24, 16, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isDesktopWeb ? 18 : 18,
  },
  modalSheet: {
    width: '100%',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: isDesktopWeb ? 12 : 12,
    overflow: 'hidden',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: isDesktopWeb ? 6 : 6,
  },
  modalTitle: {
    fontSize: isDesktopWeb ? 16 : 14,
    fontWeight: '800',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 6 : 6,
    flexShrink: 1,
  },
  modalInput: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: isDesktopWeb ? 9 : 8,
    paddingHorizontal: isDesktopWeb ? 7.5 : 10,
    height: 34,
    fontSize: isDesktopWeb ? 16 : 12,
    color: COLORS.heading,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 9,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 6,
    paddingVertical: 7.5,
  },
  modalCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  modalSaveBtn: {
    flex: 1.3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: 7.5,
  },
  modalSaveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
