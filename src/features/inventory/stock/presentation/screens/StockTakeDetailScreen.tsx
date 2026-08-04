import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useStockTake, useRecordStockCount, useFinalizeStockTake } from '../../../../../core/api/hooks/useStockTake';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const round = (n: number) => Math.round(n * 1000) / 1000;

export const StockTakeDetailScreen = ({ route, navigation }: any) => {
  const id: number | undefined = route?.params?.id;
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const { data: stockTake, isLoading, isError, refetch } = useStockTake(id ?? null);
  const recordCount = useRecordStockCount();
  const finalize = useFinalizeStockTake();

  // Local draft text per line — committed to the server onBlur, not on every keystroke.
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [finalizing, setFinalizing] = useState(false);

  const isDraft = stockTake?.status === 'DRAFT';

  const commitCount = async (lineId: number, text: string) => {
    if (!id || text.trim() === '') return;
    const qty = parseFloat(text);
    if (isNaN(qty) || qty < 0) {
      dispatch(showToast({ message: 'Enter a valid count (0 or more).', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await recordCount.mutateAsync({ id, lineId, countedQty: qty });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save count'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleFinalize = () => {
    if (!id) return;
    const countedLines = stockTake?.lines.filter((l) => l.countedQty !== null).length ?? 0;
    if (countedLines === 0) {
      dispatch(showToast({ message: 'Count at least one item before finalizing.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    Alert.alert(
      'Finalize stock take?',
      `${countedLines} of ${stockTake?.lines.length} items counted. Finalizing corrects stock to your counted numbers and locks this stock take — this can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finalize',
          style: 'destructive',
          onPress: async () => {
            try {
              setFinalizing(true);
              await finalize.mutateAsync(id);
              dispatch(showToast({ message: 'Stock take finalized — balances corrected.', icon: 'check-circle', tone: 'success' }));
            } catch (err) {
              dispatch(showToast({ message: getApiErrorMessage(err, 'Could not finalize'), icon: 'alert-circle-outline', tone: 'danger' }));
            } finally {
              setFinalizing(false);
            }
          },
        },
      ],
    );
  };

  if (isError && !stockTake) {
    return <ErrorState title="Couldn't load stock take" message="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="clipboard-check-outline" title="Stock Take" onBack={() => navigation?.goBack?.()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {isLoading && (
          <View style={{ padding: 16 }}>
            <SkeletonList rows={6} />
          </View>
        )}

        {stockTake && (
          <>
            <View style={styles.titleBox}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>Stock Take #{stockTake.id}</Text>
                <View style={[styles.statusBadge, isDraft ? styles.statusDraft : styles.statusFinalized]}>
                  <Text style={[styles.statusText, isDraft ? styles.statusTextDraft : styles.statusTextFinalized]}>
                    {isDraft ? 'Draft' : 'Finalized'}
                  </Text>
                </View>
              </View>
              {!!stockTake.note && <Text style={styles.subtitle}>{stockTake.note}</Text>}
              {!isDraft && (
                <Text style={styles.finalizedMeta}>
                  Finalized by {stockTake.finalizedByName} on {stockTake.finalizedAt ? new Date(stockTake.finalizedAt).toLocaleString() : ''}
                </Text>
              )}
            </View>

            <View style={styles.tableCard}>
              {stockTake.lines.map((line, index) => {
                const draftValue = drafts[line.id] ?? (line.countedQty !== null ? String(line.countedQty) : '');
                const variance = line.variance ?? (line.countedQty !== null ? line.countedQty - line.systemQty : null);
                return (
                  <View key={line.id} style={[styles.row, index !== stockTake.lines.length - 1 && styles.rowDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{line.inventoryItemName}</Text>
                      <Text style={styles.metaText}>System: {round(line.systemQty)} {line.unit}</Text>
                    </View>
                    {isDraft ? (
                      <View style={styles.countInputWrap}>
                        <TextInput
                          style={styles.countInput}
                          placeholder="Count"
                          placeholderTextColor={COLORS.placeholder}
                          keyboardType="decimal-pad"
                          value={draftValue}
                          onChangeText={(t) => setDrafts((d) => ({ ...d, [line.id]: t.replace(/[^0-9.]/g, '') }))}
                          onBlur={() => commitCount(line.id, drafts[line.id] ?? draftValue)}
                        />
                      </View>
                    ) : (
                      <View style={styles.countedBox}>
                        <Text style={styles.countedValue}>{line.countedQty !== null ? round(line.countedQty) : '—'} {line.unit}</Text>
                        {variance !== null && (
                          <Text style={[styles.varianceText, { color: variance === 0 ? COLORS.muted : (variance > 0 ? COLORS.success : COLORS.dangerAccent) }]}>
                            {variance > 0 ? '+' : ''}{round(variance)} {line.unit}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {isDraft && (
              <TouchableOpacity style={styles.finalizeBtn} onPress={handleFinalize} disabled={finalizing}>
                {finalizing ? <ActivityIndicator color="#FFFFFF" /> : (
                  <>
                    <Icon name="check-circle-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.finalizeBtnText}>Finalize Stock Take</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  titleBox: { marginHorizontal: isDesktopWeb ? 8 : 10, borderRadius: 8, padding: isDesktopWeb ? 8 : 10, marginBottom: isDesktopWeb ? 6 : 8, marginTop: isDesktopWeb ? 3 : 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.heading },
  subtitle: { fontSize: 12, color: COLORS.muted, marginTop: 3, fontStyle: 'italic' },
  finalizedMeta: { fontSize: 11, color: COLORS.muted, marginTop: isDesktopWeb ? 3 : 4 },
  statusBadge: { borderRadius: 8, paddingHorizontal: isDesktopWeb ? 6 : 8, paddingVertical: isDesktopWeb ? 2 : 3 },
  statusDraft: { backgroundColor: COLORS.warningBg },
  statusFinalized: { backgroundColor: COLORS.successBg },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusTextDraft: { color: COLORS.warning },
  statusTextFinalized: { color: COLORS.success },
  tableCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 8 : 10, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 8, paddingHorizontal: isDesktopWeb ? 8 : 10, paddingVertical: isDesktopWeb ? 5 : 7 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  itemName: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  metaText: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  countInputWrap: { borderRadius: 8 },
  countInput: {
    width: 64, backgroundColor: COLORS.background, borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder,
    paddingHorizontal: 6, height: isDesktopWeb ? 28 : 30, fontSize: 16, color: COLORS.heading, textAlign: 'right',
  },
  countedBox: { alignItems: 'flex-end' },
  countedValue: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  varianceText: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  finalizeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 4.5 : 6,
    backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: isDesktopWeb ? 9 : 11, marginHorizontal: isDesktopWeb ? 8 : 10, marginTop: isDesktopWeb ? 9 : 12,
  },
  finalizeBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
