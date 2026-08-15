import React, { useEffect, useRef, useState } from 'react';
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
import { ExpenseCategory } from '../../../../../core/api/expensesApi';
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
  const loadedDateRef = useRef<string | null>(null);

  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<ExpenseCategory>('Supplies');

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
  }, [sheet]);

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
      .map(([itemId, raw]) => ({ itemId: Number(itemId), amount: parseFloat(raw) }))
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

  const openModal = () => {
    setAmount('');
    setCategory('Rent');
    setPurpose('');
    setSpentBy('');
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
      const result = await addExpense.mutateAsync({ amount: amt, category, purpose: purpose.trim(), spentBy: spentBy.trim() });
      setModalVisible(false);
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

              {sheet?.lines.map((line) => (
                <View key={line.itemId} style={styles.dailyRow}>
                  <Text style={styles.dailyName} numberOfLines={1}>{line.name}</Text>
                  <TextInput
                    style={[styles.dailyInput, webNoOutline]}
                    placeholder="0"
                    placeholderTextColor={COLORS.placeholder}
                    value={amounts[line.itemId] ?? ''}
                    onChangeText={(t) => setAmounts((prev) => ({ ...prev, [line.itemId]: t.replace(/[^0-9.]/g, '') }))}
                    keyboardType="decimal-pad"
                  />
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => confirmRemoveItem(line.itemId, line.name)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="close" size={14} color={COLORS.muted} />
                  </TouchableOpacity>
                </View>
              ))}

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

        <TouchableOpacity style={styles.addBtn} onPress={openModal}>
          <Icon name="plus" size={16} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Expense</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>ALL EXPENSES</Text>
        {isLoading && <SkeletonList rows={6} />}
        {!isLoading && (data?.recent.length ?? 0) === 0 && <Text style={styles.emptyText}>No expenses logged yet.</Text>}

        {data?.recent.map((e) => (
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
                {e.category} · By {e.spentBy} · {new Date(e.spentAt).toLocaleDateString()}
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
  dailyInput: {
    width: isDesktopWeb ? 120 : 96, backgroundColor: COLORS.background, borderRadius: 6,
    borderWidth: 1, borderColor: COLORS.inputBorder,
    paddingHorizontal: 8, height: 30, fontSize: 12, color: COLORS.heading, textAlign: 'right',
  },
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
});
