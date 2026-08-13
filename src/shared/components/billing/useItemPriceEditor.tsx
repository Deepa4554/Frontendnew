import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Tooltip } from '../atoms/Tooltip';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';
import { showToast } from '../../../core/store/uiSlice';
import { useUpdateOrderItemPrice } from '../../../core/api/hooks/useOrders';
import { OrderItem as ApiOrderItem } from '../../../core/api/ordersApi';
import { canOverrideItemPrice } from '../../../core/auth/permissions';
import { getApiErrorMessage } from '../../../core/network/api';
import { modalHeadingOverride } from '../../design/commonStyles';

export interface ItemPriceEditor {
  /** False for a role that may not re-rate a line — screens use it to leave the price as plain
   * text rather than rendering a control that only ever 403s. */
  canEdit: boolean;
  /** Opens the rate prompt for a line, prefilled with what it's currently billed at. */
  request: (item: ApiOrderItem) => void;
  /** The line currently mid-write, so only that row's price greys out. */
  pendingItemId: number | null;
  // --- consumed by ItemRatePrompt below; not meant for screens to read directly ---
  item: ApiOrderItem | null;
  rateText: string;
  setRateText: (text: string) => void;
  reasonText: string;
  setReasonText: (text: string) => void;
  dismiss: () => void;
  confirm: () => void;
}

/** The shared "re-rate a line on this order only" behaviour — the prompt, the network call and
 * the toasts, mounted once per order-detail screen (Tables / Token / Takeaway & Delivery) for the
 * same reason useItemQtyEditor is: the rules it enforces are the server's, and three copies would
 * drift the moment one was fixed.
 *
 * What it changes is THIS order's line and nothing else. The menu keeps its own price, so no
 * other bill — already placed or placed tomorrow — moves because one guest was given a rate.
 */
