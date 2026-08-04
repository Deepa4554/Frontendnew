import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, TextInput, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';
import { RADIUS, INPUT_BORDER_WIDTH } from '../../design/commonStyles';

export type PaymentMethod = 'Cash' | 'Card' | 'UPI';
// UPI before Card — the far more common tender at an Indian counter, so it reads first.
export const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card'];
export const METHOD_ICON: Record<PaymentMethod, string> = { Cash: 'cash', Card: 'credit-card-outline', UPI: 'qrcode-scan' };

export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
}

export interface PaymentMethodPickerResult {
  /** One entry when only Cash is in play, 2+ when split across tenders. */
  splits: PaymentSplit[];
  /** True when the entered amount(s) fall short of `owed` on purpose. */
  isPartial: boolean;
  /** False when nothing's ticked, nothing's entered, or the total overshoots `owed`. */
  canSettle: boolean;
}

interface Props {
  /** Amount still owed — every tender's amount is validated against this (under is a
   *  deliberate partial, over is blocked). */
  owed: number;
  /** Fires on mount and on every change — both callers (an existing order's Settle
   *  button in OrderBillActions, Pay First's Settle button in POSCheckoutScreen) read
   *  the latest result at settle time instead of re-deriving this split/partial/
   *  canSettle logic themselves. This is what keeps the payment-method UI identical
   *  everywhere it appears. */
  onChange: (result: PaymentMethodPickerResult) => void;
}

const money = (n: number) => `₹${n.toFixed(2)}`;
// react-native-web renders both TextInput and TouchableOpacity as focusable web elements
// (an <input>, and a <div tabIndex="0">/<button> respectively) — left alone, the browser
// draws its own default focus ring on WHICHEVER of them last received focus, which can look
// like it's outlining an entire row instead of just the one control that's actually active.
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

/**
 * The one payment-method picker used everywhere a bill gets settled — an existing order's
 * bill panel (OrderBillActions) and the Pay First sheet (POSCheckoutScreen, which settles a
 * local cart before the order even exists on the server) both embed this instead of keeping
 * their own separate payment UI. Cash is ticked by default and covers the whole bill; ticking
 * Card/UPI and typing an amount there automatically shrinks Cash's own amount by that much
 * (and unticks Cash once it hits zero), so splitting "₹50 by UPI, rest cash" is one number
 * typed into UPI, not manual mental math on both sides.
 *
 * Cash's own field stays directly editable (unlike Card/UPI's auto-only counterpart doesn't
 * exist here) so it can double as "how much cash was physically handed over" — type 500 for
 * a ₹498 bill and a "Return ₹2" label appears right below; type less than what's still owed
 * and it reads "Due" instead. Whatever's actually applied to the bill (for canSettle/splits)
 * is capped at what's needed, never the raw handed-over figure — the excess is just change,
 * not part of the recorded payment.
 *
 * Owns all of its own state; reports the current split/partial/canSettle via onChange rather
 * than being a controlled input, since neither caller needs to drive its state from outside.
 */
