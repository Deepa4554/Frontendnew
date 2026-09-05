import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { confirmAlert } from '../../../../../shared/components/ConfirmDialogHost';
import {
  useCafeExpenses, useAddCafeExpense, useRemoveCafeExpense,
  useDailyPurchaseSheet, useSaveDailyPurchaseSheet, useAddPurchaseListItem, useRemovePurchaseListItem,
} from '../../../../../core/api/hooks/useExpenses';
import { CafeExpense, ExpenseCategory, PaymentMode, UNSET_PAYMENT_MODE } from '../../../../../core/api/expensesApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { ScreenContainer } from '../../../../../core/components/ScreenContainer';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;
const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Date maths for the daily sheet, all done on yyyy-MM-dd strings. Every helper below stays
// inside UTC or inside local parts and never crosses between the two: `new Date('2026-08-14')`
// followed by toISOString() lands on the 13th for anyone east of UTC, which for an IST-only
// product would silently file every sheet against the wrong day.
const shiftDay = (isoDate: string, days: number) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};
/** Today's IST calendar date: shift the epoch by +5:30, then read the UTC parts. */
const todayIst = () => new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
const prettyDate = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const CATEGORIES: ExpenseCategory[] = ['Rent', 'Salaries', 'Utilities', 'Maintenance', 'Supplies', 'Marketing', 'Other'];
const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  Rent: 'home-city-outline',
  Salaries: 'account-cash-outline',
  Utilities: 'flash-outline',
  Maintenance: 'wrench-outline',
  Supplies: 'package-variant-closed',
  Marketing: 'bullhorn-outline',
  Other: 'dots-horizontal-circle-outline',
};

const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Card', 'Due'];
const PAYMENT_MODE_ICON: Record<PaymentMode, string> = {
  Cash: 'cash',
  UPI: 'qrcode-scan',
  Card: 'credit-card-outline',
  // Same notebook the POS uses for its own Due tender (PaymentMethodPicker.METHOD_ICON) —
  // different direction of credit, but staff read the icon as "udhaar" either way.
  Due: 'notebook-outline',
};

/** The mode a row is filtered and totalled under. Rows saved before the field existed have
 * none, and are shown as their own bucket rather than being read as Cash. */
const modeOf = (e: CafeExpense) => e.paymentMode ?? UNSET_PAYMENT_MODE;

/** The GST slabs a cafe's own purchases realistically arrive at, plus "not known" — which is
 * FIRST because it's the honest default: most small cash purchases come with no usable bill,
 * and a screen that pre-picks 5% would quietly manufacture credit nobody is entitled to. */
const GST_RATE_CHOICES: (number | null)[] = [null, 0, 5, 12, 18, 28];
const ALL_MODES = 'All';
const MODE_FILTER_ICON: Record<string, string> = {
  [ALL_MODES]: 'filter-variant',
  ...PAYMENT_MODE_ICON,
  [UNSET_PAYMENT_MODE]: 'help-circle-outline',
};

const DATE_FILTERS = ['all', 'today', 'yesterday', 'week', 'month'] as const;
type DateFilterKey = (typeof DATE_FILTERS)[number];
const DATE_FILTER_LABEL: Record<DateFilterKey, string> = {
  all: 'All Time', today: 'Today', yesterday: 'Yesterday', week: 'This Week', month: 'This Month',
};
const DATE_FILTER_ICON: Record<DateFilterKey, string> = {
  all: 'calendar-blank', today: 'calendar-today', yesterday: 'calendar-arrow-left',
  week: 'calendar-week', month: 'calendar-month',
};

