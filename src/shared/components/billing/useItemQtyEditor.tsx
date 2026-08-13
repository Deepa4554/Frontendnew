import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';
import { showToast } from '../../../core/store/uiSlice';
import { useUpdateOrderItemQty } from '../../../core/api/hooks/useOrders';
import { OrderItem as ApiOrderItem, VoidReasonCode } from '../../../core/api/ordersApi';
import { getApiErrorMessage } from '../../../core/network/api';
import { modalHeadingOverride } from '../../design/commonStyles';
import { VoidReasonPicker, useVoidReasonState } from './voidReasons';

interface PromptState {
  item: ApiOrderItem;
  nextQty: number;
}

interface ReasonArgs {
  reason?: string;
  reasonCode: VoidReasonCode;
  unprepared: boolean;
}

export interface ItemQtyEditor {
  /** Asks for a line to end up at `nextQty` units. Routes straight to the server, or through the
   * wastage-reason prompt first when the change pulls units back out of preparation. */
  request: (item: ApiOrderItem, nextQty: number) => void;
  /** The line currently mid-write, so only that row's stepper greys out. */
  pendingItemId: number | null;
  // --- consumed by QtyReasonPrompt below; not meant for screens to read directly ---
  prompt: PromptState | null;
  reason: ReturnType<typeof useVoidReasonState>;
  dismissPrompt: () => void;
  confirmPrompt: () => void;
}

/** The shared "edit a line's quantity" behaviour behind ItemQtyStepper — the network call, the
 * wastage-reason prompt, and the toasts. Lives here rather than in each of the three order-detail
 * screens (Tables / Token / Takeaway & Delivery) because the rules it enforces are the server's,
 * not any one screen's, and three copies would drift the moment one of them was fixed.
 *
 * Mount it once per screen, pass `request` to every row's stepper, and render `<QtyReasonPrompt>`
 * at the screen root.
 */
export const useItemQtyEditor = (orderId: number | null): ItemQtyEditor => {
  const dispatch = useDispatch();
  const updateQty = useUpdateOrderItemQty();
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const reason = useVoidReasonState();
  const [pendingItemId, setPendingItemId] = useState<number | null>(null);

  const apply = async (item: ApiOrderItem, nextQty: number, args?: ReasonArgs) => {
    if (orderId === null) return;
    setPendingItemId(item.id);
    try {
      await updateQty.mutateAsync({
        id: orderId, itemId: item.id, qty: nextQty,
        reason: args?.reason, reasonCode: args?.reasonCode, unprepared: args?.unprepared,
      });
      // Raising an already-fired line puts unmade food back on a ticket the kitchen may well have
      // finished — worth saying out loud, since the row itself only shows a bigger number and its
      // status quietly dropping back to NEW is easy to miss. A fully-served line is the other
      // case: nothing goes to the kitchen, the till is just correcting the bill after the fact.
      if (item.fireBatch > 0 && nextQty > item.qty) {
        dispatch(showToast({
          message: item.status === 'SERVED'
            ? `${item.name} corrected to ${nextQty} on the bill — nothing sent to the kitchen.`
            : `${item.name} is now ${nextQty} on KOT — the kitchen sees the updated count.`,
          icon: 'silverware-fork-knife',
          tone: 'info',
        }));
      } else if (args) {
        dispatch(showToast({
          message: args.unprepared
            ? `${item.name} reduced to ${nextQty} — stock put back, since those units were never made.`
            : `${item.name} reduced to ${nextQty} — no stock reversal, and it's on the record.`,
          icon: 'minus-circle-outline',
          tone: 'warning',
        }));
      }
    } catch (err) {
      dispatch(showToast({
        message: getApiErrorMessage(err, 'Could not update quantity'),
        icon: 'alert-circle-outline',
        tone: 'danger',
      }));
    } finally {
      setPendingItemId(null);
    }
  };

  const request = (item: ApiOrderItem, nextQty: number) => {
    if (orderId === null || nextQty === item.qty || nextQty < 1) return;
    // Same rule the server enforces, asked up front so the cashier isn't bounced by a 400.
    // Deliberately per-UNIT rather than off the line's rollup `status`: a "×5" line with 3 units
    // still New and 2 already Preparing reads as NEW overall, so cutting it to 4 is free but
    // cutting it to 1 reaches two units the kitchen has already started — and a status check
    // would have called both free and let the server reject the second one. Anything past the
    // not-yet-cooked units needs a reason, whether it's food in the pass or food the system
    // already recorded as served (the till-side "it was 3, not 4" correction). Increases are
    // never wastage, and neither is anything on an unfired line.
    const freeUnits = item.newQty + item.readQty;
    const needsReason = item.fireBatch > 0 && item.qty - nextQty > freeUnits;
    if (needsReason) {
      reason.reset();
      setPrompt({ item, nextQty });
      return;
    }
    void apply(item, nextQty);
  };

  const dismissPrompt = () => {
    setPrompt(null);
    reason.reset();
  };

  const confirmPrompt = () => {
    if (!prompt) return;
    if (!reason.isComplete) {
      dispatch(showToast({
        message: 'Pick a reason, or type one under Other.',
        icon: 'alert-circle-outline',
        tone: 'warning',
      }));
      return;
    }
    const { item, nextQty } = prompt;
    const args: ReasonArgs = {
      reason: reason.note.trim() || undefined,
      reasonCode: reason.reasonCode,
      // Only meaningful when the cut actually reaches units recorded as served — the server
      // ignores it otherwise, since the unit counts already answer the question there.
      unprepared: servedUnitsCut(item, nextQty) > 0 && reason.unprepared,
    };
    dismissPrompt();
    void apply(item, nextQty, args);
  };

  return { request, pendingItemId, prompt, reason, dismissPrompt, confirmPrompt };
};

