import React, { useMemo, useState } from 'react';
import { CloseButton } from '../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { WarmColors as COLORS } from '../../../../shared/design/warmTheme';
import { showToast } from '../../../../core/store/uiSlice';
import { confirmAlert } from '../../../../shared/components/ConfirmDialogHost';
import { usePlatformExpenses, useAddPlatformExpense, useRemovePlatformExpense } from '../../../../core/api/hooks/useSuperAdmin';
import { getApiErrorMessage } from '../../../../core/network/api';
import { SkeletonList } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';

import { modalHeadingOverride } from '../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../core/utils/useResponsive';
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;
const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Founders whose individual spend gets its own summary card. "Spent By" is free text,
// so match loosely — "aashish", "Aashish Verma" and " AASHISH " all count as the same person.
const FOUNDERS = ['Aashish', 'Deepali'];

export const ExpensesScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const { data, isLoading, isError, refetch } = usePlatformExpenses();
  const addExpense = useAddPlatformExpense();
  const removeExpense = useRemovePlatformExpense();

  // `recent` is the whole ledger (the API hands back every expense, not a slice), so these
  // per-founder sums line up with the all-time total rather than a truncated view of it.
  const founderTotals = useMemo(
    () =>
      FOUNDERS.map((name) => ({
        name,
        total: (data?.recent ?? []).reduce(
          (sum, e) => (e.spentBy.trim().toLowerCase().includes(name.toLowerCase()) ? sum + e.amount : sum),
          0,
        ),
      })),
    [data?.recent],
  );

  const [modalVisible, setModalVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [spentBy, setSpentBy] = useState('');
  const [purpose, setPurpose] = useState('');

  const openModal = () => {
    setAmount('');
    setSpentBy('');
    setPurpose('');
    setModalVisible(true);
  };

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amount.trim() || isNaN(amt) || amt <= 0) {
      dispatch(showToast({ message: 'Enter an amount greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (!spentBy.trim()) {
      dispatch(showToast({ message: 'Enter who this was spent by.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (!purpose.trim()) {
      dispatch(showToast({ message: 'Enter what this expense was for.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await addExpense.mutateAsync({ amount: amt, spentBy: spentBy.trim(), purpose: purpose.trim() });
      setModalVisible(false);
      dispatch(showToast({ message: 'Expense added.', icon: 'check-circle', tone: 'success' }));
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
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Icon name="cash-multiple" size={20} color={COLORS.superAdmin} />
        <Text style={styles.headerTitle}>Expenses</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 50 }}>
        <View style={styles.titleBox}>
          <Text style={styles.title}>Running the Business</Text>
          <Text style={styles.subtitle}>PrabandhOS's own expenses — not any cafe's. Track what the founders have put in and spent on.</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>ALL TIME</Text>
            <Text style={styles.summaryValue}>{money(data?.totalAllTime ?? 0)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>THIS MONTH</Text>
            <Text style={styles.summaryValue}>{money(data?.totalThisMonth ?? 0)}</Text>
          </View>
          {founderTotals.map((f) => (
            <View key={f.name} style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{f.name.toUpperCase()}</Text>
              <Text style={styles.summaryValue}>{money(f.total)}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={openModal}>
          <Icon name="plus" size={16} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Expense</Text>
        </TouchableOpacity>

        {isError && (data?.recent.length ?? 0) === 0 ? (
          <ErrorState
            title="Couldn't load expenses"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : (
          <>
            {isLoading && <SkeletonList rows={5} style={{ marginTop: 4 }} />}
            {!isLoading && (data?.recent.length ?? 0) === 0 && <Text style={styles.emptyText}>No expenses logged yet.</Text>}

            {data?.recent.map((e) => (
              <View key={e.id} style={styles.expenseCard}>
                <View style={styles.expenseTopRow}>
                  <Text style={styles.expensePurpose} numberOfLines={1}>{e.purpose}</Text>
                  <Text style={styles.expenseAmount}>{money(e.amount)}</Text>
                </View>
                <Text style={styles.expenseMeta}>
                  By {e.spentBy} · {new Date(e.spentAt).toLocaleDateString()} · logged by {e.recordedByName}
                </Text>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => confirmDelete(e.id, e.purpose)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="trash-can-outline" size={16} color={COLORS.dangerAccent} />
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Add Expense</Text>
              <CloseButton onPress={() => setModalVisible(false)} size={18} />
            </View>
            <Text style={styles.modalSubtitle}>Log a business expense — amount, who spent it, and what for.</Text>

            <Text style={styles.fieldLabel}>Amount (₹)</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.formInput, webNoOutline]}
                placeholder="e.g. 1000"
                placeholderTextColor={COLORS.placeholder}
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={styles.fieldLabel}>Spent By</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.formInput, webNoOutline]}
                placeholder="e.g. Aashish"
                placeholderTextColor={COLORS.placeholder}
                value={spentBy}
                onChangeText={setSpentBy}
              />
            </View>

            <Text style={styles.fieldLabel}>Purpose</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={[styles.formInput, webNoOutline]}
                placeholder="e.g. Bike petrol"
                placeholderTextColor={COLORS.placeholder}
                value={purpose}
                onChangeText={setPurpose}
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
    </View>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4 : 3, paddingHorizontal: isDesktopWeb ? 8 : 6, paddingTop: isDesktopWeb ? 6 : 4.5, paddingBottom: isDesktopWeb ? 6 : 4.5 },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.superAdmin, flex: 1 },
  titleBox: { paddingHorizontal: isDesktopWeb ? 8 : 6, marginBottom: isDesktopWeb ? 8 : 6 },
  title: { fontSize: isDesktopWeb ? 22 : 14, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 3 : 2.25 },
  subtitle: { fontSize: 13, color: COLORS.muted, lineHeight: 18 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 6 : 4.5, paddingHorizontal: isDesktopWeb ? 8 : 6, marginBottom: isDesktopWeb ? 8 : 6 },
  // Four cards across on desktop; on a phone they wrap two-per-row instead of squeezing
  // the amounts into a quarter of the screen.
  summaryCard: { flexGrow: 1, flexBasis: isDesktopWeb ? 0 : '45%', backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 8 : 6, alignItems: 'center' },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginBottom: isDesktopWeb ? 3 : 2.25 },
  summaryValue: { fontSize: isDesktopWeb ? 20 : 12, fontWeight: 'bold', color: COLORS.superAdmin },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 4 : 3,
    backgroundColor: COLORS.superAdmin, marginHorizontal: isDesktopWeb ? 8 : 6, borderRadius: 6, paddingVertical: isDesktopWeb ? 6.5 : 4.88, marginBottom: isDesktopWeb ? 9 : 6.75,
  },
  addBtnText: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: '#FFFFFF' },
  emptyText: { textAlign: 'center', color: COLORS.muted, marginTop: isDesktopWeb ? 10 : 7.5 },
  expenseCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 8 : 6, borderRadius: 8, padding: isDesktopWeb ? 8 : 6, marginBottom: isDesktopWeb ? 7 : 5.25, position: 'relative' },
  expenseTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isDesktopWeb ? 2 : 1.5, gap: isDesktopWeb ? 4 : 3, paddingRight: isDesktopWeb ? 14 : 10.5 },
  expensePurpose: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: 'bold', color: COLORS.heading, flexShrink: 1 },
  expenseAmount: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: '700', color: COLORS.superAdmin },
  expenseMeta: { fontSize: 12, color: COLORS.muted },
  deleteBtn: { position: 'absolute', top: 8, right: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 12 : 9 },
  modalSheet: { width: '100%', maxWidth: 420, backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 8 : 6, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 4 : 3 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 2 : 1.5, flexShrink: 1 },
  modalSubtitle: { fontSize: 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 6 : 4.5, lineHeight: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: isDesktopWeb ? 2 : 1.5, marginTop: isDesktopWeb ? 2 : 1.5 },
  formInput: {
    backgroundColor: COLORS.cardAlt, borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder,
    paddingHorizontal: 5, height: 34, fontSize: 12, color: COLORS.heading, marginBottom: isDesktopWeb ? 2 : 1.5,
  },
  modalActions: { flexDirection: 'row', gap: 3, marginTop: 4.5 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 3.75, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2.25,
    paddingVertical: 3.75, borderRadius: 6, backgroundColor: COLORS.superAdmin,
  },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
