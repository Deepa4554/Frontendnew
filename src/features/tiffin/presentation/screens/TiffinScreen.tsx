import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  ActivityIndicator, Switch, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootState } from '../../../../core/store/rootReducer';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { showToast } from '../../../../core/store/uiSlice';
import { getApiErrorMessage } from '../../../../core/network/api';
import { useSettings } from '../../../../core/api/hooks/useSettings';
import { PrinterService } from '../../../../core/printing/PrinterService';
import { ScreenContainer } from '../../../../core/components/ScreenContainer';
import { SkeletonList } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';
import { Tooltip } from '../../../../shared/components/atoms/Tooltip';
import { CloseButton } from '../../../../shared/components/atoms/CloseButton';
import { modalHeadingOverride } from '../../../../shared/design/commonStyles';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';
import {
  useTiffinRoster, useMarkTiffin, useTiffinSubscribers, useCreateTiffinSubscriber,
  useUpdateTiffinSubscriber, useTiffinBilling, useGenerateTiffinInvoices,
  useTiffinInvoice, useSettleTiffinInvoice, useTiffinWallet, useRechargeTiffinWallet,
} from '../../../../core/api/hooks/useTiffin';
import {
  TiffinSubscriber, TiffinType, TiffinMealType, TiffinSettleMethod, TiffinBillingLine, TiffinPaymentMode,
} from '../../../../core/api/tiffinApi';

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;
const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const TYPES: TiffinType[] = ['Daily', 'Occasional'];
const MEAL_TYPES: TiffinMealType[] = ['Veg', 'NonVeg', 'Custom'];
const MEAL_LABEL: Record<TiffinMealType, string> = { Veg: 'Veg', NonVeg: 'Non-Veg', Custom: 'Custom' };
const SETTLE_METHODS: TiffinSettleMethod[] = ['Cash', 'UPI', 'Card'];
const SETTLE_METHOD_ICON: Record<TiffinSettleMethod, string> = { Cash: 'cash', UPI: 'qrcode-scan', Card: 'credit-card-outline' };
const PAYMENT_MODES: TiffinPaymentMode[] = ['Postpaid', 'Prepaid'];

type Tab = 'roster' | 'subscribers' | 'billing';

