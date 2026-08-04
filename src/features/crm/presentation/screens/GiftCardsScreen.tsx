import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { Text, useTheme, Card, Button, ProgressBar, Divider } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useCustomer, useIssueGiftCard, useRedeemGiftCard } from '../../../../core/api/hooks/useCustomers';
import { GiftCard } from '../../../../core/api/customersApi';
import { getApiErrorMessage } from '../../../../core/network/api';
import { confirmAlert } from '../../../../shared/components/ConfirmDialogHost';
import { showToast } from '../../../../core/store/uiSlice';
import { SkeletonList } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';

import { INPUT_BORDER_WIDTH, modalHeadingOverride } from '../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';

export const GiftCardsScreen = ({ route, navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const theme = useTheme();
  const COLORS = useThemeColors();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const customerId: number | undefined = route?.params?.customerId;
  const { data: customer, isLoading, isError, refetch } = useCustomer(customerId ?? null);
  const issueGiftCard = useIssueGiftCard();
  const redeemGiftCard = useRedeemGiftCard();
  const giftCards = customer?.giftCards ?? [];

  const [issueVisible, setIssueVisible] = useState(false);
  const [amount, setAmount] = useState('50');

  const getStatusColor = (status: string) => (status === 'ACTIVE' ? '#16A34A' : status === 'USED' ? '#94A3B8' : '#DC2626');

  const handleIssue = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      dispatch(showToast({ message: 'Enter a valid gift card amount.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await issueGiftCard.mutateAsync({ amount: amt, customerId, purchasedBy: customer?.summary.name });
      setIssueVisible(false);
      setAmount('50');
      dispatch(showToast({ message: 'Gift card issued.', icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not issue gift card'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  // Debits the balance without touching any order — this screen has no bill in
  // context. To actually apply a gift card to a customer's order, enter the code on
  // the POS checkout screen's Settle Bill panel (which redeems it there). This action
  // is only for manually voiding/writing off a balance (e.g. it was redeemed in
  // person, expired, or is being cancelled).
  const handleRedeem = (gc: GiftCard) => {
    confirmAlert('Void gift card balance', `Write off the ₹${gc.balance.toFixed(2)} balance on ${gc.code}? This does not apply any discount — to redeem it against an order, enter the code on the checkout screen instead.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void',
        onPress: async () => {
          try {
            await redeemGiftCard.mutateAsync({ code: gc.code, amount: gc.balance });
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not void gift card'), icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  const renderCard = (gc: GiftCard) => {
    const balancePct = gc.originalBalance > 0 ? gc.balance / gc.originalBalance : 0;
    return (
      <Card key={gc.id} style={[styles.gcCard, { opacity: gc.status !== 'ACTIVE' ? 0.65 : 1 }]} mode="elevated">
        <View style={[styles.gcHeader, { backgroundColor: gc.status === 'ACTIVE' ? '#0F172A' : '#94A3B8' }]}>
          <Text style={styles.gcCode}>{gc.code}</Text>
          <Text style={{ color: getStatusColor(gc.status), fontWeight: '700', fontSize: 12 }}>● {gc.status}</Text>
        </View>
        <Card.Content style={{ paddingTop: 14 }}>
          <View style={styles.balanceRow}>
            <View>
              <Text style={styles.balanceLabel}>Remaining Balance</Text>
              <Text style={[styles.balanceAmt, { color: gc.status === 'ACTIVE' ? theme.colors.primary : '#94A3B8' }]}>
                ₹{gc.balance.toLocaleString()}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.balanceLabel}>Original</Text>
              <Text style={{ fontWeight: '600', color: '#94A3B8' }}>₹{gc.originalBalance}</Text>
            </View>
          </View>

          {gc.status === 'ACTIVE' && <ProgressBar progress={balancePct} color={theme.colors.primary} style={styles.progressBar} />}

          <Divider style={{ marginVertical: 12 }} />

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Purchased On</Text>
            <Text style={styles.metaValue}>{new Date(gc.purchasedAt).toLocaleDateString()}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Expires</Text>
            <Text style={styles.metaValue}>{new Date(gc.expiresAt).toLocaleDateString()}</Text>
          </View>

          {gc.status === 'ACTIVE' && gc.balance > 0 && (
            <Button mode="contained" style={{ marginTop: 14, borderRadius: 8 }} onPress={() => handleRedeem(gc)}>
              Redeem Gift Card
            </Button>
          )}
        </Card.Content>
      </Card>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
      <DesktopPageHeader
        icon="gift-outline"
        title="Gift Cards"
        onBack={() => navigation.goBack()}
        right={<Button icon="plus" mode="outlined" onPress={() => setIssueVisible(true)}>Issue</Button>}
      />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="gift-outline" size={22} color={COLORS.accent} />
          <Text style={[styles.title, { color: COLORS.heading }]} numberOfLines={1}>
            Gift Cards{customer?.summary.name ? <Text style={[styles.titleCount, { color: COLORS.muted }]}> · {customer.summary.name}</Text> : ''}
          </Text>
          <View style={{ flex: 1 }} />
          <Button icon="plus" mode="outlined" onPress={() => setIssueVisible(true)}>
            Issue
          </Button>
        </View>
      )}

      {isError && !customer ? (
        <ErrorState
          title="Couldn't load gift cards"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : (
        <>
          {isLoading ? <SkeletonList rows={4} /> : giftCards.map(renderCard)}

          {!isLoading && giftCards.length === 0 && <Text style={{ textAlign: 'center', opacity: 0.5, marginTop: 60 }}>No gift cards found</Text>}
        </>
      )}

      <Modal visible={issueVisible} transparent animationType="fade" onRequestClose={() => setIssueVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: COLORS.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: COLORS.heading }, modalHeadingOverride(styles.modalTitle.fontSize)]}>Issue Gift Card</Text>
              <TouchableOpacity onPress={() => setIssueVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalLabel, { color: COLORS.muted }]}>Amount (₹)</Text>
            <View style={{ borderRadius: 12 }}>
              <TextInput
                style={[styles.modalInput, { backgroundColor: COLORS.cardAlt, color: COLORS.heading, borderColor: COLORS.inputBorder }]}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholderTextColor={COLORS.placeholder}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalCancelBtn, { backgroundColor: COLORS.card }]} onPress={() => setIssueVisible(false)}>
                <Text style={[styles.modalCancelText, { color: COLORS.heading }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: COLORS.button }]} onPress={handleIssue} disabled={issueGiftCard.isPending}>
                {issueGiftCard.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Issue</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 30 : 30 },
  header: { flexDirection: 'row', alignItems: 'center', marginHorizontal: isDesktopWeb ? -12 : -12, paddingHorizontal: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 9 : 9, gap: isDesktopWeb ? 7.5 : 7.5, marginBottom: isDesktopWeb ? 3 : 3 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold' },
  titleCount: { fontSize: 14, fontWeight: '400' },
  gcCard: { marginBottom: isDesktopWeb ? 12 : 12, borderRadius: 8, overflow: 'hidden' },
  gcHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: isDesktopWeb ? 12 : 12 },
  gcCode: { color: 'white', fontWeight: '900', letterSpacing: 2, fontSize: isDesktopWeb ? 16 : 12 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: isDesktopWeb ? 7.5 : 7.5 },
  balanceLabel: { fontSize: 11, opacity: 0.55, textTransform: 'uppercase' },
  balanceAmt: { fontSize: isDesktopWeb ? 32 : 12, fontWeight: '900', marginTop: isDesktopWeb ? 2 : 1.5 },
  progressBar: { height: 8, borderRadius: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: isDesktopWeb ? 1.5 : 1.5 },
  metaLabel: { fontSize: 12, opacity: 0.55 },
  metaValue: { fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 18 : 18 },
  modalSheet: { width: '100%', borderRadius: 12, padding: isDesktopWeb ? 12 : 12, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: isDesktopWeb ? 6 : 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800' },
  modalLabel: { fontSize: 12, fontWeight: '600', marginBottom: isDesktopWeb ? 3 : 3 },
  modalInput: { borderWidth: INPUT_BORDER_WIDTH, borderRadius: isDesktopWeb ? 8 : 8, paddingHorizontal: 10, height: 34, fontSize: 12 },
  modalActions: { flexDirection: 'row', gap: 6, marginTop: 9 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6, paddingVertical: 7.5 },
  modalCancelText: { fontSize: 12, fontWeight: '700' },
  modalSaveBtn: { flex: 1.3, alignItems: 'center', justifyContent: 'center', borderRadius: 6, paddingVertical: 7.5 },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
