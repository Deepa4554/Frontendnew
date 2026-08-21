import React, { useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useStockTakes, useCreateStockTake } from '../../../../../core/api/hooks/useStockTake';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

export const StockTakeListScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const { data: stockTakes = [], isLoading, isError, refetch } = useStockTakes();
  const createStockTake = useCreateStockTake();

  const [formVisible, setFormVisible] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    try {
      setSaving(true);
      const created = await createStockTake.mutateAsync({ note: note.trim() || undefined });
      setFormVisible(false);
      setNote('');
      dispatch(showToast({ message: 'Stock take started — snapshot taken of current balances.', icon: 'check-circle', tone: 'success' }));
      navigation.navigate('StockTakeDetail', { id: created.id });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not start stock take'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="clipboard-check-outline" title="Stock Takes" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
       
        {isError && stockTakes.length === 0 ? (
          <ErrorState title="Couldn't load stock takes" message="Check your connection and try again." onRetry={() => refetch()} />
        ) : (
          <>
            {isLoading && (
              <View style={{ paddingHorizontal: 16 }}>
                <SkeletonList rows={4} />
              </View>
            )}
            {!isLoading && stockTakes.length === 0 && (
              <View style={styles.emptyCard}>
                <Icon name="clipboard-list-outline" size={28} color={COLORS.muted} />
                <Text style={styles.emptyText}>No stock takes yet.</Text>
                <Text style={styles.emptyHint}>Tap the + button to start counting.</Text>
              </View>
            )}

            {stockTakes.map((st) => {
              const countedLines = st.lines.filter((l) => l.countedQty !== null).length;
              return (
                <TouchableOpacity key={st.id} style={styles.card} onPress={() => navigation.navigate('StockTakeDetail', { id: st.id })}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle}>Stock Take #{st.id}</Text>
                    <View style={[styles.statusBadge, st.status === 'FINALIZED' ? styles.statusFinalized : styles.statusDraft]}>
                      <Text style={[styles.statusText, st.status === 'FINALIZED' ? styles.statusTextFinalized : styles.statusTextDraft]}>
                        {st.status === 'FINALIZED' ? 'Finalized' : 'Draft'}
                      </Text>
                    </View>
                  </View>
                  {!!st.note && <Text style={styles.cardNote}>{st.note}</Text>}
                  <Text style={styles.cardMeta}>
                    {countedLines}/{st.lines.length} items counted · Started by {st.createdByName} · {new Date(st.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setFormVisible(true)}>
        <Icon name="plus" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal visible={formVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Start Stock Take</Text>
              <CloseButton onPress={() => setFormVisible(false)} size={18} />
            </View>
            <Text style={styles.modalSubtitle}>Snapshots every ingredient's current system balance right now — you'll enter counted quantities next.</Text>

            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <View style={styles.fieldInputWrap}>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. Weekly Sunday count"
                placeholderTextColor={COLORS.placeholder}
                value={note}
                onChangeText={setNote}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setFormVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={submit} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : (
                  <>
                    <Icon name="check" size={14} color="#FFFFFF" />
                    <Text style={styles.modalSaveText}>Start Count</Text>
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
  titleBox: { marginHorizontal: isDesktopWeb ? 8 : 10, borderRadius: 8, padding: isDesktopWeb ? 8 : 10, marginBottom: isDesktopWeb ? 6 : 8, marginTop: isDesktopWeb ? 3 : 4 },
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 3 : 4 },
  subtitle: { fontSize: 12, color: COLORS.muted, lineHeight: 16 },
  emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 30 : 40, gap: isDesktopWeb ? 4.5 : 6, paddingHorizontal: isDesktopWeb ? 15 : 20 },
  emptyText: { fontSize: 13, fontWeight: '600', color: COLORS.heading, textAlign: 'center' },
  emptyHint: { fontSize: 12, color: COLORS.muted, textAlign: 'center' },
  card: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 8 : 10, borderRadius: 8, padding: isDesktopWeb ? 8 : 10, marginBottom: isDesktopWeb ? 6 : 8 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 3 : 4 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: COLORS.heading },
  statusBadge: { borderRadius: 8, paddingHorizontal: isDesktopWeb ? 5 : 7, paddingVertical: 2 },
  statusDraft: { backgroundColor: COLORS.warningBg },
  statusFinalized: { backgroundColor: COLORS.successBg },
  statusText: { fontSize: 10, fontWeight: '700' },
  statusTextDraft: { color: COLORS.warning },
  statusTextFinalized: { color: COLORS.success },
  cardNote: { fontSize: 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 4, fontStyle: 'italic' },
  cardMeta: { fontSize: 11, color: COLORS.muted },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.button, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 12 : 16 },
  modalSheet: { width: '100%', maxWidth: 440, backgroundColor: COLORS.background, borderRadius: isDesktopWeb ? 10 : 12, padding: isDesktopWeb ? 9 : 12, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 4.5 : 6 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 4 : 5, flexShrink: 1 },
  modalSubtitle: { fontSize: 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 4 : 5, lineHeight: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: 3, marginTop: isDesktopWeb ? 3 : 4 },
  fieldInputWrap: { borderRadius: 8 },
  fieldInput: { backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 8 : 10, height: isDesktopWeb ? 30 : 34, fontSize: 12, color: COLORS.heading, borderWidth: 1, borderColor: COLORS.inputBorder },
  modalActions: { flexDirection: 'row', gap: isDesktopWeb ? 4.5 : 6, marginTop: isDesktopWeb ? 6 : 8 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderRadius: 6, paddingVertical: isDesktopWeb ? 6 : 8 },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: { flex: 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 4.5 : 6, backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: isDesktopWeb ? 6 : 8 },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