export const useItemPriceEditor = (orderId: number | null): ItemPriceEditor => {
  const dispatch = useDispatch();
  const role = useSelector((s: any) => s.auth.user?.role);
  const updatePrice = useUpdateOrderItemPrice();
  const [item, setItem] = useState<ApiOrderItem | null>(null);
  const [rateText, setRateText] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [pendingItemId, setPendingItemId] = useState<number | null>(null);

  const dismiss = () => {
    setItem(null);
    setRateText('');
    setReasonText('');
  };

  const request = (target: ApiOrderItem) => {
    if (orderId === null) return;
    setItem(target);
    // Prefilled rather than blank: most overrides are a nudge off the catalog rate ("120 ka 100
    // kar do"), and starting from the current figure also shows what's being changed from.
    setRateText(String(target.price));
    setReasonText('');
  };

  const confirm = async () => {
    if (orderId === null || !item) return;
    const rate = parseFloat(rateText);
    if (!Number.isFinite(rate) || rate <= 0) {
      dispatch(showToast({ message: 'Enter a rate greater than zero.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (rate === item.price) { dismiss(); return; }
    const reason = reasonText.trim();
    // Same rule the server enforces, asked up front so the manager isn't bounced by a 400.
    // Only a REDUCTION needs it — that's the direction money leaves the bill in.
    if (rate < item.price && !reason) {
      dispatch(showToast({ message: 'A reason is required to lower an item\'s rate.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }

    const target = item;
    dismiss();
    setPendingItemId(target.id);
    try {
      await updatePrice.mutateAsync({ id: orderId, itemId: target.id, price: rate, reason: reason || undefined });
      dispatch(showToast({
        message: `${target.name} is now ₹${rate} each on this bill — the menu price is unchanged.`,
        icon: 'currency-inr',
        tone: rate < target.price ? 'warning' : 'info',
      }));
    } catch (err) {
      dispatch(showToast({
        message: getApiErrorMessage(err, 'Could not change the rate'),
        icon: 'alert-circle-outline',
        tone: 'danger',
      }));
    } finally {
      setPendingItemId(null);
    }
  };

  return {
    canEdit: canOverrideItemPrice(role),
    request,
    pendingItemId,
    item,
    rateText,
    setRateText,
    reasonText,
    setReasonText,
    dismiss,
    confirm: () => { void confirm(); },
  };
};

/** The per-row "change this line's rate" control, on every order row.
 *
 * A bordered chip showing the LIVE RATE with a pencil, not a bare ₹ glyph. Two reasons, both
 * learned the hard way from the first cut of this:
 *
 * 1. A lone icon says nothing about what it does. The rate written on the chip does — a control
 *    displaying "₹120 ✎" is read as "the rate is 120, tap to change it" without anyone being
 *    told, and it doubles as the price column these rows otherwise lack.
 * 2. It sits next to the destructive remove (✕). Two same-sized icons side by side is a mis-tap
 *    waiting to happen on a busy floor, and the one being mis-tapped voids a line. A wide
 *    labelled chip is a different shape and a different size from a bare ✕, and the margin below
 *    keeps a gap between the two so a thumb aimed at one can't land on the other.
 *
 * Renders nothing at all for a role that can't re-rate, so a waiter's row is exactly the row it
 * was before this existed. */
export const ItemRateButton: React.FC<{
  editor: ItemPriceEditor;
  item: ApiOrderItem;
  /** Paid/cancelled order, or a voided line — history, not something to re-price. */
  disabled?: boolean;
}> = ({ editor, item, disabled }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  if (!editor.canEdit || disabled) return null;
  const pending = editor.pendingItemId === item.id;
  return (
    <Tooltip label="Change rate for this order only" placement="left">
      <TouchableOpacity
        onPress={() => editor.request(item)}
        disabled={pending}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        style={[styles.rateChip, pending && { opacity: 0.5 }]}
      >
        {/* "@" is the till's own shorthand for a per-unit rate, and it's what stops this being
            read as a second line total — on the Tables open-order rows the chip sits right after
            "₹240.00" for the line, where a bare "₹120" would look like the same figure disagreeing
            with itself. "@₹120" next to "₹240.00" reads as 2 at 120, which is what it is. */}
        <Text style={styles.rateChipText}>@₹{item.price}</Text>
        <Icon name="pencil-outline" size={isDesktopWeb ? 10 : 11} color={COLORS.accent} />
      </TouchableOpacity>
    </Tooltip>
  );
};

/** The rate prompt for a single line. Render one per screen, driven by useItemPriceEditor. */
export const ItemRatePrompt: React.FC<{ editor: ItemPriceEditor }> = ({ editor }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const { item, rateText, setRateText, reasonText, setReasonText, dismiss, confirm, pendingItemId } = editor;

  const parsed = parseFloat(rateText);
  const rate = Number.isFinite(parsed) ? parsed : null;
  const lowering = !!item && rate !== null && rate < item.price;
  // The figure that actually settles the argument at the till is the line total, not the rate —
  // "2 × 100" means nothing to a guest until it reads ₹200.
  const newLineTotal = item && rate !== null ? rate * item.qty : null;

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>
            Change rate — {item?.name}
          </Text>
          <Text style={styles.modalLine}>
            Currently ₹{item?.price} each{item && item.qty > 1 ? ` (${item.qty} × ₹${item.price} = ₹${(item.price * item.qty).toFixed(2)})` : ''}.
            This changes THIS order only — the menu price stays as it is.
          </Text>

          <Text style={styles.fieldLabel}>New rate per unit (₹)</Text>
          <TextInput
            style={styles.input}
            value={rateText}
            onChangeText={setRateText}
            keyboardType="decimal-pad"
            selectTextOnFocus
            autoFocus
            placeholder="0.00"
            placeholderTextColor={COLORS.muted}
          />

          {newLineTotal !== null && item && (
            <Text style={styles.previewLine}>
              {item.qty} × ₹{rate} = ₹{newLineTotal.toFixed(2)} on the bill. Tax and the order total are recalculated by the server.
            </Text>
          )}

          {lowering && (
            <>
              <Text style={styles.fieldLabel}>Reason (required to lower a rate)</Text>
              <TextInput
                style={styles.input}
                value={reasonText}
                onChangeText={setReasonText}
                placeholder="e.g. regular customer, quality complaint"
                placeholderTextColor={COLORS.muted}
              />
              <Text style={styles.modalLine}>Logged against this order for review.</Text>
            </>
          )}

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={dismiss}>
              <Text style={styles.modalCancelText}>Keep Rate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirm} disabled={pendingItemId !== null}>
              {pendingItemId !== null
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.modalConfirmText}>Apply Rate</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  // marginRight, not the row's own gap: it opens a deliberate extra gap between this chip and
  // the destructive remove (✕) that follows it, so the two controls can't be confused by a thumb.
  rateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 999,
    backgroundColor: COLORS.cardAlt,
    paddingHorizontal: isDesktopWeb ? 6 : 5,
    paddingVertical: isDesktopWeb ? 1.5 : 3,
    marginRight: isDesktopWeb ? 4 : 5,
    // The row's other controls (qty stepper, status pill, remove) are all fixed-width, so every
    // pixel this chip takes comes straight out of the item name beside it — which is the one
    // thing on the row that has to stay readable. Kept as tight as a legible rate allows.
    flexShrink: 0,
  },
  rateChipText: { fontSize: isDesktopWeb ? 10.5 : 10, fontWeight: '800', color: COLORS.accent },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 20 : 18 },
  modalSheet: { width: '100%', maxWidth: 420, backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 17 : 16.5 },
  modalTitle: { fontSize: isDesktopWeb ? 18 : 14, fontWeight: '800', color: COLORS.heading },
  modalLine: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 7 : 6 },
  fieldLabel: { fontSize: isDesktopWeb ? 12 : 11, fontWeight: '700', color: COLORS.heading, marginBottom: 4 },
  // fontSize 16 on mobile: anything smaller makes iOS Safari zoom the whole page in on focus.
  input: { borderWidth: 1, borderColor: COLORS.divider, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 11 : 10.5, paddingVertical: isDesktopWeb ? 10 : 9, fontSize: isDesktopWeb ? 14 : 16, color: COLORS.heading, marginBottom: isDesktopWeb ? 10 : 9 },
  previewLine: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading, marginBottom: isDesktopWeb ? 10 : 9 },
  modalActions: { flexDirection: 'row', gap: 6, marginTop: 4 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10.5, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalConfirmBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10.5, borderRadius: 6, backgroundColor: COLORS.heading },
  modalConfirmText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
