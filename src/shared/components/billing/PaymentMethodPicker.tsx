import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, TextInput, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';
import { RADIUS, INPUT_BORDER_WIDTH } from '../../design/commonStyles';
import { CustomerLookupBadge } from './CustomerLookupBadge';

export type PaymentMethod = 'Cash' | 'Card' | 'UPI' | 'Due' | 'Complimentary';
// UPI before Card — the far more common tender at an Indian counter, so it reads first.
// Due next-to-last, Complimentary last: both are exceptions, not everyday tenders — and
// Complimentary is the rarer, more deliberate one of the two.
export const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Due', 'Complimentary'];
export const METHOD_ICON: Record<PaymentMethod, string> = { Cash: 'cash', Card: 'credit-card-outline', UPI: 'qrcode-scan', Due: 'notebook-outline', Complimentary: 'gift-outline' };

export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
}

export interface PaymentMethodPickerResult {
  /** One entry when only Cash is in play, 2+ when split across tenders. */
  splits: PaymentSplit[];
  /** True when the entered amount(s) fall short of `owed` on purpose. */
  isPartial: boolean;
  /** False when nothing's ticked, nothing's entered, the total overshoots `owed`, or a Due
   *  leg is in play without a name and 10-digit mobile to hang the khata on. */
  canSettle: boolean;
  /** How much of the settle is going on the customer's khata rather than into the till.
   *  Zero on an ordinary bill. */
  dueAmount: number;
  /** Only filled while a Due leg is in play — the name/number typed into the khata fields
   *  below, which the caller passes straight to ordersApi.pay (see PayOptions). Trimmed and
   *  digits-only respectively; both are guaranteed non-empty whenever canSettle is true and
   *  dueAmount > 0. */
  guestName: string;
  guestPhone: string;
  /** How much of the settle is being written off on the "Complimentary" tender — real
   *  revenue, zero. Zero on an ordinary bill. */
  compAmount: number;
  /** The mandatory reason typed in while a Complimentary leg is in play, passed straight to
   *  ordersApi.pay's PayOptions.complimentaryReason. Trimmed; guaranteed non-empty whenever
   *  canSettle is true and compAmount > 0. */
  complimentaryReason: string;
}

interface Props {
  /** Amount still owed — every tender's amount is validated against this (under is a
   *  deliberate partial, over is blocked). */
  owed: number;
  /** Prefill for the khata fields shown when Due is ticked — pass whatever the order
   *  already has on file, so a bill rung up under a real name doesn't ask for it twice. */
  guestName?: string | null;
  guestPhone?: string | null;
  /** Shows the Complimentary chip at all — Owner/Manager only (see
   *  permissions.canMarkComplimentary), since it writes the bill off for zero. A Waiter/
   *  Cashier never sees the option, same as the Bill Discount action. Defaults to false so a
   *  caller that forgets to pass it fails closed rather than open. */
  allowComplimentary?: boolean;
  /** What would still be owed if this bill ended up settled on a tender the cafe charges no
   *  tax on. Pass it together with `taxableModes` when the cafe has "tax by payment mode" on
   *  (see the Tax & GST screen); leave both out — or pass the same figure as `owed` — and this
   *  picker behaves exactly as it always did. Its only job is to let the amounts on screen
   *  follow the tender BEFORE the settle, so a cashier never types a figure the server is
   *  about to recompute out from under them. */
  taxFreeOwed?: number;
  /** Which tenders carry tax. Undefined means every tender does. Mirrors the server's rule in
   *  PaymentModeTax: if ANY ticked tender is taxable, the whole bill is taxed — tax sits per
   *  line at its own slab, so it can't be apportioned across a split. */
  taxableModes?: PaymentMethod[];
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
 * their own separate payment UI. UPI is ticked by default and covers the whole bill; whichever
 * other tender gets ticked and typed into, the remainder-absorbing leg recalculates itself
 * (Cash absorbs it while it's ticked and untyped-in, otherwise UPI then Card take the role —
 * see flexMethod), so splitting "₹50 cash, rest UPI" is one number typed into Cash, not manual
 * mental math on both sides.
 *
 * Cash's own field stays directly editable (unlike Card/UPI's auto-only counterpart doesn't
 * exist here) so it can double as "how much cash was physically handed over" — on a cash-only
 * bill, type 500 for a ₹498 one and a "Return ₹2" label appears right below; type less than
 * what's still owed and it reads "Due" instead. Whatever's actually applied to the bill (for canSettle/splits)
 * is capped at what's needed, never the raw handed-over figure — the excess is just change,
 * not part of the recorded payment.
 *
 * Due (udhaar) and Complimentary are the odd ones out: both settle the bill without any money
 * changing hands. Due parks the amount on the customer's khata instead, to be collected later
 * from the Khatabook screen — because that debt has to be attached to someone the cafe can
 * actually come back to, ticking Due reveals a name + mobile pair right underneath it and
 * blocks canSettle until both are filled. Complimentary simply writes the amount off — Owner/
 * Manager only (see `allowComplimentary`), and blocks canSettle until a reason is typed.
 * Neither is ever auto-filled (nothing should quietly land on a customer's khata or get
 * written off); each has its own one-tap "Rest"/"Waive Rest" button to put whatever hasn't
 * been tendered onto it.
 *
 * Owns all of its own state; reports the current split/partial/canSettle via onChange rather
 * than being a controlled input, since neither caller needs to drive its state from outside.
 */
