import React, { useState } from 'react';
import { CloseButton } from '../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, ActivityIndicator, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useCustomer, useRedeemCoupon, useIssueCoupon } from '../../../../core/api/hooks/useCustomers';
import { Coupon } from '../../../../core/api/customersApi';
import { getApiErrorMessage } from '../../../../core/network/api';
import { confirmAlert } from '../../../../shared/components/ConfirmDialogHost';
import { showToast } from '../../../../core/store/uiSlice';
import { SkeletonList } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';

import { INPUT_BORDER_WIDTH, modalHeadingOverride } from '../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';

const TYPE_COLORS: Record<string, string> = {
  BIRTHDAY: '#7C3AED',
  FLAT: '#0891B2',
  PERCENT: '#059669',
  REFERRAL: '#D97706',
  BOGO: '#DC2626',
};

const TYPE_LABELS: Record<string, string> = {
  BIRTHDAY: '🎂 Birthday',
  FLAT: '🏷️ Flat Off',
  PERCENT: '% Discount',
  REFERRAL: '👥 Referral',
  BOGO: 'Buy 1 Get 1',
};

export const CouponsScreen = ({ route, navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const customerId: number | undefined = route?.params?.customerId;
  const { data: customer, isLoading, isError, refetch } = useCustomer(customerId ?? null);
  const redeemCoupon = useRedeemCoupon();
  const issueCoupon = useIssueCoupon();
  const coupons = customer?.coupons ?? [];
  const active = coupons.filter((c) => !c.isUsed);
  const used = coupons.filter((c) => c.isUsed);

  const [issueVisible, setIssueVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Bogo/Birthday/Referral aren't priced anywhere yet — OrdersController.BuildOrderAsync
  // only computes a real discount for Percent/Flat (see its coupon switch), so only
  // those two are offered here to avoid issuing a coupon that silently does nothing
  // at checkout.
  const [type, setType] = useState<'Percent' | 'Flat'>('Percent');
  const [value, setValue] = useState('10');
  const [minOrderValue, setMinOrderValue] = useState('0');
  const [validDays, setValidDays] = useState('30');

  const resetIssueForm = () => {
    setTitle('');
    setDescription('');
    setType('Percent');
    setValue('10');
    setMinOrderValue('0');
    setValidDays('30');
  };

  const handleIssueCoupon = async () => {
    const numValue = parseFloat(value);
    const numMinOrder = parseFloat(minOrderValue) || 0;
    const numDays = parseInt(validDays, 10);
    if (!title.trim()) {
      dispatch(showToast({ message: 'Enter a coupon title.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (isNaN(numValue) || numValue <= 0) {
      dispatch(showToast({ message: 'Enter a valid discount value.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (type === 'Percent' && (numValue < 1 || numValue > 100)) {
      dispatch(showToast({ message: 'Percent discount must be between 1 and 100.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (isNaN(numDays) || numDays <= 0) {
      dispatch(showToast({ message: 'Enter how many days this coupon should stay valid.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await issueCoupon.mutateAsync({
        customerId: customerId!,
        req: {
          title: title.trim(),
          description: description.trim(),
          type,
          value: numValue,
          minOrderValue: numMinOrder,
          expiresAt: new Date(Date.now() + numDays * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      setIssueVisible(false);
      resetIssueForm();
      dispatch(showToast({ message: 'Coupon issued.', icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not issue coupon'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  // Marks the coupon used without touching any order — this screen has no bill in
  // context. To actually apply a discount to a customer's order, enter the code on
  // the POS checkout screen's Settle Bill panel (which redeems it there). This action
  // is only for voiding a coupon manually (e.g. it was redeemed in person, or expired
  // and should be cleared from the active list).
  const handleRedeem = (coupon: Coupon) => {
    confirmAlert('Void coupon', `Mark ${coupon.code} as used? This does not apply any discount — to redeem it against an order, enter the code on the checkout screen instead.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void',
        onPress: async () => {
          try {
            await redeemCoupon.mutateAsync(coupon.id);
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not void coupon'), icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  const renderCoupon = ({ item }: { item: Coupon }) => {
    const color = TYPE_COLORS[item.type] ?? COLORS.muted;
    return (
      <View style={[styles.couponCard, { borderLeftColor: color }, item.isUsed && styles.couponCardUsed]}>
        <View style={styles.rowBetween}>
          <View style={[styles.typeChip, { backgroundColor: `${color}1A` }]}>
            <Text style={[styles.typeChipText, { color }]}>{TYPE_LABELS[item.type]}</Text>
          </View>
          {item.isUsed && (
            <View style={[styles.typeChip, { backgroundColor: COLORS.chipBg }]}>
              <Text style={[styles.typeChipText, { color: COLORS.muted }]}>Used</Text>
            </View>
          )}
        </View>
        <Text style={styles.couponTitle}>{item.title}</Text>
        {!!item.description && <Text style={styles.couponDesc}>{item.description}</Text>}
        <View style={styles.couponMeta}>
          <View style={styles.codeTag}>
            <Text style={styles.codeText}>{item.code}</Text>
          </View>
          <Text style={styles.expiry}>Expires: {new Date(item.expiresAt).toLocaleDateString()}</Text>
        </View>
        {!item.isUsed && (
          <TouchableOpacity style={styles.voidBtn} activeOpacity={0.8} onPress={() => handleRedeem(item)}>
            <Text style={styles.voidBtnText}>Void</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const issueBtn = (
    <TouchableOpacity style={styles.issueBtn} activeOpacity={0.8} onPress={() => setIssueVisible(true)}>
      <Icon name="plus" size={16} color="#FFFFFF" />
      <Text style={styles.issueBtnText}>Issue</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <DesktopPageHeader
        icon="ticket-percent-outline"
        title="Coupons"
        onBack={() => navigation.goBack()}
        right={issueBtn}
      />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="ticket-percent-outline" size={22} color={COLORS.accent} />
          <Text style={styles.title} numberOfLines={1}>
            Coupons{customer?.summary.name ? <Text style={styles.titleCount}> · {customer.summary.name}</Text> : ''}
          </Text>
          <View style={{ flex: 1 }} />
          {issueBtn}
        </View>
      )}

      {isError && !customer ? (
        <ErrorState
          title="Couldn't load coupons"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <View style={{ padding: 16 }}>
          <SkeletonList rows={6} />
        </View>
      ) : (
        <FlatList
          data={[...active, ...used]}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderCoupon}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No coupons issued to this customer yet</Text>}
        />
      )}

      <Modal visible={issueVisible} transparent animationType="fade" onRequestClose={() => setIssueVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Issue Coupon</Text>
              <CloseButton onPress={() => setIssueVisible(false)} size={18} />
            </View>

            <View style={{ borderRadius: 10 }}>
              <TextInput
                style={styles.modalInput}
                value={title}
                onChangeText={setTitle}
                placeholder="Title"
                placeholderTextColor={COLORS.placeholder}
              />
            </View>

            <View style={{ borderRadius: 10 }}>
              <TextInput
                style={[styles.modalInput, { marginTop: 8 }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Description"
                placeholderTextColor={COLORS.placeholder}
              />
            </View>

            <View style={[styles.typeRow, { marginTop: 8 }]}>
              {(['Percent', 'Flat'] as const).map((t) => {
                const isActive = type === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.typePill,
                      { backgroundColor: isActive ? COLORS.button : COLORS.cardAlt, borderColor: isActive ? COLORS.button : COLORS.inputBorder },
                    ]}
                    onPress={() => setType(t)}
                  >
                    <Text style={[styles.typePillText, { color: isActive ? '#FFFFFF' : COLORS.heading }]}>
                      {t === 'Percent' ? '% Off' : '₹ Off'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.fieldRow, { marginTop: 8 }]}>
              <View style={{ borderRadius: 10, flex: 1 }}>
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  value={value}
                  onChangeText={setValue}
                  keyboardType="numeric"
                  placeholder={type === 'Percent' ? 'Discount %' : 'Discount ₹'}
                  placeholderTextColor={COLORS.placeholder}
                />
              </View>
              <View style={{ borderRadius: 10, flex: 1 }}>
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  value={minOrderValue}
                  onChangeText={setMinOrderValue}
                  keyboardType="numeric"
                  placeholder="Min order ₹"
                  placeholderTextColor={COLORS.placeholder}
                />
              </View>
            </View>

            <View style={{ borderRadius: 10 }}>
              <TextInput
                style={[styles.modalInput, { marginTop: 8 }]}
                value={validDays}
                onChangeText={setValidDays}
                keyboardType="numeric"
                placeholder="Valid for (days)"
                placeholderTextColor={COLORS.placeholder}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIssueVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleIssueCoupon} disabled={issueCoupon.isPending}>
                {issueCoupon.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Issue</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 9, gap: 7.5 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  titleCount: { fontSize: 14, fontWeight: '400', color: COLORS.muted },
  issueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 5 : 3.75,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingHorizontal: isDesktopWeb ? 11 : 10.5,
    paddingVertical: isDesktopWeb ? 8 : 6,
  },
  issueBtnText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: '#FFFFFF' },
  list: { padding: 12, paddingTop: 0 },
  emptyText: { textAlign: 'center', color: COLORS.muted, fontSize: 12, marginTop: 40 },
  couponCard: {
    marginBottom: 10.5,
    borderRadius: 8,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderLeftWidth: 5,
    padding: 12,
  },
  couponCardUsed: { opacity: 0.65 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  typeChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  typeChipText: { fontSize: 11, fontWeight: '700' },
  couponTitle: { fontSize: isDesktopWeb ? 17 : 14, fontWeight: '700', color: COLORS.heading, marginBottom: 3 },
  couponDesc: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, marginBottom: 9 },
  couponMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  codeTag: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: COLORS.chipBg },
  codeText: { fontWeight: '800', letterSpacing: 2, fontSize: isDesktopWeb ? 13 : 12, color: COLORS.heading },
  expiry: { fontSize: 11, color: COLORS.muted },
  voidBtn: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  voidBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isDesktopWeb ? 18 : 15,
  },
  // maxWidth keeps the sheet a centered dialog on a tablet/desktop browser instead of
  // stretching edge-to-edge — same 420 cap the other CRM modals use.
  modalSheet: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800', color: COLORS.heading },
  modalInput: {
    borderWidth: INPUT_BORDER_WIDTH,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 34,
    fontSize: 12,
    backgroundColor: COLORS.cardAlt,
    color: COLORS.heading,
    borderColor: COLORS.inputBorder,
  },
  modalActions: { flexDirection: 'row', gap: 6, marginTop: 9 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6, paddingVertical: 7.5, backgroundColor: COLORS.card },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: { flex: 1.3, alignItems: 'center', justifyContent: 'center', borderRadius: 6, paddingVertical: 7.5, backgroundColor: COLORS.button },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  fieldRow: { flexDirection: 'row', gap: 4.5 },
  typeRow: { flexDirection: 'row', gap: 4.5 },
  typePill: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, paddingVertical: 5.25 },
  typePillText: { fontSize: 12, fontWeight: '700' },
});