/** How many of the units this cut removes were ones the system had recorded as SERVED. Units come
 * off the least-progressed stages first (see OrdersController.ReduceFiredLineQty), so served ones
 * are only reached once everything else on the line has been used up. */
const servedUnitsCut = (item: ApiOrderItem, nextQty: number): number => {
  const dropped = item.qty - nextQty;
  const beforeServed = item.newQty + item.readQty + item.preparingQty + item.readyQty;
  return Math.max(0, dropped - beforeServed);
};

/** The wastage-reason prompt for a quantity reduction that reaches into Preparing/Ready units —
 * the same bargain the single-item void prompt strikes (stock doesn't come back, the record needs
 * a reason). Render one per screen, driven by the editor returned from useItemQtyEditor. */
export const QtyReasonPrompt: React.FC<{ editor: ItemQtyEditor }> = ({ editor }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const { prompt, reason, dismissPrompt, confirmPrompt, pendingItemId } = editor;
  // Only the units beyond the still-New/Read ones cost the cafe anything — the rest of the cut
  // does put its stock back, and saying otherwise would overstate it. Split again by whether they
  // were merely in the pass or already recorded as served, because those are different admissions:
  // one is wastage, the other is "the bill said 4 and we're billing 3".
  const dropped = prompt ? prompt.item.qty - prompt.nextQty : 0;
  const item = prompt?.item;
  const notCooked = item ? item.newQty + item.readQty : 0;
  const inPassOrOut = Math.max(0, dropped - notCooked);
  const fromServed = item
    ? Math.max(0, dropped - (notCooked + item.preparingQty + item.readyQty))
    : 0;
  const fromPrep = inPassOrOut - fromServed;

  return (
    <Modal visible={!!prompt} transparent animationType="fade" onRequestClose={dismissPrompt}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>
            Reduce {prompt?.item.name} to {prompt?.nextQty}?
          </Text>
          <Text style={styles.modalLine}>
            {fromServed > 0
              ? `${fromServed} unit${fromServed === 1 ? ' was' : 's were'} already recorded as served. Taking ${fromServed === 1 ? 'it' : 'them'} off the bill is logged for review — say below whether the kitchen actually made ${fromServed === 1 ? 'it' : 'them'}.`
              : `${fromPrep} unit${fromPrep === 1 ? '' : 's'} already in prep — that stock won't be put back. This is logged as wastage.`}
          </Text>
          <VoidReasonPicker state={reason} askAboutStock={fromServed > 0} />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={dismissPrompt}>
              <Text style={styles.modalCancelText}>Keep Quantity</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirmPrompt} disabled={pendingItemId !== null}>
              {pendingItemId !== null
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.modalConfirmText}>Reduce Quantity</Text>}
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
  modalLine: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 7 : 6 },
  modalActions: { flexDirection: 'row', gap: 6 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10.5, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalConfirmBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10.5, borderRadius: 6, backgroundColor: COLORS.heading },
  modalConfirmText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
