import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';
import { showToast } from '../../../core/store/uiSlice';
import { useRemoveOrderItem } from '../../../core/api/hooks/useOrders';
import { OrderItem as ApiOrderItem } from '../../../core/api/ordersApi';
import { getApiErrorMessage } from '../../../core/network/api';
import { modalHeadingOverride } from '../../design/commonStyles';
import { VoidReasonPicker, useVoidReasonState } from './voidReasons';

export interface ItemVoidPrompt {
  /** Asks for a line to come off the bill. Goes straight to the server when nothing was cooked
   * (unfired, or fired but still New/Read — the server puts that stock back by itself), and
   * through the reason prompt when it reaches food that was made or recorded as served. */
  request: (item: ApiOrderItem) => void;
  /** The line currently mid-write, so a screen can grey out just that row if it wants to. */
  pendingItemId: number | null;
  // --- consumed by VoidReasonPrompt below; not meant for screens to read directly ---
  item: ApiOrderItem | null;
  dismiss: () => void;
  confirm: () => void;
  reason: ReturnType<typeof useVoidReasonState>;
  /** Wording differs per screen: Tables says "void", the counter screens say "remove". */
  verb: 'void' | 'remove';
}

/** The shared "take this line off the bill" behaviour — the network call, the reason prompt and
 * the toasts. Lives here rather than in each of the three order-detail screens (Tables / Token /
 * Takeaway & Delivery) for the same reason useItemQtyEditor does: the rules it fronts are the
 * server's, and three copies drift the moment one of them is fixed.
 *
 * Mount it once per screen, call `request` from every row's remove button, and render
 * <VoidReasonPrompt> at the screen root.
 */
export const useItemVoidPrompt = (orderId: number | null, verb: 'void' | 'remove' = 'remove'): ItemVoidPrompt => {
  const dispatch = useDispatch();
  const removeOrderItem = useRemoveOrderItem();
  const reason = useVoidReasonState();
  const [item, setItem] = useState<ApiOrderItem | null>(null);
  const [pendingItemId, setPendingItemId] = useState<number | null>(null);

  const past = verb === 'void' ? 'Voided' : 'Removed';

  const apply = async (target: ApiOrderItem, args?: { reasonCode: string; note: string; unprepared: boolean }) => {
    if (orderId === null) return;
    setPendingItemId(target.id);
    try {
      await removeOrderItem.mutateAsync({
        id: orderId,
        itemId: target.id,
        reason: args?.note || undefined,
        reasonCode: args?.reasonCode as any,
        unprepared: args?.unprepared,
      });
      if (args) {
        const wasServed = target.status === 'SERVED';
        dispatch(showToast({
          message: args.unprepared
            ? `${past} ${target.name} — stock put back, since the kitchen never made it.`
            : wasServed
              ? `${past} ${target.name} off the bill — no stock reversal (already served).`
              : `${past} ${target.name} — no stock reversal (already in prep).`,
          icon: 'delete-outline',
          tone: 'warning',
        }));
      }
    } catch (err) {
      dispatch(showToast({
        message: getApiErrorMessage(err, `Could not ${verb} item`),
        icon: 'alert-circle-outline',
        tone: 'danger',
      }));
    } finally {
      setPendingItemId(null);
    }
  };

  const request = (target: ApiOrderItem) => {
    if (orderId === null) return;
    // Same rule the server enforces, asked up front so the till isn't bounced by a 400. Anything
    // the kitchen has cooked, or that was recorded as gone out, needs a reason on the record.
    const needsReason = target.fireBatch > 0
      && (target.status === 'PREPARING' || target.status === 'READY' || target.status === 'SERVED');
    if (needsReason) {
      reason.reset();
      setItem(target);
      return;
    }
    void apply(target);
  };

  const dismiss = () => {
    setItem(null);
    reason.reset();
  };

  const confirm = () => {
    if (!item) return;
    if (!reason.isComplete) {
      dispatch(showToast({
        message: 'Pick a reason, or type one under Other.',
        icon: 'alert-circle-outline',
        tone: 'warning',
      }));
      return;
    }
    const target = item;
    const args = {
      reasonCode: reason.reasonCode,
      note: reason.note.trim(),
      // Only a served line gets to claim this — the server ignores it at every other stage,
      // and sending it there would only make the prompt look like it did something it didn't.
      unprepared: target.status === 'SERVED' && reason.unprepared,
    };
    dismiss();
    void apply(target, args);
  };

  return { request, pendingItemId, item, dismiss, confirm, reason, verb };
};

/** The reason prompt for taking one line off the bill. Render one per screen, driven by the
 * prompt returned from useItemVoidPrompt. */
export const VoidReasonPrompt: React.FC<{ prompt: ItemVoidPrompt }> = ({ prompt }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const { item, dismiss, confirm, reason, pendingItemId, verb } = prompt;
  const wasServed = item?.status === 'SERVED';
  const title = verb === 'void' ? 'Void' : 'Remove';

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>
            {title} {item?.name}?
          </Text>
          <Text style={styles.modalLine}>
            {wasServed
              ? 'Already served — this takes it off the bill, and the correction is logged.'
              : "Already in prep — stock won't be put back. This is logged as wastage."}
          </Text>

          <VoidReasonPicker state={reason} askAboutStock={!!wasServed} />

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={dismiss}>
              <Text style={styles.modalCancelText}>Keep Item</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirm} disabled={pendingItemId !== null}>
              {pendingItemId !== null
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.modalConfirmText}>{title} Item</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 20 : 18 },
  modalSheet: { width: '100%', maxWidth: 420, backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 17 : 16.5 },
  modalTitle: { fontSize: isDesktopWeb ? 18 : 14, fontWeight: '800', color: COLORS.heading },
  modalLine: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 11 : 10 },
  modalActions: { flexDirection: 'row', gap: 6 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10.5, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalConfirmBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10.5, borderRadius: 6, backgroundColor: COLORS.heading },
  modalConfirmText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