export const PaymentMethodPicker: React.FC<Props> = ({ owed, onChange }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);

  const [selectedMethods, setSelectedMethods] = useState<PaymentMethod[]>(['Cash']);
  const [multiAmounts, setMultiAmounts] = useState<Record<PaymentMethod, string>>({
    Cash: owed > 0 ? owed.toFixed(2) : '', Card: '', UPI: '',
  });
  // Cash's tick state is auto-managed (see the effect below) — auto-ticked when Card/UPI
  // stop covering the whole bill, auto-unticked when they cover it fully — right up until
  // the cashier clicks Cash's own checkbox themselves, in either direction. From that click
  // on, the auto logic backs off entirely and leaves the tick state exactly where the
  // cashier put it (otherwise a manual re-tick right after auto-untick would just get
  // auto-unticked again on the very next render, since the coverage that caused it hasn't
  // changed).
  const [cashTickManual, setCashTickManual] = useState(false);
  // Cash's *amount* is separately auto-managed until the cashier types their own figure into
  // it (representing real cash physically handed over, which can be more than what's owed —
  // see cashApplied/cashChange below). Independent of cashTickManual: typing a number doesn't
  // tick/untick anything, and unticking-then-reticking resets this so it starts fresh.
  const [cashTouched, setCashTouched] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const parsedAmount = (m: PaymentMethod) => parseFloat(multiAmounts[m]) || 0;

  // What's still left for Cash to cover, based on Card/UPI alone — the reference value both
  // the auto-fill and the Return/Due label compare against. Deliberately independent of
  // whatever's actually typed into Cash's own field.
  const cashNeeded = Math.max(0, Math.round((owed - parsedAmount('Card') - parsedAmount('UPI')) * 100) / 100);

  // Keeps Cash's field in sync with cashNeeded (and ticks/unticks it) as Card/UPI change,
  // right up until the cashier types their own number into Cash — then it's theirs to control.
  useEffect(() => {
    if (!cashTouched) setMultiAmounts((a) => ({ ...a, Cash: cashNeeded > 0 ? cashNeeded.toFixed(2) : '' }));
    if (cashTickManual) return;
    setSelectedMethods((sel) => {
      const hasCash = sel.includes('Cash');
      if (cashNeeded > 0 && !hasCash) return [...sel, 'Cash'];
      if (cashNeeded <= 0 && hasCash) return sel.filter((m) => m !== 'Cash');
      return sel;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashNeeded, cashTickManual, cashTouched]);

  // Cash is normally the leg that auto-absorbs the remainder (see cashNeeded above). Once
  // the cashier hand-types a number into Cash itself, OR unticks Cash altogether, that
  // absorbing role has to hand off to another ticked method — otherwise a manual Cash entry
  // just silently overshoots the total, or unticking Cash leaves the balance stranded with
  // nothing covering it, instead of shrinking/filling whichever method now covers the rest
  // of the bill. UPI takes over first (if ticked), Card next; whichever it is recomputes the
  // exact same way Cash used to.
  const flexMethod: PaymentMethod | null = (!cashTouched && selectedMethods.includes('Cash'))
    ? null
    : selectedMethods.includes('UPI') ? 'UPI'
    : selectedMethods.includes('Card') ? 'Card'
    : null;
  const flexNeeded = flexMethod
    ? Math.max(0, Math.round((owed - selectedMethods.filter((m) => m !== flexMethod).reduce((sum, m) => sum + parsedAmount(m), 0)) * 100) / 100)
    : 0;

  useEffect(() => {
    if (!flexMethod) return;
    const next = flexNeeded > 0 ? flexNeeded.toFixed(2) : '';
    setMultiAmounts((a) => (a[flexMethod] === next ? a : { ...a, [flexMethod]: next }));
  }, [flexMethod, flexNeeded]);

  // What was actually typed into Cash (could be more than cashNeeded — real cash handed
  // over, e.g. 500 for a 498 bill) vs. what of that actually counts toward the bill.
  const cashTendered = parsedAmount('Cash');
  const cashApplied = Math.min(cashTendered, cashNeeded);
  const cashChange = Math.max(0, Math.round((cashTendered - cashNeeded) * 100) / 100);
  const cashShort = cashTendered > 0 && cashTendered < cashNeeded - 0.01;
  const cashStillDue = Math.max(0, Math.round((cashNeeded - cashTendered) * 100) / 100);

  // Effective per-method amount used for totals/splits/settlement — every method at face
  // value except Cash, which is capped at what's actually needed (see cashApplied above).
  const effectiveAmount = (m: PaymentMethod) => (m === 'Cash' ? cashApplied : parsedAmount(m));
  const total = selectedMethods.reduce((sum, m) => sum + effectiveAmount(m), 0);
  const balance = Math.round((owed - total) * 100) / 100;
  const fullySettled = selectedMethods.length > 0 && Math.abs(balance) <= 0.01;
  const canSettle = selectedMethods.length > 0 && total > 0 && total - owed <= 0.01;
  const isPartial = total > 0 && total < owed - 0.01;

  const toggleMethod = (m: PaymentMethod) => {
    if (m === 'Cash') {
      const turningOff = selectedMethods.includes('Cash');
      setCashTickManual(true); // any manual click hands full control of the tick to the cashier
      setCashTouched(false); // re-ticking later should start fresh with the auto value again
      setSelectedMethods((sel) => (turningOff ? sel.filter((x) => x !== 'Cash') : [...sel, 'Cash']));
      return;
    }
    setSelectedMethods((sel) => {
      if (sel.includes(m)) {
        setMultiAmounts((a) => ({ ...a, [m]: '' }));
        return sel.filter((x) => x !== m);
      }
      return [...sel, m];
    });
  };
  const updateMethodAmount = (m: PaymentMethod, text: string) => {
    if (m === 'Cash') setCashTouched(true);
    setMultiAmounts((a) => ({ ...a, [m]: text.replace(/[^0-9.]/g, '') }));
  };

  // Report the current pick up to the caller on mount and every change — a ref keeps this
  // from needing `onChange` itself in the dependency array (neither caller memoizes it),
  // while still always calling whatever the latest onChange is.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const splits: PaymentSplit[] = selectedMethods
      .filter((m) => effectiveAmount(m) > 0)
      .map((m) => ({ method: m, amount: effectiveAmount(m) }));
    onChangeRef.current({ splits, isPartial, canSettle });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMethods, multiAmounts, owed]);

  return (
    <>
      <Text style={styles.sectionLabel}>Payment Method</Text>
      <View style={styles.methodCheckRow}>
        {METHODS.map((m) => {
          const checked = selectedMethods.includes(m);
          return (
            <TouchableOpacity
              key={m}
              style={[styles.methodCheckChip, checked && styles.methodCheckChipActive, webNoOutline]}
              onPress={() => toggleMethod(m)}
            >
              <Icon name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'} size={16} color={checked ? COLORS.accent : COLORS.muted} />
              <Icon name={METHOD_ICON[m]} size={15} color={COLORS.heading} />
              <Text style={styles.methodCheckChipText}>{m}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.multiBox}>
        {selectedMethods.length === 0 ? (
          <Text style={styles.adjustmentHint}>Tick at least one payment method above.</Text>
        ) : (
          METHODS.filter((m) => selectedMethods.includes(m)).map((m) => (
            <View key={m}>
              <View style={styles.multiRow}>
                <View style={styles.multiMethodBadge}>
                  <Icon name={METHOD_ICON[m]} size={15} color={COLORS.heading} />
                </View>
                <Text style={styles.multiMethodLabel}>{m}</Text>
                <View style={styles.multiInputWrap}>
                  <TextInput
                    style={[styles.multiInput, focusedField === `multi-${m}` && styles.inputFocused, webNoOutline]}
                    placeholder="0.00"
                    placeholderTextColor={COLORS.placeholder}
                    keyboardType="decimal-pad"
                    value={multiAmounts[m]}
                    onChangeText={(t) => updateMethodAmount(m, t)}
                    onFocus={() => setFocusedField(`multi-${m}`)}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>
              {/* Return/Due — only Cash can meaningfully overshoot (real cash handed over),
                  so this only ever shows on Cash's own row. */}
              {m === 'Cash' && cashTendered > 0 && (cashChange > 0 || cashShort) && (
                <View style={styles.changeRow}>
                  <Text style={styles.billLabel}>{cashShort ? 'Due' : 'Return'}</Text>
                  <Text style={[styles.billVal, cashShort ? styles.danger : styles.warning]}>
                    {money(cashShort ? cashStillDue : cashChange)}
                  </Text>
                </View>
              )}
            </View>
          ))
        )}

        {selectedMethods.length > 0 && (
          <>
            <View style={styles.divider} />
            <View style={styles.billRow}>
              <Text style={[styles.billLabel, styles.positive]}>Paid Amount</Text>
              <Text style={[styles.billVal, styles.positive]}>{money(Math.min(total, owed))}</Text>
            </View>
            <View style={styles.billRow}>
              <View style={styles.billLabelRow}>
                {fullySettled && <Icon name="check-circle" size={13} color={COLORS.success} />}
                <Text style={styles.billLabel}>Balance</Text>
              </View>
              <Text style={[styles.billVal, balance > 0.01 ? styles.warning : balance < -0.01 ? styles.danger : styles.positive]}>
                {money(Math.abs(balance))}{balance < -0.01 ? ' over' : ''}
              </Text>
            </View>
          </>
        )}
      </View>
    </>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.muted, letterSpacing: 0.4,
    textTransform: 'uppercase', marginTop: isDesktopWeb ? 2 : 0,
  },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  billLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  billLabel: { fontSize: isDesktopWeb ? 14 : 12.5, color: COLORS.muted },
  billVal: { fontSize: isDesktopWeb ? 14 : 12.5, color: COLORS.heading, fontWeight: '600' },
  positive: { color: COLORS.success },
  warning: { color: COLORS.warning },
  danger: { color: COLORS.dangerAccent },
  divider: { height: 1, backgroundColor: COLORS.divider, marginVertical: 4 },
  adjustmentHint: { fontSize: 11, color: COLORS.muted },
  // Scoped exactly to the input's own box (see webNoOutline above) — this is the ONLY
  // highlight a focused field should draw, never anything on its surrounding row/card.
  inputFocused: { borderColor: COLORS.accent },
  multiBox: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: RADIUS.card,
    padding: isDesktopWeb ? 12 : 8,
    gap: 7,
  },
  // Sits right under a tender's own row (indented past the method badge/label) rather than
  // in the shared bill-summary block below, so it's visually tied to that one field.
  changeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingLeft: 34, marginTop: -3,
  },
  multiRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  multiMethodBadge: {
    width: 28, height: 28, borderRadius: RADIUS.button, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center', borderWidth: INPUT_BORDER_WIDTH, borderColor: COLORS.divider,
  },
  multiMethodLabel: { width: 36, fontSize: 12, fontWeight: '700', color: COLORS.heading },
  // flex + matching borderRadius live on the wrapper, not the input, so the web build's
  // global focus-ring-on-direct-parent rule rings a box sized to just the input.
  multiInputWrap: { flex: 1, borderRadius: RADIUS.button },
  multiInput: {
    width: '100%',
    borderWidth: INPUT_BORDER_WIDTH,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.button,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.heading,
    backgroundColor: '#FFFFFF',
  },
  methodCheckRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  methodCheckChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: isDesktopWeb ? 9 : 7,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.background,
    borderWidth: INPUT_BORDER_WIDTH,
    borderColor: COLORS.divider,
  },
  methodCheckChipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.successBg },
  methodCheckChipText: { fontSize: 12.5, fontWeight: '700', color: COLORS.heading },
});
