import React, { useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useKhatabook, useKhata, useSettleKhata } from '../../../../../core/api/hooks/useKhatabook';
import { KhataCustomer, KhataSettleMethod } from '../../../../../core/api/khatabookApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { ScreenContainer } from '../../../../../core/components/ScreenContainer';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { Tooltip } from '../../../../../shared/components/atoms/Tooltip';
import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;
const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SETTLE_METHODS: KhataSettleMethod[] = ['Cash', 'UPI', 'Card'];
const SETTLE_METHOD_ICON: Record<KhataSettleMethod, string> = { Cash: 'cash', UPI: 'qrcode-scan', Card: 'credit-card-outline' };

/** "3 days ago" beats a date here — what a shopkeeper reads off a khata is how long it's
 *  been sitting, not the calendar day it started. Falls back to a real date past a month,
 *  where "47 days" stops being the more useful of the two. */
const sinceLabel = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 31) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * The cafe's udhaar book. Every bill settled with the Due tender (see PaymentMethodPicker)
 * lands here as a line on that customer's khata; this screen is where the money comes back
 * in — in one go or, far more often, a bit at a time.
 *
 * Two levels, both on this one screen: the list of who owes what, and a customer's own ledger
 * opened in a sheet over it. Deliberately not a separate route — collecting a payment is a
 * ten-second interaction at a counter, and the list you came from is the thing you want back
 * the instant it's done.
 */