// ── date helpers (cafe-local, no timezone math — a roster/bill date is a calendar day) ──
const pad = (n: number) => String(n).padStart(2, '0');
const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMonthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const parseYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s: string, n: number) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return toYmd(d); };
const addMonthsKey = (s: string, n: number) => { const [y, m] = s.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return toMonthKey(d); };
const isToday = (s: string) => s === toYmd(new Date());
const isFutureDay = (s: string) => parseYmd(s) > new Date(new Date().toDateString());
const dayLabel = (s: string) => {
  // Just "Today" when it is — the actual date only shows once you've moved off it via the
  // ← → arrows, where it's the only way to tell which day you're looking at.
  if (isToday(s)) return 'Today';
  return parseYmd(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
const monthLabel = (s: string) => { const [y, m] = s.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); };

const fmtRange = (start: string, end: string) => {
  const opt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${parseYmd(start).toLocaleDateString('en-IN', opt)} - ${parseYmd(end).toLocaleDateString('en-IN', opt)}`;
};

/** Builds and sends a tiffin bill to the same thermal printer the POS uses (PrinterService),
 * as a one-line receipt: the plan + period + days, the plate count as quantity, the per-plate
 * rate as price. */
async function printTiffinBill(
  settings: any,
  r: { orderNumber: string; name: string; planName: string; periodStart: string; periodEnd: string; deliveredDays: number; totalQty: number; rate: number; total: number },
) {
  return PrinterService.printReceipt({
    businessName: settings?.businessName ?? 'PrabandhOS',
    addressLine: settings?.address?.trim() || undefined,
    orderNumber: r.orderNumber,
    time: new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    title: r.name,
    orderTypeLabel: 'Tiffin',
    gstNumber: settings?.gstNumber,
    items: [{ name: `${r.planName} - ${fmtRange(r.periodStart, r.periodEnd)} (${r.deliveredDays}d)`, qty: r.totalQty, price: r.rate }],
    subtotal: r.total,
    taxRatePct: 0,
    tax: 0,
    total: r.total,
    footer: settings?.receiptFooter ?? 'Thank you!',
    showAddress: settings?.receiptShowAddress,
    showFooter: settings?.receiptShowFooter,
  });
}

interface SubForm {
  id: number | null;
  name: string;
  phone: string;
  type: TiffinType;
  planName: string;
  mealType: TiffinMealType;
  rate: string;
  defaultQty: string;
  deliveryAddress: string;
  notes: string;
  isActive: boolean;
  paymentMode: TiffinPaymentMode;
}

const emptyForm: SubForm = {
  id: null, name: '', phone: '', type: 'Daily', planName: 'Tiffin', mealType: 'Veg',
  rate: '', defaultQty: '1', deliveryAddress: '', notes: '', isActive: true, paymentMode: 'Postpaid',
};

export const TiffinScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  const role = useSelector((s: RootState) => s.auth.user?.role);
  // Billing (raising bills, taking money) is Owner/Manager only — the same split the backend
  // enforces. Floor staff get the roster + subscribers tabs, not this one.
  const canManage = role === 'Owner' || role === 'Manager';

  const [tab, setTab] = useState<Tab>('roster');
  const effectiveTab: Tab = tab === 'billing' && !canManage ? 'roster' : tab;

  // Lives here, not inside RosterTab, so the header (which sits outside the tab's own
  // ScrollView and never scrolls away) can show and drive it too.
  const [date, setDate] = useState(() => toYmd(new Date()));

  // Roster/Subscribers/Billing, built once and reused in both header variants (mobile's own
  // row and DesktopPageHeader's `right` slot) so the tabs live in the same row as "Tiffin"
  // instead of a separate row underneath it. Icon-only on mobile — a back button + icon +
  // title already fill most of a phone header, so three icon+label pills wouldn't fit;
  // desktop's header has the room, so it keeps the label.
  const headerTabs = (
    <View style={styles.headerTabRow}>
      {(['roster', 'subscribers', ...(canManage ? ['billing'] as Tab[] : [])] as Tab[]).map((t) => {
        const label = t === 'roster' ? 'Roster' : t === 'subscribers' ? 'Subscribers' : 'Billing';
        return (
          <TouchableOpacity
            key={t}
            style={[
              isDesktopWeb ? styles.tabPillCompact : styles.tabPillIconOnly,
              effectiveTab === t && styles.tabPillActive,
              webNoOutline,
            ]}
            onPress={() => setTab(t)}
            accessibilityLabel={label}
          >
            <Icon
              name={t === 'roster' ? 'clipboard-list-outline' : t === 'subscribers' ? 'account-group-outline' : 'cash-multiple'}
              size={isDesktopWeb ? 13 : 16}
              color={effectiveTab === t ? '#FFFFFF' : COLORS.muted}
            />
            {isDesktopWeb && (
              <Text style={[styles.tabPillText, effectiveTab === t && styles.tabPillTextActive]}>{label}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // Only meaningful on Roster — Subscribers has no day, Billing steps by month via its own
  // control in the tab body (not moved here; a month picker isn't what was asked for).
  const dateNav = effectiveTab === 'roster' ? (
    <View style={styles.headerDateNav}>
      <TouchableOpacity
        style={[styles.headerDateBtn, webNoOutline]}
        onPress={() => setDate((d) => addDays(d, -1))}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name="chevron-left" size={16} color={COLORS.heading} />
      </TouchableOpacity>
      <TouchableOpacity
        style={webNoOutline}
        onPress={() => setDate(toYmd(new Date()))}
        disabled={isToday(date)}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <Text style={styles.headerDateText} numberOfLines={1}>{dayLabel(date)}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.headerDateBtn, webNoOutline]}
        onPress={() => setDate((d) => addDays(d, 1))}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name="chevron-right" size={16} color={COLORS.heading} />
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="silverware-fork-knife" title="Tiffin" right={<>{dateNav}{headerTabs}</>} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="silverware-fork-knife" size={22} color={COLORS.accent} />
          <Text style={styles.headerTitle}>Tiffin</Text>
          <View style={{ flex: 1 }} />
          {dateNav}
          {headerTabs}
        </View>
      )}

      {effectiveTab === 'roster' && <RosterTab COLORS={COLORS} styles={styles} isDesktopWeb={isDesktopWeb} date={date} setDate={setDate} />}
      {effectiveTab === 'subscribers' && <SubscribersTab COLORS={COLORS} styles={styles} isDesktopWeb={isDesktopWeb} />}
      {effectiveTab === 'billing' && canManage && <BillingTab COLORS={COLORS} styles={styles} />}
    </View>
  );
};

// ─────────────────────────────  Roster  ─────────────────────────────

interface TabProps {
  COLORS: ReturnType<typeof useThemeColors>;
  styles: ReturnType<typeof makeStyles>;
  isDesktopWeb: boolean;
}

type RosterEntry = NonNullable<ReturnType<typeof useTiffinRoster>['data']>['entries'][number];

// One roster row. React.memo'd + given stable props so the list skips re-render while the user
// types in the roster search box — only the row whose own entry (or busy state) changed re-renders.
const RosterCard = React.memo(({ e, styles, COLORS, busy, onSetQty }: {
  e: RosterEntry;
  styles: ReturnType<typeof makeStyles>;
  COLORS: ReturnType<typeof useThemeColors>;
  busy: boolean;
  onSetQty: (subscriberId: number, qty: number) => void;
}) => {
  const isOccasional = e.type === 'Occasional';
  return (
    <View style={[styles.rosterCard, !e.delivering && styles.rosterCardOff]}>
      <View style={[styles.mealDot, { backgroundColor: e.mealType === 'NonVeg' ? COLORS.danger : e.mealType === 'Veg' ? COLORS.success : COLORS.warning }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.cardTopRow}>
          <View style={styles.nameMetaWrap}>
            <Text style={styles.customerName} numberOfLines={1}>{e.name}</Text>
            <Text style={styles.customerMeta} numberOfLines={1}>
              {e.planName} · {MEAL_LABEL[e.mealType]} · {e.qty} {e.qty === 1 ? 'plate' : 'plates'}
              {!e.delivering ? ' · skipped' : e.type === 'Occasional' ? ' · added' : e.qty !== e.defaultQty ? ' · changed' : ''}
            </Text>
          </View>
          <View style={[styles.typeTag, isOccasional ? styles.typeTagOcc : styles.typeTagDaily]}>
            <Text style={[styles.typeTagText, isOccasional ? styles.typeTagTextOcc : styles.typeTagTextDaily]}>
              {isOccasional ? 'Occasional' : 'Daily'}
            </Text>
          </View>
        </View>
        {!!e.deliveryAddress && <Text style={styles.addressMeta} numberOfLines={1}>{e.deliveryAddress}</Text>}
        {/* Still delivers on a negative balance (see TiffinController.SyncWalletDeductionAsync) —
            this is a nudge to collect a top-up, not a block. */}
        {e.paymentMode === 'Prepaid' && (e.walletBalance ?? 0) < 0 && (
          <View style={styles.lowBalanceTag}>
            <Icon name="wallet-outline" size={10} color={COLORS.danger} />
            <Text style={styles.lowBalanceTagText}>Balance {money0(e.walletBalance ?? 0)} — needs top-up</Text>
          </View>
        )}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={COLORS.accent} style={{ width: 96 }} />
      ) : (
        (() => {
          const shown = e.delivering ? e.qty : 0;
          return (
            <View style={[styles.qtyStepper, shown > 0 && styles.qtyStepperOn]}>
              <TouchableOpacity
                style={[styles.qtyBtn, shown <= 0 && { opacity: 0.35 }, webNoOutline]}
                onPress={() => onSetQty(e.subscriberId, shown - 1)}
                disabled={shown <= 0}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Icon name="minus" size={16} color={shown > 0 ? '#FFFFFF' : COLORS.heading} />
              </TouchableOpacity>
              <Text style={[styles.qtyText, shown > 0 ? styles.qtyTextOn : styles.qtyTextOff]}>{shown}</Text>
              <TouchableOpacity
                style={[styles.qtyBtn, webNoOutline]}
                onPress={() => onSetQty(e.subscriberId, shown + 1)}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Icon name="plus" size={16} color={shown > 0 ? '#FFFFFF' : COLORS.heading} />
              </TouchableOpacity>
            </View>
          );
        })()
      )}
    </View>
  );
});

const RosterTab: React.FC<TabProps & { date: string; setDate: React.Dispatch<React.SetStateAction<string>> }> = ({ COLORS, styles, date, setDate }) => {
  const dispatch = useDispatch();
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, refetch } = useTiffinRoster(date);
  const mark = useMarkTiffin();
  const [busyId, setBusyId] = useState<number | null>(null);

  // One control does everything: the plate count itself is the on/off. Raise it to send more
  // plates, drop it to 0 to skip the day entirely — so there's no separate toggle to reconcile
  // with the quantity. 0 → not delivering (a skip for Daily, simply "not added" for Occasional);
  // 1+ → delivering that many. Setting a Daily subscriber back to their usual count clears the
  // override server-side, so an untouched day reads as a plain default again.
  const setQty = async (subscriberId: number, newQty: number) => {
    setBusyId(subscriberId);
    try {
      if (newQty < 1) await mark.mutateAsync({ subscriberId, date, deliver: false });
      else await mark.mutateAsync({ subscriberId, date, deliver: true, qty: newQty });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update the roster'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setBusyId(null);
    }
  };

  // Stable identity for RosterCard's React.memo — setQty closes over fresh state each render, so
  // the ref keeps it current without re-rendering every row on each keystroke.
  const setQtyRef = useRef(setQty);
  setQtyRef.current = setQty;
  const onSetQty = useCallback((subscriberId: number, qty: number) => setQtyRef.current(subscriberId, qty), []);

  const s = data?.summary;
  const entries = data?.entries ?? [];
  // Search filters only the LIST (so you can jump to a person and update them) — the summary
  // above keeps the whole day's cook count, which shouldn't move because you typed a name.
  const term = search.trim().toLowerCase();
  const filtered = term
    ? entries.filter((e) => e.name.toLowerCase().includes(term) || (e.phone ?? '').includes(term))
    : entries;

  return (
    <ScreenContainer maxWidth={900} style={{ flex: 1, width: '100%', alignSelf: 'center' }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {isError && !data ? (
          <ErrorState title="Couldn't load the roster" message="Check your connection and try again." onRetry={() => refetch()} />
        ) : (
          <>
            {/* Date nav lives in the screen header now, outside this ScrollView, so it stays
                visible while the roster list scrolls — this row is just the day's two chips. */}
            <View style={styles.dateSummaryRow}>
              {/* Single-line stat chips, not stacked cards — a label+value+sub card only reads
                  well with real width to breathe. A chip sized to its own one line of text
                  never wraps, and sits at the same height as pills elsewhere in the row. */}
              <View style={styles.statChipsRow}>
                <View style={[styles.statChip, styles.statChipAccent]}>
                  <Icon name="food-variant" size={13} color={COLORS.muted} />
                  <Text style={styles.statChipTextLight} numberOfLines={1}>
                    <Text style={styles.statChipBoldLight}>{s?.totalPlates ?? 0}</Text> plates
                    {'  ·  '}{s?.totalDelivering ?? 0} {(s?.totalDelivering ?? 0) === 1 ? 'delivery' : 'deliveries'}
                    {(s?.skippedCount ?? 0) > 0 ? `  ·  ${s?.skippedCount} skipped` : ''}
                  </Text>
                </View>
                <View style={[styles.statChip, styles.statChipLight]}>
                  <Text style={styles.statChipTextDark} numberOfLines={1}>
                    <Text style={styles.vegDot}>●</Text> {s?.vegPlates ?? 0} veg{'   '}
                    <Text style={styles.nonVegDot}>●</Text> {s?.nonVegPlates ?? 0} non-veg
                    {(s?.customPlates ?? 0) > 0 ? `  ·  ${s?.customPlates} custom` : ''}
                  </Text>
                </View>
              </View>
            </View>

            {isFutureDay(date) && (
              <Text style={styles.futureNote}>Planning ahead — mark skips/adds now and they'll be waiting on the day.</Text>
            )}

            {entries.length > 0 && (
              <View style={styles.filterRow}>
                <View style={styles.searchWrap}>
                  <Icon name="magnify" size={16} color={COLORS.muted} />
                  <TextInput
                    style={[styles.searchInput, webNoOutline]}
                    placeholder="Find by name or mobile"
                    placeholderTextColor={COLORS.placeholder}
                    value={search}
                    onChangeText={setSearch}
                  />
                  {!!search && (
                    <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Icon name="close-circle" size={15} color={COLORS.muted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {isLoading && <SkeletonList rows={6} />}
            {!isLoading && entries.length === 0 && (
              <Text style={styles.emptyText}>
                No active subscribers for this day yet. Add people under the Subscribers tab.
              </Text>
            )}
            {!isLoading && entries.length > 0 && filtered.length === 0 && (
              <Text style={styles.emptyText}>No subscriber matches "{search.trim()}".</Text>
            )}

            {filtered.map((e) => (
              <RosterCard
                key={e.subscriberId}
                e={e}
                styles={styles}
                COLORS={COLORS}
                busy={busyId === e.subscriberId}
                onSetQty={onSetQty}
              />
            ))}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
};

// ─────────────────────────────  Subscribers  ─────────────────────────────

// One subscriber row. React.memo'd + stable props so the list skips re-render while the user
// types in the subscribers search box (each keystroke re-queries and re-renders the tab).
const SubscriberCard = React.memo(({ sub, styles, COLORS, onEdit }: {
  sub: TiffinSubscriber;
  styles: ReturnType<typeof makeStyles>;
  COLORS: ReturnType<typeof useThemeColors>;
  onEdit: (s: TiffinSubscriber) => void;
}) => {
  const isOccasional = sub.type === 'Occasional';
  return (
    <TouchableOpacity style={[styles.khataCard, !sub.isActive && styles.rosterCardOff, webNoOutline]} onPress={() => onEdit(sub)}>
      <View style={styles.avatarBox}>
        <Text style={styles.avatarText}>{sub.name.trim().charAt(0).toUpperCase() || '?'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.cardTopRow}>
          <View style={styles.nameMetaWrap}>
            <Text style={styles.customerName} numberOfLines={1}>{sub.name}</Text>
            <Text style={styles.customerMeta} numberOfLines={1}>
              {sub.planName} · {MEAL_LABEL[sub.mealType]} · {money0(sub.rate)}/plate · ×{sub.defaultQty}
              {!sub.isActive ? ' · inactive' : ''}
            </Text>
          </View>
          <View style={[styles.typeTag, isOccasional ? styles.typeTagOcc : styles.typeTagDaily]}>
            <Text style={[styles.typeTagText, isOccasional ? styles.typeTagTextOcc : styles.typeTagTextDaily]}>
              {isOccasional ? 'Occasional' : 'Daily'}
            </Text>
          </View>
          {sub.paymentMode === 'Prepaid' && (
            <View style={styles.walletBadge}>
              <Icon name="wallet-outline" size={11} color={(sub.walletBalance ?? 0) < 0 ? COLORS.danger : COLORS.success} />
              <Text style={[styles.walletBadgeText, { color: (sub.walletBalance ?? 0) < 0 ? COLORS.danger : COLORS.success }]}>
                {money0(sub.walletBalance ?? 0)}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.addressMeta} numberOfLines={1}>{sub.phone ?? 'No number'}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={COLORS.muted} />
    </TouchableOpacity>
  );
});

const SubscribersTab: React.FC<TabProps> = ({ COLORS, styles, isDesktopWeb }) => {
  const dispatch = useDispatch();
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  // No `search` param here on purpose — keeping it out of the query means typing filters the
  // already-fetched list client-side instead of re-querying (and re-showing a loading skeleton)
  // on every keystroke.
  const { data, isLoading, isError, refetch } = useTiffinSubscribers({ includeInactive });
  const createSub = useCreateTiffinSubscriber();
  const updateSub = useUpdateTiffinSubscriber();

  const [form, setForm] = useState<SubForm | null>(null);
  const [rechargeId, setRechargeId] = useState<number | null>(null);
  const set = <K extends keyof SubForm>(k: K, v: SubForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const openCreate = () => setForm({ ...emptyForm });
  // useCallback so its identity is stable — otherwise SubscriberCard's React.memo would re-render
  // the whole list on every keystroke. setForm is already stable.
  const openEdit = useCallback((s: TiffinSubscriber) => setForm({
    id: s.id, name: s.name, phone: s.phone ?? '', type: s.type, planName: s.planName,
    mealType: s.mealType, rate: String(s.rate), defaultQty: String(s.defaultQty),
    deliveryAddress: s.deliveryAddress ?? '', notes: s.notes ?? '', isActive: s.isActive,
    // Carried through unchanged — this form has no Prepaid/wallet controls of its own, so
    // editing plan details here must never silently flip a Prepaid subscriber back to Postpaid.
    paymentMode: s.paymentMode,
  }), []);

  const submit = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      dispatch(showToast({ message: 'Enter the customer name.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    // Phone is optional, but a partial number is worse than none — a 3-digit "number" can't be
    // called or matched to a returning customer, and the round runs on being able to reach
    // them — so unlike a walk-in POS guest, it's required, not just validated when present.
    // Only checked on create (edit doesn't touch the phone at all).
    const phone = form.phone.trim();
    if (form.id === null && !/^\d{10}$/.test(phone)) {
      dispatch(showToast({ message: 'Enter a 10-digit mobile number.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const rate = parseFloat(form.rate);
    if (isNaN(rate) || rate < 0) {
      dispatch(showToast({ message: 'Enter a valid per-plate rate.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const qtyInput = parseInt(form.defaultQty, 10);
    // Daily's default is what goes out every day, so it can't be 0 — Occasional delivers nothing
    // by default regardless, so 0 there just means "no standing qty until someone marks a day".
    const qty = form.type === 'Occasional'
      ? (isNaN(qtyInput) || qtyInput < 0 ? 0 : qtyInput)
      : (qtyInput > 0 ? qtyInput : 1);
    try {
      if (form.id === null) {
        await createSub.mutateAsync({
          name: form.name.trim(), phone: form.phone.trim() || null, type: form.type,
          planName: form.planName.trim() || 'Tiffin', mealType: form.mealType, rate,
          defaultQty: qty, deliveryAddress: form.deliveryAddress.trim() || null,
          notes: form.notes.trim() || null, paymentMode: form.paymentMode,
        });
        dispatch(showToast({ message: `${form.name.trim()} added to the tiffin plan.`, icon: 'check-circle', tone: 'success' }));
      } else {
        await updateSub.mutateAsync({
          id: form.id, type: form.type, planName: form.planName.trim() || 'Tiffin',
          mealType: form.mealType, rate, defaultQty: qty,
          deliveryAddress: form.deliveryAddress.trim() || null, isActive: form.isActive,
          notes: form.notes.trim() || null, paymentMode: form.paymentMode,
        });
        dispatch(showToast({ message: 'Subscription updated.', icon: 'check-circle', tone: 'success' }));
      }
      setForm(null);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save the subscriber'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const subs = data ?? [];
  const term = search.trim().toLowerCase();
  const filtered = term
    ? subs.filter((s) => s.name.toLowerCase().includes(term) || (s.phone ?? '').includes(term))
    : subs;
  const saving = createSub.isPending || updateSub.isPending;
  // The form only carries editable plan fields — walletBalance is read fresh from the list/query
  // cache instead of being copied into SubForm, so it never goes stale while the sheet is open
  // (a recharge invalidates ['tiffin'], which refetches this list).
  const editingSub = form?.id != null ? subs.find((s) => s.id === form.id) ?? null : null;

  return (
    <ScreenContainer maxWidth={900} style={{ flex: 1, width: '100%', alignSelf: 'center' }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
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
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="close-circle" size={15} color={COLORS.muted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.togglePill, includeInactive && styles.togglePillActive, webNoOutline]}
            onPress={() => setIncludeInactive((on) => !on)}
          >
            <Icon name={includeInactive ? 'checkbox-marked' : 'checkbox-blank-outline'} size={15} color={includeInactive ? '#FFFFFF' : COLORS.muted} />
            <Text style={[styles.togglePillText, includeInactive && styles.togglePillTextActive]}>Inactive</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.addBtn, webNoOutline]} onPress={openCreate}>
          <Icon name="account-plus-outline" size={16} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Subscriber</Text>
        </TouchableOpacity>

        {isError && !data ? (
          <ErrorState title="Couldn't load subscribers" message="Check your connection and try again." onRetry={() => refetch()} />
        ) : (
          <>
            {isLoading && <SkeletonList rows={6} />}
            {!isLoading && filtered.length === 0 && (
              <Text style={styles.emptyText}>
                {search.trim() ? 'No subscriber matches that name or number.' : 'No one on the tiffin plan yet. Add your first regular above.'}
              </Text>
            )}
            {filtered.map((sub) => (
              <SubscriberCard key={sub.id} sub={sub} styles={styles} COLORS={COLORS} onEdit={openEdit} />
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={form !== null} transparent animationType="fade" onRequestClose={() => setForm(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>
                {form?.id === null ? 'Add Subscriber' : 'Edit Subscription'}
              </Text>
              <CloseButton onPress={() => setForm(null)} size={18} />
            </View>

            {/* Indicator left ON (unlike the list ScrollViews above) — this sheet's content can
                run past its capped height, and with no visible scrollbar there was nothing to
                tell the user the Active switch etc. below the fold even existed. */}
            <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {form?.id === null ? (
                <>
                  <Text style={styles.fieldLabel}>NAME <Text style={styles.requiredStar}>*</Text></Text>
                  <TextInput style={[styles.formInput, webNoOutline]} placeholder="Customer name" placeholderTextColor={COLORS.placeholder} value={form?.name} onChangeText={(t) => set('name', t)} />
                  <Text style={styles.fieldLabel}>MOBILE NUMBER <Text style={styles.requiredStar}>*</Text></Text>
                  <TextInput style={[styles.formInput, webNoOutline]} placeholder="10-digit mobile number" placeholderTextColor={COLORS.placeholder} value={form?.phone} onChangeText={(t) => set('phone', t.replace(/[^0-9]/g, ''))} keyboardType="phone-pad" maxLength={10} />
                </>
              ) : (
                <View style={styles.readonlyName}>
                  <Text style={styles.readonlyNameText}>{form?.name}</Text>
                  <Text style={styles.readonlyNameSub}>{form?.phone || 'No number'} · edit name/number in CRM</Text>
                </View>
              )}

              <Text style={styles.fieldLabel}>PLAN TYPE</Text>
              <View style={styles.methodRow}>
                {TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.methodPill, form?.type === t && styles.methodPillActive, webNoOutline]}
                    onPress={() => setForm((f) => {
                      if (!f) return f;
                      // Occasional delivers nothing by default (see roster logic), so a "Qty/day"
                      // of 1 is misleading there — flip the untouched default with the type, but
                      // leave it alone if the user already typed their own number.
                      const untouched = f.defaultQty === (f.type === 'Occasional' ? '0' : '1');
                      const defaultQty = untouched ? (t === 'Occasional' ? '0' : '1') : f.defaultQty;
                      return { ...f, type: t, defaultQty };
                    })}
                  >
                    <Text style={[styles.methodPillText, form?.type === t && styles.methodPillTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.helperText}>
                {form?.type === 'Daily' ? 'Goes out every day by default — mark a skip on the days they don\'t want it.' : 'Nothing by default — add them on the roster only on the days they ask.'}
              </Text>

              <Text style={styles.fieldLabel}>MEAL</Text>
              <View style={styles.methodRow}>
                {MEAL_TYPES.map((m) => (
                  <TouchableOpacity key={m} style={[styles.methodPill, form?.mealType === m && styles.methodPillActive, webNoOutline]} onPress={() => set('mealType', m)}>
                    <Text style={[styles.methodPillText, form?.mealType === m && styles.methodPillTextActive]}>{MEAL_LABEL[m]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>PAYMENT</Text>
              <View style={styles.methodRow}>
                {PAYMENT_MODES.map((p) => (
                  <TouchableOpacity key={p} style={[styles.methodPill, form?.paymentMode === p && styles.methodPillActive, webNoOutline]} onPress={() => set('paymentMode', p)}>
                    <Text style={[styles.methodPillText, form?.paymentMode === p && styles.methodPillTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.helperText}>
                {form?.paymentMode === 'Prepaid'
                  ? 'Each delivered day\'s cost comes straight out of their balance — top up below whenever they pay in advance.'
                  : 'Days served pile up and get billed (usually monthly) from the Billing tab, same as today.'}
              </Text>

              {form?.id !== null && form?.paymentMode === 'Prepaid' && (
                <View style={styles.walletRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.walletLabel}>WALLET BALANCE</Text>
                    <Text style={[styles.walletValue, (editingSub?.walletBalance ?? 0) < 0 && { color: COLORS.danger }]}>
                      {money(editingSub?.walletBalance ?? 0)}
                    </Text>
                  </View>
                  <TouchableOpacity style={[styles.addBalanceBtn, webNoOutline]} onPress={() => setRechargeId(form.id)}>
                    <Icon name="wallet-plus-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.addBalanceBtnText}>Add Balance</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TextInput style={[styles.formInput, webNoOutline]} placeholder="Plan name (e.g. Veg Thali)" placeholderTextColor={COLORS.placeholder} value={form?.planName} onChangeText={(t) => set('planName', t)} />

              <Text style={styles.fieldLabel}>RATE PER PLATE (₹) <Text style={styles.requiredStar}>*</Text></Text>
              <View style={styles.settleAmountRow}>
                <TextInput style={[styles.formInput, { flex: 2 }, webNoOutline]} placeholder="Rate per plate (₹)" placeholderTextColor={COLORS.placeholder} value={form?.rate} onChangeText={(t) => set('rate', t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
                <TextInput style={[styles.formInput, { flex: 1 }, webNoOutline]} placeholder="Qty/day" placeholderTextColor={COLORS.placeholder} value={form?.defaultQty} onChangeText={(t) => set('defaultQty', t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
              </View>

              <TextInput style={[styles.formInput, webNoOutline]} placeholder="Delivery address (optional)" placeholderTextColor={COLORS.placeholder} value={form?.deliveryAddress} onChangeText={(t) => set('deliveryAddress', t)} />
              <TextInput style={[styles.formInput, webNoOutline]} placeholder="Notes (optional)" placeholderTextColor={COLORS.placeholder} value={form?.notes} onChangeText={(t) => set('notes', t)} />

              {form?.id !== null && (
                <View style={styles.activeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activeLabel}>Active</Text>
                    <Text style={styles.helperText}>Inactive subscribers drop off the daily roster.</Text>
                  </View>
                  <Switch value={form?.isActive} onValueChange={(v) => set('isActive', v)} trackColor={{ false: COLORS.inputBorder, true: COLORS.accent }} thumbColor="#FFFFFF" />
                </View>
              )}
            </ScrollView>

            <TouchableOpacity style={[styles.settleBtn, saving && { opacity: 0.6 }, webNoOutline]} onPress={submit} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="check" size={16} color="#FFFFFF" />}
              <Text style={styles.settleBtnText}>{form?.id === null ? 'Add Subscriber' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <RechargeWalletModal
        subscriberId={rechargeId}
        name={editingSub?.name ?? ''}
        onClose={() => setRechargeId(null)}
        styles={styles}
        COLORS={COLORS}
      />
    </ScreenContainer>
  );
};

/** Top up a Prepaid subscriber's balance — amount + tender, with the running history right
 * underneath so "why is the balance what it is" (recharges and each day's deduction) is one tap
 * away instead of a separate screen. */
const RechargeWalletModal: React.FC<{
  subscriberId: number | null;
  name: string;
  onClose: () => void;
  styles: ReturnType<typeof makeStyles>;
  COLORS: ReturnType<typeof useThemeColors>;
}> = ({ subscriberId, name, onClose, styles, COLORS }) => {
  const dispatch = useDispatch();
  const { data, isLoading } = useTiffinWallet(subscriberId);
  const recharge = useRechargeTiffinWallet();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<TiffinSettleMethod>('Cash');
  const [note, setNote] = useState('');

  React.useEffect(() => { setAmount(''); setMethod('Cash'); setNote(''); }, [subscriberId]);

  const submit = async () => {
    if (!subscriberId) return;
    const amt = parseFloat(amount);
    if (!amount.trim() || isNaN(amt) || amt <= 0) {
      dispatch(showToast({ message: 'Enter an amount greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await recharge.mutateAsync({ id: subscriberId, amount: amt, method, note: note.trim() || undefined });
      dispatch(showToast({ message: `${money(amt)} added to ${name}'s balance.`, icon: 'check-circle', tone: 'success' }));
      setAmount(''); setNote('');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add the balance'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  return (
    <Modal visible={subscriberId !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]} numberOfLines={1}>{name}</Text>
              <Text style={styles.modalSubtitle}>Prepaid wallet</Text>
            </View>
            <CloseButton onPress={onClose} size={18} />
          </View>

          <View style={styles.balanceStrip}>
            <View style={{ flex: 1 }}>
              <Text style={styles.balanceLabel}>CURRENT BALANCE</Text>
              <Text style={[styles.walletBalanceValue, (data?.balance ?? 0) < 0 && { color: COLORS.danger }]}>
                {money(data?.balance ?? 0)}
              </Text>
            </View>
          </View>

          <View style={styles.settleAmountRow}>
            <TextInput
              style={[styles.formInput, { flex: 1 }, webNoOutline]}
              placeholder="Amount to add (₹)"
              placeholderTextColor={COLORS.placeholder}
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.methodRow}>
            {SETTLE_METHODS.map((m) => (
              <TouchableOpacity key={m} style={[styles.methodPill, method === m && styles.methodPillActive, webNoOutline]} onPress={() => setMethod(m)}>
                <Icon name={SETTLE_METHOD_ICON[m]} size={14} color={method === m ? '#FFFFFF' : COLORS.muted} />
                <Text style={[styles.methodPillText, method === m && styles.methodPillTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={[styles.formInput, webNoOutline]} placeholder="Note (optional)" placeholderTextColor={COLORS.placeholder} value={note} onChangeText={setNote} />

          <TouchableOpacity style={[styles.settleBtn, recharge.isPending && { opacity: 0.6 }, webNoOutline]} onPress={submit} disabled={recharge.isPending}>
            {recharge.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="wallet-plus-outline" size={16} color="#FFFFFF" />}
            <Text style={styles.settleBtnText}>Add Balance</Text>
          </TouchableOpacity>

          <Text style={[styles.fieldLabel, { marginTop: 10 }]}>HISTORY</Text>
          <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
            {isLoading && <SkeletonList rows={3} />}
            {!isLoading && (data?.transactions.length ?? 0) === 0 && (
              <Text style={styles.emptyText}>No recharges or deductions yet.</Text>
            )}
            {data?.transactions.map((t) => (
              <View key={t.id} style={styles.walletTxnRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.walletTxnLabel}>
                    {t.type === 'Recharge' ? `Top-up · ${t.method}` : `Plate · ${t.forDate ? dayLabel(t.forDate) : ''}`}
                  </Text>
                  {!!t.note && <Text style={styles.walletTxnNote} numberOfLines={1}>{t.note}</Text>}
                </View>
                <Text style={[styles.walletTxnAmount, t.amount < 0 && { color: COLORS.danger }]}>
                  {t.amount >= 0 ? '+' : ''}{money(t.amount)}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ─────────────────────────────  Billing  ─────────────────────────────

const BillingTab: React.FC<{ COLORS: ReturnType<typeof useThemeColors>; styles: ReturnType<typeof makeStyles> }> = ({ COLORS, styles }) => {
  const dispatch = useDispatch();
  const { data: settings } = useSettings();
  const [month, setMonth] = useState(() => toMonthKey(new Date()));
  const isCurrentOrPast = useMemo(() => month <= toMonthKey(new Date()), [month]);
  const { data, isLoading, isError, refetch } = useTiffinBilling(month);
  const generate = useGenerateTiffinInvoices();

  const [openInvoiceId, setOpenInvoiceId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const period = data ? { start: data.periodStart, end: data.periodEnd } : null;

  const runGenerate = async () => {
    try {
      const res = await generate.mutateAsync({ month, subscriberId: null });
      const billed = res.lines.filter((l) => l.invoiceId !== null).length;
      dispatch(showToast({ message: `${billed} ${billed === 1 ? 'bill' : 'bills'} raised for ${monthLabel(month)}.`, icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not generate bills'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  // One tap on "Collect": if the bill isn't raised yet, raise it silently first, then open the
  // settle sheet already pre-filled with the full amount — so the common "poora paisa aa gaya"
  // case is Collect → Paid & Print, no separate "raise bill" step and no "Full" click.
  const collect = async (line: TiffinBillingLine) => {
    if (line.invoiceId !== null) { setOpenInvoiceId(line.invoiceId); return; }
    setBusyId(line.subscriberId);
    try {
      const res = await generate.mutateAsync({ month, subscriberId: line.subscriberId });
      const raised = res.lines.find((l) => l.subscriberId === line.subscriberId);
      if (raised?.invoiceId != null) setOpenInvoiceId(raised.invoiceId);
      else dispatch(showToast({ message: 'Nothing to bill for this subscriber.', icon: 'alert-circle-outline', tone: 'warning' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not raise the bill'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setBusyId(null);
    }
  };

  const print = async (line: TiffinBillingLine) => {
    if (!period) return;
    setBusyId(line.subscriberId);
    try {
      const res = await printTiffinBill(settings, {
        orderNumber: `T${line.invoiceId ?? line.subscriberId}`,
        name: line.name, planName: line.planName,
        periodStart: period.start, periodEnd: period.end,
        deliveredDays: line.deliveredDays, totalQty: line.totalQty, rate: line.rate,
        total: line.amount,
      });
      dispatch(showToast({ message: res.message, icon: res.ok ? 'printer-check' : 'alert-circle-outline', tone: res.ok ? 'success' : 'danger' }));
    } finally {
      setBusyId(null);
    }
  };

  const lines = data?.lines ?? [];
  const pending = lines.filter((l) => l.invoiceId === null && l.amount > 0);
  const summary = data?.summary;

  return (
    <ScreenContainer maxWidth={900} style={{ flex: 1, width: '100%', alignSelf: 'center' }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Same one-row layout as the Roster tab's date nav + stat chips (see dateSummaryRow/
            statChipsRow there) — month arrows and both figures share a single compact row
            instead of a separate nav row followed by two full-width stacked cards. */}
        <View style={styles.dateSummaryRow}>
          <TouchableOpacity style={[styles.navArrowSmall, webNoOutline]} onPress={() => setMonth((m) => addMonthsKey(m, -1))}>
            <Icon name="chevron-left" size={13} color={COLORS.heading} />
          </TouchableOpacity>
          <View style={styles.dateNavCenterCompact}>
            <Text style={styles.dateNavText} numberOfLines={1}>{monthLabel(month)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.navArrowSmall, month >= toMonthKey(new Date()) && { opacity: 0.3 }, webNoOutline]}
            disabled={month >= toMonthKey(new Date())}
            onPress={() => setMonth((m) => addMonthsKey(m, 1))}
          >
            <Icon name="chevron-right" size={13} color={COLORS.heading} />
          </TouchableOpacity>

          {isError && !data ? null : (
            <View style={styles.statChipsRow}>
              <View style={[styles.statChip, styles.statChipAccent]}>
                <Icon name="cash-multiple" size={13} color={COLORS.muted} />
                <Text style={styles.statChipTextLight} numberOfLines={1}>
                  <Text style={styles.statChipBoldLight}>{money0(summary?.outstanding ?? 0)}</Text> due
                  {'  ·  '}collected {money0(summary?.collected ?? 0)}
                </Text>
              </View>
              <View style={[styles.statChip, styles.statChipLight]}>
                <Text style={styles.statChipTextDark} numberOfLines={1}>
                  <Text style={styles.statChipBoldDark}>{summary?.totalPlates ?? 0}</Text> plates
                  {'  ·  '}billable {money0(summary?.totalAmount ?? 0)}
                </Text>
              </View>
            </View>
          )}
        </View>

        {isError && !data ? (
          <ErrorState title="Couldn't load billing" message="Check your connection and try again." onRetry={() => refetch()} />
        ) : (
          <>
            {pending.length > 0 && (
              <TouchableOpacity style={[styles.addBtn, generate.isPending && { opacity: 0.6 }, webNoOutline]} onPress={() => runGenerate()} disabled={generate.isPending}>
                {generate.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="file-plus-outline" size={16} color="#FFFFFF" />}
                <Text style={styles.addBtnText}>Generate {pending.length} {pending.length === 1 ? 'bill' : 'bills'}</Text>
              </TouchableOpacity>
            )}

            {isLoading && <SkeletonList rows={6} />}
            {!isLoading && lines.length === 0 && (
              <Text style={styles.emptyText}>
                {isCurrentOrPast ? 'No deliveries to bill for this month yet.' : 'That month hasn\'t started — nothing to bill.'}
              </Text>
            )}

            {lines.map((l) => (
              <BillingRow key={l.subscriberId} line={l} styles={styles} COLORS={COLORS}
                onCollect={() => collect(l)}
                onPrint={() => print(l)}
                busy={busyId === l.subscriberId}
              />
            ))}
          </>
        )}
      </ScrollView>

      <SettleInvoiceModal
        invoiceId={openInvoiceId}
        onClose={() => setOpenInvoiceId(null)}
        styles={styles}
        COLORS={COLORS}
        settings={settings}
      />
    </ScreenContainer>
  );
};

const BillingRow: React.FC<{
  line: TiffinBillingLine;
  styles: ReturnType<typeof makeStyles>;
  COLORS: ReturnType<typeof useThemeColors>;
  onCollect: () => void;
  onPrint: () => void;
  busy: boolean;
}> = ({ line, styles, COLORS, onCollect, onPrint, busy }) => {
  const billed = line.invoiceId !== null;
  const outstanding = line.amount - line.invoiceAmountPaid;
  const clear = billed && line.invoiceStatus === 'Paid';
  return (
    <View style={styles.khataCard}>
      <View style={styles.avatarBox}>
        <Text style={styles.avatarText}>{line.name.trim().charAt(0).toUpperCase() || '?'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.customerName} numberOfLines={1}>{line.name}</Text>
        <Text style={styles.customerMeta} numberOfLines={1}>
          {line.deliveredDays} {line.deliveredDays === 1 ? 'day' : 'days'} · {line.totalQty} plates · {money0(line.rate)}/plate
        </Text>
        {billed && (
          <Text style={[styles.addressMeta, { color: clear ? COLORS.success : COLORS.accent }]} numberOfLines={1}>
            {clear ? 'Paid' : line.invoiceStatus === 'PartiallyPaid' ? `Part-paid · ${money0(outstanding)} left` : `Billed · ${money0(outstanding)} due`}
          </Text>
        )}
      </View>

      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[styles.outstandingText, clear && styles.clearText]}>{money0(line.amount)}</Text>
        {busy ? (
          <ActivityIndicator size="small" color={COLORS.accent} style={{ width: 40 }} />
        ) : (
          <View style={styles.rowActions}>
            {/* Reprint is available the moment a bill exists — a paid bill only shows this. */}
            {billed && (
              <TouchableOpacity style={[styles.iconBtn, webNoOutline]} onPress={onPrint}>
                <Icon name="printer-outline" size={18} color={COLORS.heading} />
              </TouchableOpacity>
            )}
            {!clear && (
              <TouchableOpacity
                style={[styles.rowActionBtn, styles.rowActionBtnPrimary, line.amount <= 0 && { opacity: 0.4 }, webNoOutline]}
                onPress={onCollect}
                disabled={line.amount <= 0}
              >
                <Text style={[styles.rowActionText, styles.rowActionTextPrimary]}>Collect</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const SettleInvoiceModal: React.FC<{
  invoiceId: number | null;
  onClose: () => void;
  styles: ReturnType<typeof makeStyles>;
  COLORS: ReturnType<typeof useThemeColors>;
  settings: any;
}> = ({ invoiceId, onClose, styles, COLORS, settings }) => {
  const dispatch = useDispatch();
  const { data, isLoading } = useTiffinInvoice(invoiceId);
  const settle = useSettleTiffinInvoice();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<TiffinSettleMethod>('Cash');
  const [note, setNote] = useState('');
  const [printing, setPrinting] = useState(false);

  const inv = data?.invoice;
  const outstanding = inv?.outstanding ?? 0;

  // Reset the tender/note when a different bill opens; pre-fill the amount to the FULL
  // outstanding as soon as it's known — the common case is paying the whole thing, so this
  // kills the "Full" tap entirely (edit the field only for a partial).
  React.useEffect(() => { setMethod('Cash'); setNote(''); }, [invoiceId]);
  React.useEffect(() => { if (outstanding > 0) setAmount(String(Math.round(outstanding * 100) / 100)); }, [invoiceId, outstanding]);

  const printBill = async () => {
    if (!inv) return;
    setPrinting(true);
    try {
      const res = await printTiffinBill(settings, {
        orderNumber: `T${inv.id}`, name: inv.name, planName: inv.planName,
        periodStart: inv.periodStart, periodEnd: inv.periodEnd,
        deliveredDays: inv.deliveredDays, totalQty: inv.totalQty, rate: inv.rate,
        total: inv.totalAmount,
      });
      dispatch(showToast({ message: res.message, icon: res.ok ? 'printer-check' : 'alert-circle-outline', tone: res.ok ? 'success' : 'danger' }));
    } finally {
      setPrinting(false);
    }
  };

  const submit = async (thenPrint: boolean) => {
    if (!invoiceId) return;
    const amt = parseFloat(amount);
    if (!amount.trim() || isNaN(amt) || amt <= 0) {
      dispatch(showToast({ message: 'Enter an amount greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (amt - outstanding > 0.005) {
      dispatch(showToast({ message: `That's more than the ${money(outstanding)} outstanding.`, icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      const res = await settle.mutateAsync({ id: invoiceId, amount: amt, method, note: note.trim() || undefined });
      const left = res.invoice.outstanding;
      dispatch(showToast({
        message: left > 0.005 ? `${money(amt)} received — ${money(left)} still due.` : `${money(amt)} received — bill cleared.`,
        icon: 'check-circle', tone: 'success',
      }));
      setNote('');
      if (thenPrint) await printBill();
      if (left <= 0.005) onClose();
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not record the payment'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  return (
    <Modal visible={invoiceId !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]} numberOfLines={1}>{inv?.name ?? ''}</Text>
              <Text style={styles.modalSubtitle}>
                {inv ? `${inv.planName} · ${inv.deliveredDays} days · ${inv.totalQty} plates` : ''}
              </Text>
            </View>
            <CloseButton onPress={onClose} size={18} />
          </View>

          <View style={styles.balanceStrip}>
            <View style={{ flex: 1 }}>
              <Text style={styles.balanceLabel}>OUTSTANDING</Text>
              <Text style={styles.balanceValue}>{money(outstanding)}</Text>
            </View>
            <View style={styles.balanceSideCol}>
              <Text style={styles.balanceSideLabel}>Bill</Text>
              <Text style={styles.balanceSideValue}>{money(inv?.totalAmount ?? 0)}</Text>
            </View>
            <View style={styles.balanceSideCol}>
              <Text style={styles.balanceSideLabel}>Paid</Text>
              <Text style={styles.balanceSideValue}>{money(inv?.amountPaid ?? 0)}</Text>
            </View>
          </View>

          {outstanding > 0.005 && (
            <>
              <View style={styles.settleAmountRow}>
                <TextInput
                  style={[styles.formInput, { flex: 1 }, webNoOutline]}
                  placeholder={`Amount received (up to ${money(outstanding)})`}
                  placeholderTextColor={COLORS.placeholder}
                  value={amount}
                  onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity style={[styles.fullBtn, webNoOutline]} onPress={() => setAmount(outstanding.toFixed(2))}>
                  <Text style={styles.fullBtnText}>Full</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.methodRow}>
                {SETTLE_METHODS.map((m) => (
                  <TouchableOpacity key={m} style={[styles.methodPill, method === m && styles.methodPillActive, webNoOutline]} onPress={() => setMethod(m)}>
                    <Icon name={SETTLE_METHOD_ICON[m]} size={14} color={method === m ? '#FFFFFF' : COLORS.muted} />
                    <Text style={[styles.methodPillText, method === m && styles.methodPillTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={[styles.formInput, webNoOutline]} placeholder="Note (optional)" placeholderTextColor={COLORS.placeholder} value={note} onChangeText={setNote} />
              <View style={styles.settleBtnRow}>
                <TouchableOpacity style={[styles.settleBtn, { flex: 1 }, (settle.isPending || printing) && { opacity: 0.6 }, webNoOutline]} onPress={() => submit(true)} disabled={settle.isPending || printing}>
                  {settle.isPending || printing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="printer-check" size={16} color="#FFFFFF" />}
                  <Text style={styles.settleBtnText}>Paid & Print</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.settleBtnGhost, webNoOutline]} onPress={() => submit(false)} disabled={settle.isPending || printing}>
                  <Text style={styles.settleBtnGhostText}>Just record</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {outstanding <= 0.005 && !isLoading && (
            <TouchableOpacity style={[styles.settleBtn, printing && { opacity: 0.6 }, webNoOutline]} onPress={() => printBill()} disabled={printing}>
              {printing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="printer-outline" size={16} color="#FFFFFF" />}
              <Text style={styles.settleBtnText}>Print receipt</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.ledgerHeading}>PAYMENTS</Text>
          <ScrollView style={styles.ledgerScroll} showsVerticalScrollIndicator={false}>
            {isLoading && !data && <SkeletonList rows={2} />}
            {data?.payments.map((p) => (
              <View key={p.id} style={styles.ledgerRow}>
                <Icon name="arrow-bottom-left" size={15} color={COLORS.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.ledgerTitle}>Paid back · {p.method}</Text>
                  <Text style={styles.ledgerMeta} numberOfLines={1}>
                    {new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {p.recordedByName}{p.note ? ` · ${p.note}` : ''}
                  </Text>
                </View>
                <Text style={[styles.ledgerAmount, styles.positive]}>−{money(p.amount)}</Text>
              </View>
            ))}
            {!isLoading && data?.payments.length === 0 && <Text style={styles.emptyText}>No payments yet.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7.5, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 9 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },

  // Inline in the header row now (next to the "Tiffin" title), not a full-width row of its
  // own — so pills size to their content instead of the old flex:1-per-pill layout.
  headerTabRow: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  tabPillCompact: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: COLORS.inputBorder,
  },
  // Mobile header pill — icon only, square, so 3 of them fit next to the back button/icon/title.
  tabPillIconOnly: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8,
    backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: COLORS.inputBorder,
  },
  tabPillActive: { backgroundColor: COLORS.button, borderColor: COLORS.button },
  tabPillText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  tabPillTextActive: { color: '#FFFFFF' },

  // Compact day pill in the screen header (desktop right-slot / mobile header row) — this is
  // the Roster tab's actual date control now; the old in-body arrows scrolled away with the
  // list, which is the whole reason it moved up here.
  headerDateNav: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerDateBtn: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  headerDateText: { fontSize: isDesktopWeb ? 12.5 : 11.5, fontWeight: '700', color: COLORS.heading, minWidth: isDesktopWeb ? 68 : 56, textAlign: 'center' },

  dateNavText: { fontSize: isDesktopWeb ? 11 : 10.5, fontWeight: '800', color: COLORS.heading },

  // Billing tab's month nav + both summary figures share one row (see dateSummaryRow below) —
  // smaller arrows and a content-sized (not flex:1) date block so the two flex:1 cards get
  // most of the width. flexWrap is the safety net if a very narrow screen can't fit all five.
  dateSummaryRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: isDesktopWeb ? 6 : 4,
    paddingHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 8 : 8,
  },
  navArrowSmall: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: COLORS.inputBorder },
  dateNavCenterCompact: { alignItems: 'center', minWidth: isDesktopWeb ? 82 : 56 },
  // One-line pills, not stacked cards — sized to their own text (no fixed width, no forced
  // wrapping), so they sit at the same height as the arrows/tab pills beside them instead of
  // looming over the row or wrapping mid-word when space is tight. flexWrap on the row is the
  // safety net on a narrow phone: a chip drops to its own line as a whole unit, never mid-text.
  statChipsRow: { flexDirection: 'row', flexWrap: 'wrap', flexShrink: 1, gap: isDesktopWeb ? 8 : 6 },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 8, paddingHorizontal: isDesktopWeb ? 12 : 10, height: isDesktopWeb ? 32 : 32,
  },
  // Both chips share the exact same look now — a dark chip next to a light one read as
  // "active vs inactive" even though both are just plain info readouts, not a status pair.
  statChipAccent: { backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: COLORS.inputBorder },
  statChipLight: { backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: COLORS.inputBorder },
  statChipTextLight: { fontSize: isDesktopWeb ? 12.5 : 11.5, color: COLORS.heading, fontWeight: '600' },
  statChipBoldLight: { fontWeight: '800', color: COLORS.heading },
  statChipTextDark: { fontSize: isDesktopWeb ? 12.5 : 11.5, color: COLORS.heading, fontWeight: '600' },
  statChipBoldDark: { fontWeight: '800', color: COLORS.heading },

  summaryRow: { flexDirection: 'row', gap: isDesktopWeb ? 8 : 9, paddingHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 11 : 12 },
  summaryCard: { flex: 1, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: 12 },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginBottom: 4.5 },
  summaryValue: { fontSize: isDesktopWeb ? 20 : 15, fontWeight: 'bold', color: COLORS.heading },
  summarySmall: { fontSize: 11, color: COLORS.muted, marginTop: 3 },
  breakdownText: { fontSize: 12.5, fontWeight: '700', color: COLORS.heading, marginTop: 2 },
  // Softer, evenly-weighted tones (not COLORS.success/danger) — these dots are just a veg/non-veg
  // category marker, not a status signal, so neither should read as "good" vs "error".
  vegDot: { color: '#7FAE8C' },
  nonVegDot: { color: '#C98A83' },
  accentCard: { backgroundColor: COLORS.button },
  accentLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5, marginBottom: 4.5 },
  accentValue: { fontSize: isDesktopWeb ? 22 : 18, fontWeight: 'bold', color: '#FFFFFF' },
  accentSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  futureNote: { fontSize: 11.5, color: COLORS.muted, fontStyle: 'italic', paddingHorizontal: isDesktopWeb ? 16 : 12, marginBottom: 10 },

  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: isDesktopWeb ? 16 : 12, marginBottom: 10 },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.cardAlt, borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder,
    paddingHorizontal: 10, height: 36,
  },
  searchInput: { flex: 1, fontSize: 12.5, color: COLORS.heading },
  togglePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 36, borderRadius: 8, backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: COLORS.inputBorder },
  togglePillActive: { backgroundColor: COLORS.button, borderColor: COLORS.button },
  togglePillText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  togglePillTextActive: { color: '#FFFFFF' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: 11, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.button,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  emptyText: { textAlign: 'center', color: COLORS.muted, marginTop: 15, paddingHorizontal: 24, fontSize: 12.5, lineHeight: 18 },

  rosterCard: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 6, padding: isDesktopWeb ? 4 : 3.5, marginBottom: 3,
  },
  rosterCardOff: { opacity: 0.55 },
  mealDot: { width: 8, height: 8, borderRadius: 4 },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.cardAlt, borderRadius: 6, borderWidth: 1, borderColor: COLORS.inputBorder, paddingHorizontal: 2, height: 24 },
  qtyStepperOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  qtyBtn: { width: 19, height: 22, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 12, fontWeight: '800', minWidth: 12, textAlign: 'center' },
  qtyTextOn: { color: '#FFFFFF' },
  qtyTextOff: { color: COLORS.muted },

  khataCard: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 6, padding: 4.5, marginBottom: 3.5,
  },
  avatarBox: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.aiCardBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontWeight: '800', color: COLORS.heading },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  // On a tablet/desktop browser, name + its detail line sit side by side on one row instead of
  // stacking — there's width to spare there, and it reads faster without a forced second line.
  // Mobile keeps the stacked layout (column), where that width doesn't exist.
  nameMetaWrap: {
    flex: 1, flexDirection: isDesktopWeb ? 'row' : 'column',
    alignItems: isDesktopWeb ? 'baseline' : 'flex-start', gap: isDesktopWeb ? 6 : 0,
  },
  customerName: { fontSize: isDesktopWeb ? 12 : 12, fontWeight: 'bold', color: COLORS.heading, flexShrink: isDesktopWeb ? 0 : 1 },
  customerMeta: { fontSize: isDesktopWeb ? 12 : 11.5, color: COLORS.muted, marginTop: isDesktopWeb ? 0 : 0.5, flexShrink: 1 },
  addressMeta: { fontSize: 11, color: COLORS.muted, marginTop: 0.5 },
  outstandingText: { fontSize: isDesktopWeb ? 15 : 13, fontWeight: '800', color: COLORS.dangerAccent },
  clearText: { color: COLORS.success },

  typeTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  typeTagDaily: { backgroundColor: COLORS.successBg },
  typeTagOcc: { backgroundColor: COLORS.warningBg },
  typeTagText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  typeTagTextDaily: { color: COLORS.success },
  typeTagTextOcc: { color: COLORS.warning },

  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { width: 34, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: COLORS.cardAlt },
  rowActionBtn: { paddingHorizontal: 14, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: COLORS.cardAlt },
  rowActionBtnPrimary: { backgroundColor: COLORS.button, borderColor: COLORS.button },
  rowActionText: { fontSize: 12, fontWeight: '800', color: COLORS.heading },
  rowActionTextPrimary: { color: '#FFFFFF' },

  // ── modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  modalSheet: { width: '100%', maxWidth: 460, maxHeight: '88%', backgroundColor: COLORS.background, borderRadius: 12, padding: 12, gap: 7 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: 'bold', color: COLORS.heading, flexShrink: 1 },
  modalSubtitle: { fontSize: 12, color: COLORS.muted, marginTop: 1 },

  readonlyName: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: COLORS.inputBorder },
  readonlyNameText: { fontSize: 14, fontWeight: '800', color: COLORS.heading },
  readonlyNameSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },

  fieldLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginTop: 2 },
  requiredStar: { color: COLORS.danger },
  helperText: { fontSize: 11, color: COLORS.muted, lineHeight: 15 },

  balanceStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: 11 },
  balanceLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 },
  balanceValue: { fontSize: 19, fontWeight: '800', color: COLORS.dangerAccent, marginTop: 2 },
  balanceSideCol: { alignItems: 'flex-end' },
  balanceSideLabel: { fontSize: 10, color: COLORS.muted },
  balanceSideValue: { fontSize: 12.5, fontWeight: '700', color: COLORS.heading, marginTop: 2 },

  settleAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  formInput: { backgroundColor: COLORS.cardAlt, borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder, paddingHorizontal: 10, height: 36, fontSize: 12.5, color: COLORS.heading },
  fullBtn: { paddingHorizontal: 12, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: COLORS.cardAlt },
  fullBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.heading },
  methodRow: { flexDirection: 'row', gap: 6 },
  methodPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: COLORS.inputBorder },
  methodPillActive: { backgroundColor: COLORS.button, borderColor: COLORS.button },
  methodPillText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  methodPillTextActive: { color: '#FFFFFF' },
  settleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.button },
  settleBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  settleBtnRow: { flexDirection: 'row', gap: 6 },
  settleBtnGhost: { paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: COLORS.cardAlt },
  settleBtnGhostText: { fontSize: 12.5, fontWeight: '700', color: COLORS.heading },

  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: 11, borderWidth: 1, borderColor: COLORS.inputBorder },
  activeLabel: { fontSize: 13, fontWeight: '700', color: COLORS.heading },

  walletRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: 11, borderWidth: 1, borderColor: COLORS.inputBorder },
  walletLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 },
  walletValue: { fontSize: 17, fontWeight: '800', color: COLORS.heading, marginTop: 2 },
  addBalanceBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 34, borderRadius: 8, backgroundColor: COLORS.button },
  addBalanceBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  // RechargeWalletModal's balance strip — neutral/heading by default (a healthy positive
  // balance shouldn't read as an alarm the way an invoice's outstanding balanceValue does).
  walletBalanceValue: { fontSize: 19, fontWeight: '800', color: COLORS.heading, marginTop: 2 },
  // SubscriberCard's small badge next to the chevron, Prepaid subscribers only.
  walletBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginRight: 4 },
  walletBadgeText: { fontSize: 11.5, fontWeight: '800' },
  // RosterCard's nudge when a Prepaid subscriber's balance has gone negative — still delivers,
  // just flags that a top-up is due.
  lowBalanceTag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  lowBalanceTagText: { fontSize: 10.5, fontWeight: '700', color: COLORS.danger },
  // RechargeWalletModal's transaction history rows.
  walletTxnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  walletTxnLabel: { fontSize: 12.5, fontWeight: '700', color: COLORS.heading },
  walletTxnNote: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  walletTxnAmount: { fontSize: 12.5, fontWeight: '800', color: COLORS.success },

  ledgerHeading: { fontSize: 11, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginTop: 4 },
  ledgerScroll: { maxHeight: 180 },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  ledgerTitle: { fontSize: 12.5, fontWeight: '700', color: COLORS.heading },
  ledgerMeta: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  ledgerAmount: { fontSize: 12.5, fontWeight: '800' },
  positive: { color: COLORS.success },
});
