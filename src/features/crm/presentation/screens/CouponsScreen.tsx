import React, { useState } from 'react';
import { CloseButton } from '../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { Text, useTheme, Card, Button, Chip } from 'react-native-paper';
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
  const theme = useTheme();
  const COLORS = useThemeColors();
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
    const color = TYPE_COLORS[item.type] ?? '#64748B';
    return (
      <Card style={[styles.couponCard, { borderLeftColor: color, borderLeftWidth: 5 }]} mode="elevated">
        <Card.Content>
          <View style={styles.rowBetween}>
            <Chip style={{ backgroundColor: `${color}20` }} textStyle={{ color, fontSize: 11 }}>
              {TYPE_LABELS[item.type]}
            </Chip>
            {item.isUsed && (
              <Chip style={{ backgroundColor: '#F1F5F9' }} textStyle={{ color: '#94A3B8', fontSize: 11 }}>
                Used
              </Chip>
            )}
          </View>
          <Text style={[styles.couponTitle, { color: theme.colors.onSurface }]}>{item.title}</Text>
          <Text style={styles.couponDesc}>{item.description}</Text>
          <View style={styles.couponMeta}>
            <View style={[styles.codeTag, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Text style={[styles.codeText, { color: theme.colors.onSurfaceVariant }]}>{item.code}</Text>
            </View>
            <Text style={styles.expiry}>Expires: {new Date(item.expiresAt).toLocaleDateString()}</Text>
          </View>
          {!item.isUsed && (
            <Button mode="contained-tonal" style={styles.applyBtn} compact onPress={() => handleRedeem(item)}>
              Void
            </Button>
          )}
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <DesktopPageHeader
        icon="ticket-percent-outline"
        title="Coupons"
        onBack={() => navigation.goBack()}
        right={<Button icon="plus" mode="outlined" onPress={() => setIssueVisible(true)}>Issue</Button>}
      />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="ticket-percent-outline" size={22} color={COLORS.accent} />
          <Text style={[styles.title, { color: COLORS.heading }]} numberOfLines={1}>
            Coupons{customer?.summary.name ? <Text style={[styles.titleCount, { color: COLORS.muted }]}> · {customer.summary.name}</Text> : ''}
          </Text>
          <View style={{ flex: 1 }} />
          <Button icon="plus" mode="outlined" onPress={() => setIssueVisible(true)}>
            Issue
          </Button>
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
          ListEmptyComponent={<Text style={{ textAlign: 'center', opacity: 0.5, marginTop: 40 }}>No coupons issued to this customer yet</Text>}
        />
      )}

      <Modal visible={issueVisible} transparent animationType="fade" onRequestClose={() => setIssueVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: COLORS.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: COLORS.heading }, modalHeadingOverride(styles.modalTitle.fontSize)]}>Issue Coupon</Text>
              <CloseButton onPress={() => setIssueVisible(false)} size={18} />
            </View>

            <View style={{ borderRadius: 10 }}>
              <TextInput
                style={[styles.modalInput, { backgroundColor: COLORS.cardAlt, color: COLORS.heading, borderColor: COLORS.inputBorder }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Title"
                placeholderTextColor={COLORS.placeholder}
              />
            </View>

            <View style={{ borderRadius: 10 }}>
              <TextInput
                style={[styles.modalInput, { backgroundColor: COLORS.cardAlt, color: COLORS.heading, borderColor: COLORS.inputBorder, marginTop: 8 }]}
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
                    style={[styles.typePill, { backgroundColor: isActive ? COLORS.button : COLORS.cardAlt }]}
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
                  style={[styles.modalInput, { flex: 1, backgroundColor: COLORS.cardAlt, color: COLORS.heading, borderColor: COLORS.inputBorder }]}
                  value={value}
                  onChangeText={setValue}
                  keyboardType="numeric"
                  placeholder={type === 'Percent' ? 'Discount %' : 'Discount ₹'}
                  placeholderTextColor={COLORS.placeholder}
                />
              </View>
              <View style={{ borderRadius: 10, flex: 1 }}>
                <TextInput
                  style={[styles.modalInput, { flex: 1, backgroundColor: COLORS.cardAlt, color: COLORS.heading, borderColor: COLORS.inputBorder }]}
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
                style={[styles.modalInput, { backgroundColor: COLORS.cardAlt, color: COLORS.heading, borderColor: COLORS.inputBorder, marginTop: 8 }]}
                value={validDays}
                onChangeText={setValidDays}
                keyboardType="numeric"
                placeholder="Valid for (days)"
                placeholderTextColor={COLORS.placeholder}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalCancelBtn, { backgroundColor: COLORS.card }]} onPress={() => setIssueVisible(false)}>
                <Text style={[styles.modalCancelText, { color: COLORS.heading }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: COLORS.button }]} onPress={handleIssueCoupon} disabled={issueCoupon.isPending}>
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

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 9 : 9, gap: isDesktopWeb ? 7.5 : 7.5 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold' },
  titleCount: { fontSize: 14, fontWeight: '400' },
  list: { padding: isDesktopWeb ? 12 : 12, paddingTop: 0 },
  couponCard: { marginBottom: isDesktopWeb ? 10.5 : 10.5, borderRadius: 8, overflow: 'hidden' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: isDesktopWeb ? 6 : 6 },
  couponTitle: { fontSize: isDesktopWeb ? 17 : 14, fontWeight: '700', marginBottom: isDesktopWeb ? 3 : 3 },
  couponDesc: { opacity: 0.65, fontSize: isDesktopWeb ? 13 : 12, marginBottom: isDesktopWeb ? 9 : 9 },
  couponMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 9 : 9 },
  codeTag: { borderRadius: 8, paddingHorizontal: isDesktopWeb ? 9 : 9, paddingVertical: isDesktopWeb ? 3 : 3 },
  codeText: { fontWeight: '800', letterSpacing: 2, fontSize: isDesktopWeb ? 13 : 12 },
  expiry: { fontSize: 11, opacity: 0.55 },
  applyBtn: { borderRadius: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 15 : 15 },
  modalSheet: { width: '100%', borderRadius: 12, padding: isDesktopWeb ? 12 : 12, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: isDesktopWeb ? 6 : 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800' },
  modalInput: { borderWidth: INPUT_BORDER_WIDTH, borderRadius: isDesktopWeb ? 8 : 8, paddingHorizontal: 10, height: 34, fontSize: 12 },
  modalActions: { flexDirection: 'row', gap: isDesktopWeb ? 6 : 6, marginTop: isDesktopWeb ? 9 : 9 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6, paddingVertical: isDesktopWeb ? 7.5 : 7.5 },
  modalCancelText: { fontSize: 12, fontWeight: '700' },
  modalSaveBtn: { flex: 1.3, alignItems: 'center', justifyContent: 'center', borderRadius: 6, paddingVertical: 7.5 },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  fieldRow: { flexDirection: 'row', gap: 4.5 },
  typeRow: { flexDirection: 'row', gap: 4.5 },
  typePill: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 5.25 },
  typePillText: { fontSize: 12, fontWeight: '700' },
});