export const KhatabookScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState('');
  const [includeSettled, setIncludeSettled] = useState(false);
  const { data, isLoading, isError, refetch } = useKhatabook({
    search: search.trim() || undefined,
    includeSettled,
  });

  // Which customer's ledger is open over the list. The row's own summary is kept alongside
  // the id so the sheet can render its header instantly, before the ledger fetch lands.
  const [openCustomer, setOpenCustomer] = useState<KhataCustomer | null>(null);
  const { data: khata, isLoading: khataLoading } = useKhata(openCustomer?.customerId ?? null);
  const settleKhata = useSettleKhata();

  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState<KhataSettleMethod>('Cash');
  const [settleNote, setSettleNote] = useState('');

  // The sheet's own copy of the customer, refreshed by the settle response — the list behind
  // it refetches too, but the header shouldn't wait on that round trip to stop showing a
  // balance that's just been paid off.
  const current = khata?.customer ?? openCustomer;
  const outstanding = current?.outstanding ?? 0;

  const openLedger = (customer: KhataCustomer) => {
    setOpenCustomer(customer);
    setSettleAmount('');
    setSettleMethod('Cash');
    setSettleNote('');
  };

  const submitSettle = async () => {
    if (!openCustomer) return;
    const amount = parseFloat(settleAmount);
    if (!settleAmount.trim() || isNaN(amount) || amount <= 0) {
      dispatch(showToast({ message: 'Enter an amount greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    // Checked here as well as server-side so the common slip (typing the full bill when only
    // part is being handed over) is caught before a round trip.
    if (amount - outstanding > 0.005) {
      dispatch(showToast({ message: `That's more than the ${money(outstanding)} outstanding.`, icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      const updated = await settleKhata.mutateAsync({
        customerId: openCustomer.customerId,
        amount,
        method: settleMethod,
        note: settleNote.trim() || undefined,
      });
      setSettleAmount('');
      setSettleNote('');
      const left = updated.customer.outstanding;
      dispatch(showToast({
        message: left > 0.005
          ? `${money(amount)} received — ${money(left)} still on ${updated.customer.name}'s khata.`
          : `${money(amount)} received — ${updated.customer.name}'s khata is clear.`,
        icon: 'check-circle',
        tone: 'success',
      }));
      // A khata settled to zero has nothing left to look at, and the cashier's next move is
      // the list — so close out rather than leaving an empty sheet in the way.
      if (left <= 0.005) setOpenCustomer(null);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not record the payment'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const customers = data?.customers ?? [];

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="notebook-outline" title="Khatabook" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="notebook-outline" size={22} color={COLORS.accent} />
          <Text style={styles.headerTitle}>Khatabook</Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      <ScreenContainer maxWidth={900} style={{ flex: 1, width: '100%', alignSelf: 'center' }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {isError && !data ? (
            <ErrorState
              title="Couldn't load the khatabook"
              message="Check your connection and try again."
              onRetry={() => refetch()}
            />
          ) : (
            <>
              <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, styles.accentCard]}>
                  <Text style={styles.accentLabel}>TOTAL OUTSTANDING</Text>
                  <Text style={styles.accentValue}>{money(data?.summary.totalOutstanding ?? 0)}</Text>
                  <Text style={styles.accentSub}>
                    across {data?.summary.customersWithDue ?? 0} {(data?.summary.customersWithDue ?? 0) === 1 ? 'customer' : 'customers'}
                  </Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>COLLECTED THIS MONTH</Text>
                  <Text style={styles.summaryValue}>{money(data?.summary.collectedThisMonth ?? 0)}</Text>
                </View>
              </View>

              <View style={styles.filterRow}>
                <View style={styles.searchWrap}>
                  <Icon name="magnify" size={16} color={COLORS.muted} />
                  <TextInput
                    style={[styles.searchInput, webNoOutline]}
                    placeholder="Search by name or mobile"
                    placeholderTextColor={COLORS.placeholder}
                    value={search}
                    onChangeText={setSearch}
                  />
                  {!!search && (
                    <Tooltip label="Clear search" placement="bottom">
                      <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Icon name="close-circle" size={15} color={COLORS.muted} />
                      </TouchableOpacity>
                    </Tooltip>
                  )}
                </View>
                {/* Cleared khatas are hidden by default — the list's job is "who do I need to
                    chase", and a cafe two years into running credit would otherwise open this
                    to a wall of zeroes. */}
                <TouchableOpacity
                  style={[styles.togglePill, includeSettled && styles.togglePillActive, webNoOutline]}
                  onPress={() => setIncludeSettled((on) => !on)}
                >
                  <Icon
                    name={includeSettled ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={15}
                    color={includeSettled ? '#FFFFFF' : COLORS.muted}
                  />
                  <Text style={[styles.togglePillText, includeSettled && styles.togglePillTextActive]}>Cleared</Text>
                </TouchableOpacity>
              </View>

              {isLoading && <SkeletonList rows={6} />}
              {!isLoading && customers.length === 0 && (
                <Text style={styles.emptyText}>
                  {search.trim()
                    ? 'No khata matches that name or number.'
                    : 'Nobody owes anything right now. A bill settled with the Due tender opens a khata here.'}
                </Text>
              )}

              {customers.map((c) => {
                const clear = c.outstanding <= 0.005;
                return (
                  <TouchableOpacity key={c.customerId} style={[styles.khataCard, webNoOutline]} onPress={() => openLedger(c)}>
                    <View style={styles.avatarBox}>
                      <Text style={styles.avatarText}>{c.name.trim().charAt(0).toUpperCase() || '?'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.cardTopRow}>
                        <Text style={styles.customerName} numberOfLines={1}>{c.name}</Text>
                        <Text style={[styles.outstandingText, clear && styles.clearText]}>
                          {clear ? 'Clear' : money(c.outstanding)}
                        </Text>
                      </View>
                      <Text style={styles.customerMeta} numberOfLines={1}>
                        {c.phone ?? 'No number'} · {c.entryCount} {c.entryCount === 1 ? 'entry' : 'entries'} · last {sinceLabel(c.lastActivityAt)}
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={18} color={COLORS.muted} />
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>
      </ScreenContainer>

      <Modal visible={openCustomer !== null} transparent animationType="fade" onRequestClose={() => setOpenCustomer(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]} numberOfLines={1}>
                  {current?.name ?? ''}
                </Text>
                <Text style={styles.modalSubtitle}>{current?.phone ?? 'No number on file'}</Text>
              </View>
              <CloseButton onPress={() => setOpenCustomer(null)} size={18} />
            </View>

            <View style={styles.balanceStrip}>
              <View style={{ flex: 1 }}>
                <Text style={styles.balanceLabel}>OUTSTANDING</Text>
                <Text style={styles.balanceValue}>{money(outstanding)}</Text>
              </View>
              <View style={styles.balanceSideCol}>
                <Text style={styles.balanceSideLabel}>Taken</Text>
                <Text style={styles.balanceSideValue}>{money(current?.totalDue ?? 0)}</Text>
              </View>
              <View style={styles.balanceSideCol}>
                <Text style={styles.balanceSideLabel}>Paid back</Text>
                <Text style={styles.balanceSideValue}>{money(current?.totalPaid ?? 0)}</Text>
              </View>
            </View>

            {outstanding > 0.005 && (
              <>
                <View style={styles.settleAmountRow}>
                  <TextInput
                    style={[styles.formInput, { flex: 1 }, webNoOutline]}
                    placeholder={`Amount received (up to ${money(outstanding)})`}
                    placeholderTextColor={COLORS.placeholder}
                    value={settleAmount}
                    onChangeText={(t) => setSettleAmount(t.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                  />
                  {/* Paying the whole thing off is the one amount worth a shortcut; every
                      other figure is a number the customer just handed over. */}
                  <TouchableOpacity
                    style={[styles.fullBtn, webNoOutline]}
                    onPress={() => setSettleAmount(outstanding.toFixed(2))}
                  >
                    <Text style={styles.fullBtnText}>Full</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.methodRow}>
                  {SETTLE_METHODS.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.methodPill, settleMethod === m && styles.methodPillActive, webNoOutline]}
                      onPress={() => setSettleMethod(m)}
                    >
                      <Icon name={SETTLE_METHOD_ICON[m]} size={14} color={settleMethod === m ? '#FFFFFF' : COLORS.muted} />
                      <Text style={[styles.methodPillText, settleMethod === m && styles.methodPillTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput
                  style={[styles.formInput, webNoOutline]}
                  placeholder="Note (optional)"
                  placeholderTextColor={COLORS.placeholder}
                  value={settleNote}
                  onChangeText={setSettleNote}
                />

                <TouchableOpacity
                  style={[styles.settleBtn, settleKhata.isPending && { opacity: 0.6 }, webNoOutline]}
                  onPress={submitSettle}
                  disabled={settleKhata.isPending}
                >
                  {settleKhata.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Icon name="cash-check" size={16} color="#FFFFFF" />
                  )}
                  <Text style={styles.settleBtnText}>Record Payment</Text>
                </TouchableOpacity>
              </>
            )}

            <Text style={styles.ledgerHeading}>LEDGER</Text>
            <ScrollView style={styles.ledgerScroll} showsVerticalScrollIndicator={false}>
              {khataLoading && !khata && <SkeletonList rows={3} />}
              {khata?.entries.map((e) => {
                const isDue = e.type === 'Due';
                return (
                  <View key={e.id} style={styles.ledgerRow}>
                    <Icon
                      name={isDue ? 'arrow-top-right' : 'arrow-bottom-left'}
                      size={15}
                      color={isDue ? COLORS.dangerAccent : COLORS.success}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ledgerTitle}>
                        {isDue ? `Credit${e.orderNumber ? ` · Bill ${e.orderNumber}` : ''}` : `Paid back${e.method ? ` · ${e.method}` : ''}`}
                      </Text>
                      <Text style={styles.ledgerMeta} numberOfLines={1}>
                        {new Date(e.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        {' · '}{e.recordedByName}
                        {e.note ? ` · ${e.note}` : ''}
                      </Text>
                    </View>
                    <View style={styles.ledgerAmountCol}>
                      <Text style={[styles.ledgerAmount, isDue ? styles.danger : styles.positive]}>
                        {isDue ? '+' : '−'}{money(e.amount)}
                      </Text>
                      <Text style={styles.ledgerRunning}>{money(e.runningOutstanding)}</Text>
                    </View>
                  </View>
                );
              })}
              {!khataLoading && khata?.entries.length === 0 && (
                <Text style={styles.emptyText}>Nothing on this khata yet.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7.5, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 9 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },

  summaryRow: { flexDirection: 'row', gap: isDesktopWeb ? 8 : 9, paddingHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 11 : 12 },
  summaryCard: { flex: 1, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: 12 },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginBottom: 4.5 },
  summaryValue: { fontSize: isDesktopWeb ? 20 : 13, fontWeight: 'bold', color: COLORS.heading },
  accentCard: { backgroundColor: COLORS.button },
  accentLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5, marginBottom: 4.5 },
  accentValue: { fontSize: isDesktopWeb ? 20 : 13, fontWeight: 'bold', color: '#FFFFFF' },
  accentSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: isDesktopWeb ? 16 : 12, marginBottom: 10 },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.cardAlt, borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder,
    paddingHorizontal: 10, height: 36,
  },
  searchInput: { flex: 1, fontSize: 12.5, color: COLORS.heading },
  togglePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, height: 36, borderRadius: 8,
    backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: COLORS.inputBorder,
  },
  togglePillActive: { backgroundColor: COLORS.button, borderColor: COLORS.button },
  togglePillText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  togglePillTextActive: { color: '#FFFFFF' },

  emptyText: { textAlign: 'center', color: COLORS.muted, marginTop: 15, paddingHorizontal: 24, fontSize: 12.5, lineHeight: 18 },
  khataCard: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: 10.5, marginBottom: 9,
  },
  avatarBox: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.aiCardBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: COLORS.heading },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 },
  customerName: { fontSize: isDesktopWeb ? 15 : 13, fontWeight: 'bold', color: COLORS.heading, flexShrink: 1 },
  outstandingText: { fontSize: isDesktopWeb ? 15 : 13, fontWeight: '800', color: COLORS.dangerAccent },
  clearText: { color: COLORS.success },
  customerMeta: { fontSize: 11.5, color: COLORS.muted, marginTop: 1.5 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  modalSheet: { width: '100%', maxWidth: 460, maxHeight: '88%', backgroundColor: COLORS.background, borderRadius: 12, padding: 12, gap: 7 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: 'bold', color: COLORS.heading, flexShrink: 1 },
  modalSubtitle: { fontSize: 12, color: COLORS.muted, marginTop: 1 },

  balanceStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: 11 },
  balanceLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 },
  balanceValue: { fontSize: 19, fontWeight: '800', color: COLORS.dangerAccent, marginTop: 2 },
  balanceSideCol: { alignItems: 'flex-end' },
  balanceSideLabel: { fontSize: 10, color: COLORS.muted },
  balanceSideValue: { fontSize: 12.5, fontWeight: '700', color: COLORS.heading, marginTop: 2 },

  settleAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  formInput: {
    backgroundColor: COLORS.cardAlt, borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder,
    paddingHorizontal: 10, height: 36, fontSize: 12.5, color: COLORS.heading,
  },
  fullBtn: {
    paddingHorizontal: 12, height: 36, alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: COLORS.cardAlt,
  },
  fullBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.heading },
  methodRow: { flexDirection: 'row', gap: 6 },
  methodPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: COLORS.inputBorder,
  },
  methodPillActive: { backgroundColor: COLORS.button, borderColor: COLORS.button },
  methodPillText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  methodPillTextActive: { color: '#FFFFFF' },
  settleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.button,
  },
  settleBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  ledgerHeading: { fontSize: 11, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginTop: 4 },
  ledgerScroll: { maxHeight: 220 },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  ledgerTitle: { fontSize: 12.5, fontWeight: '700', color: COLORS.heading },
  ledgerMeta: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  ledgerAmountCol: { alignItems: 'flex-end' },
  ledgerAmount: { fontSize: 12.5, fontWeight: '800' },
  // The balance as it stood after this row — the column a shopkeeper actually traces down
  // when they want to know how a total got where it is.
  ledgerRunning: { fontSize: 10.5, color: COLORS.muted, marginTop: 1 },
  danger: { color: COLORS.dangerAccent },
  positive: { color: COLORS.success },
});