export const PaymentMethodPicker: React.FC<Props> = ({ owed: fullOwed, taxFreeOwed, taxableModes, guestName, guestPhone, allowComplimentary = false, onChange }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);

  // UPI is the default tender — it's what most counters actually take, so the common case
  // settles without touching the picker at all.
  const [selectedMethods, setSelectedMethods] = useState<PaymentMethod[]>(['UPI']);
  const [multiAmounts, setMultiAmounts] = useState<Record<PaymentMethod, string>>({
    Cash: '', Card: '', UPI: fullOwed > 0 ? fullOwed.toFixed(2) : '', Due: '', Complimentary: '',
  });
  // Who the khata belongs to, seeded from whatever the order already knows. Kept here rather
  // than in the caller so both entry points (an existing order's bill panel, POS's Pay First
  // sheet, which has no server order yet) get the identical compulsory-fields behaviour.
  const [khataName, setKhataName] = useState(guestName ?? '');
  const [khataPhone, setKhataPhone] = useState(guestPhone ?? '');
  // Why this bill is being written off — compulsory whenever Complimentary is ticked (see
  // reasonReady below), mirroring khataName/khataPhone's role for Due.
  const [complimentaryReason, setComplimentaryReason] = useState('');
  // Chips actually offered — Complimentary is filtered out entirely for anyone without the
  // permission, rather than shown-but-disabled, so a Waiter never even learns it exists.
  const visibleMethods = allowComplimentary ? METHODS : METHODS.filter((m) => m !== 'Complimentary');
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

  // How much of the bill is tax that this cafe wouldn't charge on a non-taxable tender (see
  // the taxFreeOwed prop). Zero — and everything below it inert — for every cafe that hasn't
  // switched the setting on, which is the overwhelmingly common case.
  const taxDrop = taxableModes && taxFreeOwed !== undefined
    ? Math.max(0, Math.round((fullOwed - taxFreeOwed) * 100) / 100)
    : 0;
  // Nothing ticked yet reads as "taxed", matching the server (PaymentModeTax.AppliesTo): an
  // order that hasn't been tendered against shows the tax it was rung up with.
  const taxCharged = taxDrop <= 0 || selectedMethods.length === 0
    || selectedMethods.some((m) => taxableModes!.includes(m));
  // Everything below — the auto-filled amounts, the balance, canSettle — works off THIS, not
  // the prop, so ticking Cash on a cash-untaxed bill shrinks the amounts on screen the same
  // instant it shrinks the bill the server will settle.
  const owed = taxCharged ? fullOwed : Math.max(0, Math.round((fullOwed - taxDrop) * 100) / 100);

  const parsedAmount = (m: PaymentMethod) => parseFloat(multiAmounts[m]) || 0;

  // What's still left for Cash to cover, based on every other tender — the reference value
  // both the auto-fill and the Return/Short label compare against. Deliberately independent
  // of whatever's actually typed into Cash's own field.
  const cashNeeded = Math.max(0, Math.round((owed - parsedAmount('Card') - parsedAmount('UPI') - parsedAmount('Due') - parsedAmount('Complimentary')) * 100) / 100);

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
  //
  // Due and Complimentary are deliberately absent from this chain: a tender that auto-grows
  // to swallow whatever hasn't been paid is exactly the wrong behaviour for one that puts a
  // customer in debt, or one that writes real food off for free. Each only ever holds what
  // the cashier typed, or what its own "Rest"/"Waive Rest" shortcut put there.
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
  const isPartial = total > 0 && total < owed - 0.01;

  const dueOn = selectedMethods.includes('Due');
  const dueAmount = dueOn ? parsedAmount('Due') : 0;
  const trimmedName = khataName.trim();
  const digitsPhone = khataPhone.replace(/\D/g, '');
  // The compulsory half of a khata: a debt nobody can be identified against isn't a ledger,
  // it's a write-off. Mirrors the same rule the server enforces in RecordKhataDueAsync, so a
  // cashier finds out here rather than via a rejected settle.
  const khataReady = trimmedName.length > 0 && digitsPhone.length === 10;

  const compOn = selectedMethods.includes('Complimentary');
  const compAmount = compOn ? parsedAmount('Complimentary') : 0;
  const trimmedReason = complimentaryReason.trim();
  // The compulsory half of a write-off: the server rejects a Complimentary leg with no reason
  // outright (see OrdersController.Pay), so a cashier finds out here instead.
  const reasonReady = trimmedReason.length > 0;

  const canSettle =
    selectedMethods.length > 0 &&
    total > 0 &&
    total - owed <= 0.01 &&
    // A Due leg has to bring the bill to a full settle: whatever isn't tendered has already
    // moved onto the khata, so leaving the order short as well would owe the same rupees in
    // two places. The server rejects this combination outright (see OrdersController.Pay).
    !(dueAmount > 0 && isPartial) &&
    (dueAmount <= 0 || khataReady) &&
    (compAmount <= 0 || reasonReady);

  // What "Rest on khata" fills Due with — everything the cashier has actually committed to
  // collecting, subtracted from the bill. The auto-absorbing leg is excluded on purpose: its
  // number is a placeholder that exists only to make the bill add up, and it recomputes itself
  // down to zero the moment Due takes the amount over.
  const absorbingMethod: PaymentMethod | null =
    !cashTouched && selectedMethods.includes('Cash') ? 'Cash' : flexMethod;
  const restForKhata = Math.max(0, Math.round((owed - selectedMethods
    .filter((m) => m !== 'Due' && m !== absorbingMethod)
    .reduce((sum, m) => sum + effectiveAmount(m), 0)) * 100) / 100);
  // Same shortcut for Complimentary's "Waive Rest" — everything not yet covered by another
  // ticked tender, excluding Complimentary's own placeholder amount.
  const restForComplimentary = Math.max(0, Math.round((owed - selectedMethods
    .filter((m) => m !== 'Complimentary' && m !== absorbingMethod)
    .reduce((sum, m) => sum + effectiveAmount(m), 0)) * 100) / 100);

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
    onChangeRef.current({
      splits, isPartial, canSettle, dueAmount, guestName: trimmedName, guestPhone: digitsPhone,
      compAmount, complimentaryReason: trimmedReason,
    });
    // khataName/khataPhone/complimentaryReason are in here (unlike a plain amount change)
    // because canSettle itself flips on them — without that the Settle button stays disabled
    // until some unrelated edit happens to re-report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMethods, multiAmounts, owed, khataName, khataPhone, complimentaryReason]);

  return (
    <>
      <Text style={styles.sectionLabel}>Payment Method</Text>
      <View style={styles.methodCheckRow}>
        {visibleMethods.map((m) => {
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
          visibleMethods.filter((m) => selectedMethods.includes(m)).map((m) => (
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
                {/* Due is the one tender that never fills itself in (see flexMethod) — this
                    is the one-tap stand-in for that, and covers both common shapes: whole
                    bill on credit, or "₹200 now, rest on khata". */}
                {m === 'Due' && restForKhata > 0 && (
                  <TouchableOpacity
                    style={[styles.restBtn, webNoOutline]}
                    onPress={() => updateMethodAmount('Due', restForKhata.toFixed(2))}
                  >
                    <Text style={styles.restBtnText}>Rest</Text>
                  </TouchableOpacity>
                )}
                {/* Complimentary never fills itself in either, for the same reason Due
                    doesn't — nothing should quietly get written off. */}
                {m === 'Complimentary' && restForComplimentary > 0 && (
                  <TouchableOpacity
                    style={[styles.restBtn, webNoOutline]}
                    onPress={() => updateMethodAmount('Complimentary', restForComplimentary.toFixed(2))}
                  >
                    <Text style={styles.restBtnText}>Waive Rest</Text>
                  </TouchableOpacity>
                )}
              </View>
              {/* Return/Short — only Cash can meaningfully overshoot (real cash handed over),
                  so this only ever shows on Cash's own row. "Short" rather than "Due", which
                  now names an actual tender one row below. */}
              {m === 'Cash' && cashTendered > 0 && (cashChange > 0 || cashShort) && (
                <View style={styles.changeRow}>
                  <Text style={styles.billLabel}>{cashShort ? 'Short' : 'Return'}</Text>
                  <Text style={[styles.billVal, cashShort ? styles.danger : styles.warning]}>
                    {money(cashShort ? cashStillDue : cashChange)}
                  </Text>
                </View>
              )}
              {/* Whose khata this goes on. Compulsory, and shown right under the Due amount
                  rather than in a separate dialog, so it reads as part of choosing the tender
                  instead of a hurdle that appears after the cashier thinks they're done. */}
              {m === 'Due' && (
                <View style={styles.khataBox}>
                  <Text style={styles.khataHint}>
                    {khataReady
                      ? 'This bill goes on their khata — collect it later from Khatabook.'
                      : 'Name and mobile number are required — the khata is looked up by the number.'}
                  </Text>
                  <TextInput
                    style={[styles.khataInput, focusedField === 'khata-name' && styles.inputFocused, webNoOutline]}
                    placeholder="Customer name"
                    placeholderTextColor={COLORS.placeholder}
                    value={khataName}
                    onChangeText={setKhataName}
                    onFocus={() => setFocusedField('khata-name')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TextInput
                    style={[styles.khataInput, focusedField === 'khata-phone' && styles.inputFocused, webNoOutline]}
                    placeholder="10-digit mobile number"
                    placeholderTextColor={COLORS.placeholder}
                    keyboardType="number-pad"
                    maxLength={10}
                    value={khataPhone}
                    onChangeText={(t) => setKhataPhone(t.replace(/\D/g, '').slice(0, 10))}
                    onFocus={() => setFocusedField('khata-phone')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <CustomerLookupBadge phone={khataPhone} />
                </View>
              )}
              {/* Why this bill is being written off. Compulsory, shown right under the
                  Complimentary amount for the same reason Due's khata fields sit under its —
                  it reads as part of choosing the tender, not a hurdle that shows up later. */}
              {m === 'Complimentary' && (
                <View style={styles.khataBox}>
                  <Text style={styles.khataHint}>
                    {reasonReady
                      ? 'This much is written off — it never counts as revenue in reports.'
                      : 'A reason is required — e.g. "Owner\'s guest", "Staff meal", "Complaint".'}
                  </Text>
                  <TextInput
                    style={[styles.khataInput, focusedField === 'complimentary-reason' && styles.inputFocused, webNoOutline]}
                    placeholder="Reason"
                    placeholderTextColor={COLORS.placeholder}
                    value={complimentaryReason}
                    onChangeText={setComplimentaryReason}
                    onFocus={() => setFocusedField('complimentary-reason')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              )}
            </View>
          ))
        )}

        {selectedMethods.length > 0 && (
          <>
            <View style={styles.divider} />
            {/* Why the bill just changed. Only ever shown by a cafe that bills tax per tender,
                and only while the ticked tenders actually take it off — otherwise the amounts
                would appear to move on their own the moment UPI gets unticked. */}
            {taxDrop > 0 && !taxCharged && (
              <View style={styles.billRow}>
                <View style={styles.billLabelRow}>
                  <Icon name="percent-outline" size={13} color={COLORS.warning} />
                  <Text style={[styles.billLabel, styles.warning]}>Tax not charged on this tender</Text>
                </View>
                <Text style={[styles.billVal, styles.warning]}>−{money(taxDrop)}</Text>
              </View>
            )}
            <View style={styles.billRow}>
              <Text style={[styles.billLabel, styles.positive]}>Paid Amount</Text>
              {/* Money actually collected — a Due leg and a Complimentary leg are deliberately
                  NOT part of this, they're each broken out on their own row below. That split
                  is the whole point of both tenders: neither one ever counts as paid. */}
              <Text style={[styles.billVal, styles.positive]}>{money(Math.max(0, Math.min(total, owed) - dueAmount - compAmount))}</Text>
            </View>
            {dueAmount > 0 && (
              <View style={styles.billRow}>
                <View style={styles.billLabelRow}>
                  <Icon name="notebook-outline" size={13} color={COLORS.warning} />
                  <Text style={[styles.billLabel, styles.warning]}>On Khata</Text>
                </View>
                <Text style={[styles.billVal, styles.warning]}>{money(dueAmount)}</Text>
              </View>
            )}
            {compAmount > 0 && (
              <View style={styles.billRow}>
                <View style={styles.billLabelRow}>
                  <Icon name="gift-outline" size={13} color={COLORS.accent} />
                  <Text style={[styles.billLabel, styles.warning]}>Complimentary</Text>
                </View>
                <Text style={[styles.billVal, styles.warning]}>{money(compAmount)}</Text>
              </View>
            )}
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
  // Sits inside the Due row, after its amount field — a shortcut on that one control, not a
  // bill-level action, so it's deliberately small and unfilled rather than a proper button.
  restBtn: {
    paddingHorizontal: 9,
    paddingVertical: isDesktopWeb ? 9 : 7,
    borderRadius: RADIUS.button,
    borderWidth: INPUT_BORDER_WIDTH,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.background,
  },
  restBtnText: { fontSize: 11.5, fontWeight: '800', color: COLORS.heading },
  // Indented past the method badge like the Cash change row, so it reads as belonging to
  // Due's row rather than to the bill summary underneath.
  khataBox: { paddingLeft: 34, gap: 5, marginTop: 4 },
  khataHint: { fontSize: 11, lineHeight: 15, color: COLORS.muted },
  khataInput: {
    borderWidth: INPUT_BORDER_WIDTH,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.button,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.heading,
    backgroundColor: '#FFFFFF',
  },
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
