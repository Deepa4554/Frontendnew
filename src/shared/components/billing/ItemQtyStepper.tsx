import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, TextInput } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';

interface Props {
  qty: number;
  /** Called with the line's FINAL quantity, never a delta — matches ordersApi.updateItemQty.
   * Only fires when the value actually changed. */
  onChange: (qty: number) => void;
  /** Read-only: renders as the plain "3×" label the rows used before, no controls. A paid or
   * cancelled order, or a line whose units are all served, has nothing left to edit. */
  disabled?: boolean;
  /** A write is in flight. The control dims but keeps showing the number and stays readable —
   * the quantity is already updated optimistically (see useUpdateOrderItemQty), so hiding it
   * behind a spinner would replace a correct answer with a wait. */
  pending?: boolean;
  /** Floor for the `−` button. Below this it's disabled and the guard belongs to the caller
   * (dropping a line to 0 is a remove, which has its own rules and confirmation). */
  min?: number;
}

/** The `−  3  +` quantity control on an order line, shared by every order-type screen
 * (Tables / Token / Takeaway & Delivery) so a correction behaves identically wherever staff
 * happen to be standing.
 *
 * Tapping the number turns it into a numeric field — going from 1 to 12 shouldn't cost eleven
 * taps. The typed value is committed on blur/submit and only then sent upstream; an empty or
 * junk entry falls back to the current quantity rather than 0, since 0 means "remove this line"
 * and that is deliberately not something a mistyped keystroke can trigger.
 */
export const ItemQtyStepper: React.FC<Props> = ({ qty, onChange, disabled, pending, min = 1 }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(qty));
  // Guards the double-commit React Native fires on web when submitEditing is followed by the
  // blur that focus loss causes — the second one would re-send an already-applied quantity.
  const committedRef = useRef(false);

  // What the row shows, which runs ahead of `qty` between a tap and the request that follows it.
  // Going 1 → 4 is three taps a second apart; each one used to be its own round trip to a database
  // that answers from another continent, with the button dead in between. Now the taps land
  // locally and only the number they settle on is sent.
  const [localQty, setLocalQty] = useState(qty);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The server's own figure, read inside the timer below — the closure that schedules it would
  // otherwise compare against whatever `qty` was at tap time.
  const serverQtyRef = useRef(qty);
  serverQtyRef.current = qty;

  // A server correction (or another device's edit) landing while this row is open must win over
  // whatever half-typed text is sitting in the field — but not over taps still settling.
  useEffect(() => {
    if (settleTimerRef.current) return;
    setLocalQty(qty);
    if (!editing) setDraft(String(qty));
  }, [qty, editing]);

  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
  }, []);

  if (disabled) return <Text style={styles.plainQty}>{qty}×</Text>;

  /** Shows `next` at once and sends it only once the tapping stops. */
  const settle = (next: number, delayMs: number) => {
    setLocalQty(next);
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      if (next !== serverQtyRef.current) onChange(next);
    }, delayMs);
  };

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    setEditing(false);
    const parsed = parseInt(draft, 10);
    const next = Number.isFinite(parsed) ? Math.max(min, parsed) : serverQtyRef.current;
    setDraft(String(next));
    // Typed straight in — the figure is already final, so there's nothing to wait for.
    settle(next, 0);
  };

  const step = (delta: number) => {
    const next = Math.max(min, localQty + delta);
    if (next !== localQty) settle(next, 450);
  };

  return (
    <View style={[styles.stepper, pending && styles.stepperPending]}>
      <TouchableOpacity
        style={styles.stepBtn}
        onPress={() => step(-1)}
        disabled={localQty <= min}
        hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
      >
        <Icon name="minus" size={12} color={localQty <= min ? COLORS.divider : COLORS.heading} />
      </TouchableOpacity>

      {editing ? (
        <TextInput
          style={[styles.qtyValueBox, styles.qtyInput]}
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          selectTextOnFocus
          autoFocus
          maxLength={3}
        />
      ) : (
        <TouchableOpacity
          style={styles.qtyValueBox}
          onPress={() => {
            committedRef.current = false;
            setDraft(String(localQty));
            setEditing(true);
          }}
        >
          <Text style={styles.qtyValueText}>{localQty}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.stepBtn}
        onPress={() => step(1)}
        hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
      >
        <Icon name="plus" size={12} color={COLORS.heading} />
      </TouchableOpacity>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  // Same width the plain "3×" column reserved, so swapping one for the other doesn't reflow
  // the item name beside it.
  plainQty: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading, width: 30 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 999,
    backgroundColor: COLORS.cardAlt,
  },
  stepperPending: { opacity: 0.5 },
  // Deliberately smaller than a comfortable 44pt touch target: this control shares a cramped
  // row with the item name, and every pixel it gives up goes to the one thing on the row that
  // has to stay readable. The hitSlop on each button below is what keeps them tappable — the
  // reachable area is unchanged, only the drawn box shrank.
  // Narrower than tall on purpose: width is the scarce dimension on these rows (it's what the
  // item name competes for), height costs nothing — so the buttons lose width and keep their
  // height, which is also what keeps them comfortable to hit with a thumb.
  stepBtn: { width: isDesktopWeb ? 18 : 17, height: isDesktopWeb ? 22 : 21, alignItems: 'center', justifyContent: 'center' },
  qtyValueBox: { minWidth: 18, height: isDesktopWeb ? 22 : 21, alignItems: 'center', justifyContent: 'center' },
  qtyValueText: { fontSize: isDesktopWeb ? 12 : 11, fontWeight: '800', color: COLORS.heading },
  // fontSize 16 on mobile: anything smaller makes iOS Safari zoom the whole page in on focus.
  // It's the one number here that did NOT shrink with the rest of the control — a slightly
  // oversized field while typing costs far less than the whole page zooming.
  qtyInput: {
    fontSize: isDesktopWeb ? 12 : 16,
    fontWeight: '800',
    color: COLORS.heading,
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: 2,
    minWidth: 26,
  },
});