export const CafeExpensesScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useCafeExpenses();
  const addExpense = useAddCafeExpense();
  const removeExpense = useRemoveCafeExpense();

  const [modalVisible, setModalVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Rent');
  const [purpose, setPurpose] = useState('');
  const [spentBy, setSpentBy] = useState('');
  const [expenseMode, setExpenseMode] = useState<PaymentMode>('Cash');
  // null = "rate not recorded", which is the default and a real answer of its own — most cash
  // purchases come with no usable bill. Only a picked rate feeds the input-tax credit.
  const [gstRate, setGstRate] = useState<number | null>(null);

  // Which payment mode the history list below is narrowed to; ALL_MODES = no filter.
  const [modeFilter, setModeFilter] = useState<string>(ALL_MODES);
  // Which day/range the history list is narrowed to; 'all' = no filter.
  const [dateFilter, setDateFilter] = useState<DateFilterKey>('all');

  // ---------- Daily purchase list ----------
  // Daily opens first on purpose: filling the day's sheet is the recurring job, while the
  // All tab (totals, history, one-off costs) is what you come to occasionally.
  const [tab, setTab] = useState<'daily' | 'all'>('daily');
  // undefined = "today", resolved server-side in IST so the client's clock can't pick the
  // wrong day; navigation below works off the date the server actually returned.
  const [sheetDate, setSheetDate] = useState<string | undefined>(undefined);
  const { data: sheet, isLoading: sheetLoading, isError: sheetError, refetch: refetchSheet } = useDailyPurchaseSheet(sheetDate);
  const saveSheet = useSaveDailyPurchaseSheet();
  const addListItem = useAddPurchaseListItem();
  const removeListItem = useRemovePurchaseListItem();

  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [paymentModes, setPaymentModes] = useState<Record<number, PaymentMode>>({});
  const loadedDateRef = useRef<string | null>(null);

  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<ExpenseCategory>('Supplies');

  // The small centered "enter amount" popup — draft fields so Cancel doesn't touch
  // `amounts`/`paymentModes` until Save is actually pressed.
  const [entryItem, setEntryItem] = useState<{ itemId: number; name: string } | null>(null);
  const [entryAmount, setEntryAmount] = useState('');
  const [entryMode, setEntryMode] = useState<PaymentMode>('Cash');

  // Seeds the inputs from the server, but keeps whatever is already typed for a row we've
  // seen before — otherwise adding a row (which refetches the sheet) would wipe every
  // amount entered so far. A date change is the one case that resets everything.
  useEffect(() => {
    if (!sheet) return;
    const isNewDay = loadedDateRef.current !== sheet.date;
    loadedDateRef.current = sheet.date;
    setAmounts((prev) => {
      const next: Record<number, string> = {};
      for (const line of sheet.lines) {
        const typed = isNewDay ? undefined : prev[line.itemId];
        next[line.itemId] = typed !== undefined ? typed : line.amount > 0 ? String(line.amount) : '';
      }
      return next;
    });
    setPaymentModes((prev) => {
      const next: Record<number, PaymentMode> = {};
      for (const line of sheet.lines) {
        const picked = isNewDay ? undefined : prev[line.itemId];
        next[line.itemId] = picked ?? line.paymentMode ?? 'Cash';
      }
      return next;
    });
  }, [sheet]);

  const openEntry = (line: { itemId: number; name: string }) => {
    setEntryAmount(amounts[line.itemId] ?? '');
    setEntryMode(paymentModes[line.itemId] ?? 'Cash');
    setEntryItem(line);
  };

  const saveEntry = () => {
    if (!entryItem) return;
    setAmounts((prev) => ({ ...prev, [entryItem.itemId]: entryAmount.replace(/[^0-9.]/g, '') }));
    setPaymentModes((prev) => ({ ...prev, [entryItem.itemId]: entryMode }));
    setEntryItem(null);
  };

  // The day the arrows step from. Reads sheetDate first, not sheet.date: changing the date
  // swaps the query key, so `sheet` is undefined until the new day loads — stepping off
  // sheet.date would make a quick second tap jump back to today instead of continuing.
  const activeDate = sheetDate ?? sheet?.date ?? todayIst();

  const dailyTotal = Object.values(amounts).reduce((sum, raw) => {
    const n = parseFloat(raw);
    return Number.isNaN(n) ? sum : sum + n;
  }, 0);

  const filledCount = Object.values(amounts).filter((raw) => {
    const n = parseFloat(raw);
    return !Number.isNaN(n) && n > 0;
  }).length;

  const saveDailySheet = async () => {
    if (!sheet) return;
    const lines = Object.entries(amounts)
      .map(([itemId, raw]) => ({ itemId: Number(itemId), amount: parseFloat(raw), paymentMode: paymentModes[Number(itemId)] }))
      .filter((l) => !Number.isNaN(l.amount) && l.amount > 0);
    try {
      await saveSheet.mutateAsync({ date: sheet.date, lines });
      dispatch(showToast({
        message: lines.length ? `Saved ${lines.length} ${lines.length === 1 ? 'row' : 'rows'}.` : 'Sheet cleared.',
        icon: 'check-circle',
        tone: 'success',
      }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save the sheet'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const submitNewItem = async () => {
    if (!newItemName.trim()) {
      dispatch(showToast({ message: 'Enter a name for the row.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await addListItem.mutateAsync({ name: newItemName.trim(), defaultCategory: newItemCategory });
      setItemModalVisible(false);
      setNewItemName('');
      setNewItemCategory('Supplies');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add the row'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const confirmRemoveItem = (itemId: number, name: string) => {
    confirmAlert('Remove row', `Take "${name}" off the daily list? Expenses already saved against it are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeListItem.mutateAsync(itemId);
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not remove the row'), icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  // Chips are built from the modes actually present, so tapping one never lands on an empty
  // list. The active filter is kept on the end regardless: deleting the last UPI row would
  // otherwise take the UPI chip away while the list stayed filtered to it, with nothing left
  // to tap to get back.
  const modeChips = useMemo(() => {
    const present = new Set((data?.recent ?? []).map(modeOf));
    const chips: string[] = [ALL_MODES, ...PAYMENT_MODES.filter((m) => present.has(m))];
    if (present.has(UNSET_PAYMENT_MODE)) chips.push(UNSET_PAYMENT_MODE);
    if (!chips.includes(modeFilter)) chips.push(modeFilter);
    return chips;
  }, [data?.recent, modeFilter]);

  // spentAt is a UTC instant; every comparison below happens on its IST calendar date so
  // "Today" matches what the till clock (and todayIst()) call today, not a UTC day that can
  // still be yesterday evening in IST.
  const matchesDateFilter = (spentAt: string, filter: DateFilterKey) => {
    if (filter === 'all') return true;
    const spentIst = new Date(new Date(spentAt).getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
    const today = todayIst();
    if (filter === 'today') return spentIst === today;
    if (filter === 'yesterday') return spentIst === shiftDay(today, -1);
    if (filter === 'week') return spentIst >= shiftDay(today, -6) && spentIst <= today;
    return spentIst.slice(0, 7) === today.slice(0, 7); // month
  };

  const visibleExpenses = (data?.recent ?? [])
    .filter((e) => modeFilter === ALL_MODES || modeOf(e) === modeFilter)
    .filter((e) => matchesDateFilter(e.spentAt, dateFilter));
  // All-time for the picked mode, not this month's — it's the total of exactly what's listed
  // underneath, so the two can't disagree.
  const visibleTotal = visibleExpenses.reduce((sum, e) => sum + e.amount, 0);

  const openModal = () => {
    setAmount('');
    setCategory('Rent');
    setPurpose('');
    setSpentBy('');
    setExpenseMode('Cash');
    setModalVisible(true);
  };

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amount.trim() || isNaN(amt) || amt <= 0) {
      dispatch(showToast({ message: 'Enter an amount greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (!purpose.trim()) {
      dispatch(showToast({ message: 'Enter what this expense was for.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (!spentBy.trim()) {
      dispatch(showToast({ message: 'Enter who this was spent by.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      const result = await addExpense.mutateAsync({
        amount: amt, category, purpose: purpose.trim(), spentBy: spentBy.trim(), paymentMode: expenseMode,
        // Omitted rather than sent as 0 when nothing was picked: "not recorded" and "0% rated"
        // are different answers to whoever claims the credit (see CafeExpense.TaxRatePct).
        ...(gstRate === null ? {} : { taxRatePct: gstRate }),
      });
      setModalVisible(false);
      setGstRate(null);
      // Above ApprovalThresholds.ExpenseAmount, the backend holds this as a pending
      // ApprovalRequest for the Owner instead of recording it — nothing's on the books yet.
      if ('pendingApproval' in result) {
        dispatch(showToast({ message: result.message, icon: 'clock-outline', tone: 'info' }));
      } else {
        dispatch(showToast({ message: 'Expense added.', icon: 'check-circle', tone: 'success' }));
      }
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add expense'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const confirmDelete = (id: number, purposeLabel: string) => {
    confirmAlert('Delete expense', `Remove "${purposeLabel}" from the ledger? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeExpense.mutateAsync(id);
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not delete expense'), icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="cash-minus" title="Expenses" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="cash-minus" size={22} color={COLORS.accent} />
          <Text style={styles.headerTitle}>Expenses</Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      <ScreenContainer maxWidth={900} style={{ flex: 1, width: '100%', alignSelf: 'center' }}>
      <View style={styles.tabRow}>
        {(['daily', 'all'] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
            <Icon
              name={t === 'daily' ? 'clipboard-list-outline' : 'format-list-bulleted'}
              size={14}
              color={tab === t ? '#FFFFFF' : COLORS.muted}
            />
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'daily' ? 'Daily' : 'All Expenses'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {tab === 'daily' ? (
          sheetError && !sheet ? (
            <ErrorState
              title="Couldn't load the sheet"
              message="Check your connection and try again."
              onRetry={() => refetchSheet()}
            />
          ) : (
            <>
              <View style={styles.dateRow}>
                <TouchableOpacity style={styles.dateNavBtn} onPress={() => setSheetDate(shiftDay(activeDate, -1))}>
                  <Icon name="chevron-left" size={18} color={COLORS.heading} />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={styles.dateText}>{prettyDate(activeDate)}</Text>
                  {activeDate === todayIst() && <Text style={styles.dateTodayTag}>TODAY</Text>}
                </View>
                <TouchableOpacity
                  style={[styles.dateNavBtn, activeDate >= todayIst() && styles.dateNavBtnDisabled]}
                  disabled={activeDate >= todayIst()}
                  onPress={() => setSheetDate(shiftDay(activeDate, 1))}
                >
                  <Icon name="chevron-right" size={18} color={COLORS.heading} />
                </TouchableOpacity>
              </View>

              {sheetLoading && !sheet && <SkeletonList rows={8} />}

              {!!sheet && sheet.lines.length === 0 && (
                <Text style={styles.emptyText}>No rows yet — add the things you buy against each day.</Text>
              )}

              {sheet?.lines.map((line) => {
                const raw = amounts[line.itemId] ?? '';
                const amt = parseFloat(raw);
                const hasAmount = !Number.isNaN(amt) && amt > 0;
                const mode = paymentModes[line.itemId] ?? 'Cash';
                return (
                  <View key={line.itemId} style={styles.dailyRow}>
                    <Text style={styles.dailyName} numberOfLines={1}>{line.name}</Text>
                    <TouchableOpacity
                      style={[styles.dailyAmountBtn, hasAmount && styles.dailyAmountBtnFilled, webNoOutline]}
                      onPress={() => openEntry(line)}
                    >
                      {hasAmount ? (
                        <>
                          <Icon name={PAYMENT_MODE_ICON[mode]} size={13} color={COLORS.muted} />
                          <Text style={styles.dailyAmountText}>₹{raw}</Text>
                        </>
                      ) : (
                        <Text style={styles.dailyAmountPlaceholder}>Enter amount</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => confirmRemoveItem(line.itemId, line.name)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Icon name="close" size={14} color={COLORS.muted} />
                    </TouchableOpacity>
                  </View>
                );
              })}

              <TouchableOpacity style={styles.addRowBtn} onPress={() => setItemModalVisible(true)}>
                <Icon name="plus" size={14} color={COLORS.accent} />
                <Text style={styles.addRowText}>Add row</Text>
              </TouchableOpacity>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TOTAL PURCHASE</Text>
                <Text style={styles.totalValue}>{money(dailyTotal)}</Text>
              </View>

              <TouchableOpacity style={styles.addBtn} onPress={saveDailySheet} disabled={saveSheet.isPending || !sheet}>
                {saveSheet.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                  <>
                    <Icon name="content-save-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.addBtnText}>
                      {filledCount > 0 ? `Save ${filledCount} ${filledCount === 1 ? 'row' : 'rows'}` : 'Save sheet'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )
        ) : isError && !data ? (
          <ErrorState
            title="Couldn't load expenses"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : (
        <>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>ALL TIME</Text>
            <Text style={styles.summaryValue}>{money(data?.totalAllTime ?? 0)}</Text>
          </View>
          <View style={[styles.summaryCard, styles.accentCard]}>
            <Text style={styles.accentLabel}>THIS MONTH</Text>
            <Text style={styles.accentValue}>{money(data?.totalThisMonth ?? 0)}</Text>
          </View>
        </View>

        {!!data?.byCategoryThisMonth.length && (
          <View style={styles.categoryCard}>
            <Text style={styles.sectionTitle}>THIS MONTH BY CATEGORY</Text>
            {data.byCategoryThisMonth.map((c) => (
              <View key={c.category} style={styles.categoryRow}>
                <Icon name={CATEGORY_ICONS[c.category as ExpenseCategory] ?? 'circle'} size={16} color={COLORS.accent} />
                <Text style={styles.categoryName}>{c.category}</Text>
                <Text style={styles.categoryAmount}>{money(c.total)}</Text>
              </View>
            ))}
          </View>
        )}

        {!!data?.byPaymentModeThisMonth.length && (
          <View style={styles.categoryCard}>
            <Text style={styles.sectionTitle}>THIS MONTH BY PAYMENT MODE</Text>
            {data.byPaymentModeThisMonth.map((m) => (
              <View key={m.mode} style={styles.categoryRow}>
                <Icon name={MODE_FILTER_ICON[m.mode] ?? 'circle'} size={16} color={COLORS.accent} />
                <Text style={styles.categoryName}>{m.mode}</Text>
                <Text style={styles.categoryAmount}>{money(m.total)}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.addBtn} onPress={openModal}>
          <Icon name="plus" size={16} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Expense</Text>
        </TouchableOpacity>

        <View style={styles.listHeaderRow}>
          <Text style={[styles.sectionTitle, styles.listHeaderTitle]}>
            {modeFilter === ALL_MODES ? 'ALL EXPENSES' : `${modeFilter.toUpperCase()} EXPENSES`}
            {dateFilter !== 'all' ? ` · ${DATE_FILTER_LABEL[dateFilter].toUpperCase()}` : ''}
          </Text>
          {!isLoading && visibleExpenses.length > 0 && (
            <Text style={styles.listHeaderTotal}>{money(visibleTotal)}</Text>
          )}
        </View>

        {!isLoading && modeChips.length > 1 && (
          <View style={styles.modeFilterRow}>
            {modeChips.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.paymentModePill, styles.modeFilterPill, modeFilter === m && styles.paymentModePillActive]}
                onPress={() => setModeFilter(m)}
              >
                <Icon name={MODE_FILTER_ICON[m] ?? 'circle'} size={13} color={modeFilter === m ? '#FFFFFF' : COLORS.muted} />
                <Text style={[styles.paymentModePillText, modeFilter === m && styles.paymentModePillTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!isLoading && (data?.recent.length ?? 0) > 0 && (
          <View style={styles.modeFilterRow}>
            {DATE_FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.paymentModePill, styles.modeFilterPill, dateFilter === f && styles.paymentModePillActive]}
                onPress={() => setDateFilter(f)}
              >
                <Icon name={DATE_FILTER_ICON[f]} size={13} color={dateFilter === f ? '#FFFFFF' : COLORS.muted} />
                <Text style={[styles.paymentModePillText, dateFilter === f && styles.paymentModePillTextActive]}>{DATE_FILTER_LABEL[f]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {isLoading && <SkeletonList rows={6} />}
        {!isLoading && (data?.recent.length ?? 0) === 0 && <Text style={styles.emptyText}>No expenses logged yet.</Text>}
        {!isLoading && (data?.recent.length ?? 0) > 0 && visibleExpenses.length === 0 && (
          <Text style={styles.emptyText}>
            {modeFilter === ALL_MODES && dateFilter === 'all' ? 'No expenses match.'
              : modeFilter === ALL_MODES ? `Nothing logged ${DATE_FILTER_LABEL[dateFilter].toLowerCase()}.`
              : dateFilter === 'all' ? `Nothing paid by ${modeFilter} yet.`
              : `Nothing paid by ${modeFilter} ${DATE_FILTER_LABEL[dateFilter].toLowerCase()}.`}
          </Text>
        )}

        {visibleExpenses.map((e) => (
          <View key={e.id} style={styles.expenseCard}>
            <View style={styles.expenseIconBox}>
              <Icon name={CATEGORY_ICONS[e.category] ?? 'circle'} size={18} color={COLORS.heading} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.expenseTopRow}>
                <Text style={styles.expensePurpose} numberOfLines={1}>{e.purpose}</Text>
                <Text style={styles.expenseAmount}>{money(e.amount)}</Text>
              </View>
              <Text style={styles.expenseMeta}>
                {e.category} · {modeOf(e)} · By {e.spentBy} · {new Date(e.spentAt).toLocaleDateString()}
              </Text>
            </View>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => confirmDelete(e.id, e.purpose)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="trash-can-outline" size={16} color={COLORS.dangerAccent} />
            </TouchableOpacity>
          </View>
        ))}
        </>
        )}
      </ScrollView>
      </ScreenContainer>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Add Expense</Text>
              <CloseButton onPress={() => setModalVisible(false)} size={18} />
            </View>
            <Text style={styles.modalSubtitle}>Log a running cost — rent, salaries, utilities, whatever it was.</Text>

            <Text style={styles.fieldLabel}>Amount (₹)</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.formInput, webNoOutline]}
                placeholder="e.g. 15000"
                placeholderTextColor={COLORS.placeholder}
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.categoryPickerRow}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.categoryPill, category === c && styles.categoryPillActive]}
                  onPress={() => setCategory(c)}
                >
                  <Text style={[styles.categoryPillText, category === c && styles.categoryPillTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Paid via</Text>
            <View style={styles.paymentModeRow}>
              {PAYMENT_MODES.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.paymentModePill, expenseMode === m && styles.paymentModePillActive]}
                  onPress={() => setExpenseMode(m)}
                >
                  <Icon name={PAYMENT_MODE_ICON[m]} size={14} color={expenseMode === m ? '#FFFFFF' : COLORS.muted} />
                  <Text style={[styles.paymentModePillText, expenseMode === m && styles.paymentModePillTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {expenseMode === 'Due' && (
              <Text style={styles.modeHint}>Not paid to the vendor yet — still counted in this month's spend.</Text>
            )}

            <Text style={styles.fieldLabel}>GST on the bill</Text>
            <View style={styles.paymentModeRow}>
              {GST_RATE_CHOICES.map((r) => {
                const on = gstRate === r;
                return (
                  <TouchableOpacity
                    key={String(r)}
                    style={[styles.paymentModePill, on && styles.paymentModePillActive]}
                    onPress={() => setGstRate(r)}
                  >
                    <Text style={[styles.paymentModePillText, on && styles.paymentModePillTextActive]}>
                      {r === null ? 'Not known' : `${r}%`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.modeHint}>
              {gstRate === null
                ? "No rate recorded — this spend won't be counted as input tax credit."
                : `The amount above stays as typed; ₹${(parseFloat(amount || '0') - parseFloat(amount || '0') / (1 + gstRate / 100)).toFixed(2)} of it is claimable GST.`}
            </Text>

            <Text style={styles.fieldLabel}>Purpose</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.formInput, webNoOutline]}
                placeholder="e.g. July shop rent"
                placeholderTextColor={COLORS.placeholder}
                value={purpose}
                onChangeText={setPurpose}
              />
            </View>

            <Text style={styles.fieldLabel}>Spent By</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.formInput, webNoOutline]}
                placeholder="e.g. Rakesh"
                placeholderTextColor={COLORS.placeholder}
                value={spentBy}
                onChangeText={setSpentBy}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={submit} disabled={addExpense.isPending}>
                {addExpense.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                  <>
                    <Icon name="check" size={14} color="#FFFFFF" />
                    <Text style={styles.modalSaveText}>Add Expense</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={itemModalVisible} transparent animationType="fade" onRequestClose={() => setItemModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Add List Row</Text>
              <CloseButton onPress={() => setItemModalVisible(false)} size={18} />
            </View>
            <Text style={styles.modalSubtitle}>
              Added once, then it shows on every day's sheet — you only type the amount after that.
            </Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.formInput, webNoOutline]}
                placeholder="e.g. Mutton"
                placeholderTextColor={COLORS.placeholder}
                value={newItemName}
                onChangeText={setNewItemName}
              />
            </View>

            <Text style={styles.fieldLabel}>Counts as</Text>
            <View style={styles.categoryPickerRow}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.categoryPill, newItemCategory === c && styles.categoryPillActive]}
                  onPress={() => setNewItemCategory(c)}
                >
                  <Text style={[styles.categoryPillText, newItemCategory === c && styles.categoryPillTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setItemModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={submitNewItem} disabled={addListItem.isPending}>
                {addListItem.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                  <>
                    <Icon name="check" size={14} color="#FFFFFF" />
                    <Text style={styles.modalSaveText}>Add Row</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!entryItem} transparent animationType="fade" onRequestClose={() => setEntryItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.entrySheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]} numberOfLines={1}>
                {entryItem?.name}
              </Text>
              <CloseButton onPress={() => setEntryItem(null)} size={18} />
            </View>

            <Text style={styles.fieldLabel}>Amount (₹)</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.formInput, styles.entryAmountInput, webNoOutline]}
                placeholder="0"
                placeholderTextColor={COLORS.placeholder}
                value={entryAmount}
                onChangeText={(t) => setEntryAmount(t.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>

            <Text style={styles.fieldLabel}>Paid via</Text>
            <View style={styles.paymentModeRow}>
              {PAYMENT_MODES.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.paymentModePill, entryMode === m && styles.paymentModePillActive]}
                  onPress={() => setEntryMode(m)}
                >
                  <Icon name={PAYMENT_MODE_ICON[m]} size={14} color={entryMode === m ? '#FFFFFF' : COLORS.muted} />
                  <Text style={[styles.paymentModePillText, entryMode === m && styles.paymentModePillTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEntryItem(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveEntry}>
                <Icon name="check" size={14} color="#FFFFFF" />
                <Text style={styles.modalSaveText}>Save</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7 : 7.5, paddingHorizontal: isDesktopWeb ? 12 : 12, paddingTop: isDesktopWeb ? 9 : 9, paddingBottom: isDesktopWeb ? 9 : 9 },
  headerIconBtn: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  summaryRow: { flexDirection: 'row', gap: isDesktopWeb ? 8 : 9, paddingHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 11 : 12 },
  summaryCard: { flex: 1, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 12 : 12 },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginBottom: isDesktopWeb ? 5 : 4.5 },
  summaryValue: { fontSize: isDesktopWeb ? 20 : 12, fontWeight: 'bold', color: COLORS.heading },
  accentCard: { backgroundColor: COLORS.button },
  accentLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5, marginBottom: isDesktopWeb ? 5 : 4.5 },
  accentValue: { fontSize: isDesktopWeb ? 20 : 12, fontWeight: 'bold', color: '#FFFFFF' },
  categoryCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: isDesktopWeb ? 12 : 12, marginBottom: isDesktopWeb ? 11 : 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 7 : 7.5, marginTop: isDesktopWeb ? 3 : 3 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 6, paddingVertical: isDesktopWeb ? 5 : 4.5 },
  categoryName: { flex: 1, fontSize: isDesktopWeb ? 13 : 12, color: COLORS.heading, fontWeight: '600' },
  categoryAmount: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.heading, fontWeight: '700' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.button, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 6, paddingVertical: isDesktopWeb ? 10 : 9.75, marginBottom: isDesktopWeb ? 13 : 13.5,
  },
  addBtnText: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: '#FFFFFF' },
  emptyText: { textAlign: 'center', color: COLORS.muted, marginTop: isDesktopWeb ? 14 : 15 },
  expenseCard: {
    flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 8 : 9,
    backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12, borderRadius: 8, padding: isDesktopWeb ? 10 : 10.5, marginBottom: isDesktopWeb ? 8 : 9,
  },
  expenseIconBox: {
    width: 38, height: 38, borderRadius: 8, backgroundColor: COLORS.aiCardBg, alignItems: 'center', justifyContent: 'center',
  },
  expenseTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 6 },
  expensePurpose: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: 'bold', color: COLORS.heading, flexShrink: 1 },
  expenseAmount: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '700', color: COLORS.accent },
  expenseMeta: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  deleteBtn: { padding: isDesktopWeb ? 3 : 3 },

  tabRow: {
    flexDirection: 'row', gap: 6,
    marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 11 : 12,
    backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: 3,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: isDesktopWeb ? 8 : 7.5, borderRadius: 6,
  },
  tabBtnActive: { backgroundColor: COLORS.button },
  tabText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.muted },
  tabTextActive: { color: '#FFFFFF' },

  dateRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 11 : 12,
    backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 5,
  },
  dateNavBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  dateNavBtnDisabled: { opacity: 0.3 },
  dateText: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: 'bold', color: COLORS.heading },
  dateTodayTag: { fontSize: 9, fontWeight: '700', color: COLORS.accent, letterSpacing: 0.5, marginTop: 1 },

  dailyRow: {
    flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 8 : 8,
    backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 16 : 12,
    borderRadius: 8, paddingVertical: 6, paddingLeft: 10, paddingRight: 6, marginBottom: 5,
  },
  dailyName: { flex: 1, fontSize: isDesktopWeb ? 13 : 12, fontWeight: '600', color: COLORS.heading },
  // Tapping this opens the small centered amount+mode popup instead of typing inline —
  // the row itself just shows what was last entered.
  dailyAmountBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    minWidth: isDesktopWeb ? 120 : 96, backgroundColor: COLORS.background, borderRadius: 6,
    borderWidth: 1, borderColor: COLORS.inputBorder,
    paddingHorizontal: 10, height: 30,
  },
  dailyAmountBtnFilled: { borderColor: COLORS.accent },
  dailyAmountText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  dailyAmountPlaceholder: { fontSize: 11.5, color: COLORS.placeholder },
  addRowBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    marginHorizontal: isDesktopWeb ? 16 : 12, marginTop: 4, marginBottom: isDesktopWeb ? 11 : 12,
    paddingVertical: isDesktopWeb ? 9 : 8.5, borderRadius: 6,
    borderWidth: 1, borderColor: COLORS.inputBorder, borderStyle: 'dashed',
  },
  addRowText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.accent },
  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 11 : 12,
    backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12,
  },
  totalLabel: { fontSize: 11, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 },
  totalValue: { fontSize: isDesktopWeb ? 18 : 14, fontWeight: 'bold', color: COLORS.heading },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 18 : 18 },
  modalSheet: { width: '100%', maxWidth: 440, backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 12 : 12, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 3 : 3, flexShrink: 1 },
  modalSubtitle: { fontSize: 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 7 : 7.5, lineHeight: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 3, marginTop: isDesktopWeb ? 4 : 4.5 },
  formInput: {
    backgroundColor: COLORS.cardAlt, borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder,
    paddingHorizontal: 10, height: 34, fontSize: 12, color: COLORS.heading,
  },
  categoryPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4.5 },
  categoryPill: { paddingHorizontal: 7.5, paddingVertical: 4.5, borderRadius: 20, backgroundColor: COLORS.cardAlt },
  categoryPillActive: { backgroundColor: COLORS.button },
  categoryPillText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  categoryPillTextActive: { color: '#FFFFFF' },
  modalActions: { flexDirection: 'row', gap: 6, marginTop: 9 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7.5, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 7.5, borderRadius: 6, backgroundColor: COLORS.button,
  },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  // Deliberately narrower than modalSheet (440) — this popup asks for exactly two things
  // (amount, mode), so it reads as a quick centered prompt, not a form.
  entrySheet: { width: '100%', maxWidth: 300, backgroundColor: COLORS.background, borderRadius: 12, padding: 12, overflow: 'hidden' },
  entryAmountInput: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  // Wraps since Due made it four pills — they no longer fit one line on a narrow phone.
  paymentModeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  modeHint: { fontSize: 11, color: COLORS.muted, marginTop: 5 },
  modeFilterRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    marginHorizontal: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 9 : 9.5,
  },
  // Drops the equal-width flex the form pills use: there can be six of these, and splitting a
  // phone's width six ways clips "Not set". Sized to content and wrapped instead.
  // The base paymentModePill sets `flex: 1`, which already collapses flexBasis to 0% — so
  // flexGrow/flexShrink alone aren't enough here; flexBasis must be reset to 'auto' explicitly
  // or these pills render near-zero width with their icon/text overlapping the next chip.
  modeFilterPill: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', paddingHorizontal: 10, paddingVertical: 6 },
  listHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  listHeaderTitle: { flex: 1 },
  listHeaderTotal: {
    fontSize: 12, fontWeight: '700', color: COLORS.heading,
    marginRight: isDesktopWeb ? 16 : 12, marginBottom: isDesktopWeb ? 7 : 7.5,
  },
  paymentModePill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 7, borderRadius: 8, backgroundColor: COLORS.cardAlt,
  },
  paymentModePillActive: { backgroundColor: COLORS.button },
  paymentModePillText: { fontSize: 11.5, fontWeight: '700', color: COLORS.muted },
  paymentModePillTextActive: { color: '#FFFFFF' },
});
