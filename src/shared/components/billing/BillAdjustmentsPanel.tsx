import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';
import { RADIUS, INPUT_BORDER_WIDTH } from '../../design/commonStyles';

/** How a tile's editor behaves:
 *  - percentOrFlat: %/₹ mode toggle + numeric input (Discount, Service Charge)
 *  - flat: numeric input only (Packing/Delivery Charge, Tip)
 *  - signedFlat: +/− sign toggle + numeric input (Round Off)
 *  - text: free-text code input (Coupon, Gift Card)
 *  - points: integer input (Loyalty Points) */
export type AdjustmentEditorKind = 'percentOrFlat' | 'flat' | 'signedFlat' | 'text' | 'points';

export interface AdjustmentTile {
  key: string;
  label: string;
  icon: string;
  amount?: number;
  hidden?: boolean;
  applied?: boolean;
  removable?: boolean;
  kind: AdjustmentEditorKind;
  /** Zero/negative is rejected by default (a "discount" of nothing doesn't mean anything) —
   *  pass true for charges where clearing back to 0 via Apply is a legitimate thing to type. */
  allowZero?: boolean;
  /** Static line shown above the input while this tile's editor is open. */
  hint?: string;
  /** Optional one-tap fill button next to the input (Loyalty's "Max", Round Off's "Auto")
   *  — `sign` additionally flips the +/− toggle for a 'signedFlat' tile, since the
   *  suggested round-off can go either direction depending on the current total. */
  quickFill?: { label: string; value: string; sign?: 'add' | 'sub' };
  /** When set, tapping the tile itself applies (or removes) this exact value directly —
   *  no editor, no typing — instead of opening the %/₹ editor. Used for charges that have
   *  a configured default (Settings → Auto Charges' Service/Packing/Delivery), so the tile
   *  behaves like a plain on/off toggle for the common case. The %/₹ editor is still
   *  reachable for a one-off custom amount via the pencil-edit icon on the Bill Summary
   *  row (OrderBillActions), which calls onToggle directly rather than going through here. */
  quickToggleValue?: AdjustmentApplyValue;
}

export interface AdjustmentApplyValue {
  /** Set for kind 'percentOrFlat' when mode is '%'. */
  pct?: number;
  /** Set for kind 'flat'/'signedFlat'/'points', or 'percentOrFlat' when mode is '₹'. Already
   *  sign-adjusted for 'signedFlat' (negative when the '−' toggle was active). */
  amount?: number;
  /** Set for kind 'text'. */
  text?: string;
}

interface Props {
  tiles: AdjustmentTile[];
  /** Which tile's editor is open — controlled by the caller so a pencil-edit icon
   *  elsewhere on the bill (e.g. next to an already-applied "Bill Discount" row in
   *  OrderBillActions' breakdown) can open the same editor as tapping the tile itself. */
  openKey: string | null;
  onToggle: (key: string) => void;
  pending?: boolean;
  onApply: (key: string, value: AdjustmentApplyValue) => void;
  onRemove: (key: string) => void;
  onWarn: (message: string) => void;
}

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

/**
 * The "Adjustments & Services" tile grid + editor — one tile per adjustment (Discount,
 * Coupon, Gift Card, Loyalty Points, Service/Packing/Delivery Charge, Tip, Round Off),
 * tap to open a %/₹ (or +/−, or text) editor row below. Used by both OrderBillActions (an
 * existing order, each tile backed by its own server mutation) and POSCheckoutScreen's Pay
 * First sheet (a local cart, Discount/Service/Packing/Delivery/Tip/Round Off only — Coupon/
 * Gift Card/Loyalty need a real order+customer to redeem against, which a not-yet-created
 * Pay First order doesn't have yet) — this is what keeps the tile UI identical either way
 * instead of Pay First growing its own bespoke discount-only version.
 */
export const BillAdjustmentsPanel: React.FC<Props> = ({ tiles, openKey, onToggle, pending = false, onApply, onRemove, onWarn }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);

  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'pct' | 'flat'>('pct');
  const [sign, setSign] = useState<'add' | 'sub'>('sub');
  const [focused, setFocused] = useState(false);

  const openTile = tiles.find((t) => t.key === openKey) ?? null;
  const isTextKind = openTile?.kind === 'text';
  const isPointsKind = openTile?.kind === 'points';

  // Whichever tile just opened (tap on the tile itself, or a pencil-edit icon elsewhere
  // on the bill) always starts from a clean editor rather than whatever was last typed.
  useEffect(() => {
    setInput('');
    setMode('pct');
    setSign('sub');
  }, [openKey]);

  const applyQuickFill = () => {
    if (!openTile?.quickFill) return;
    setInput(openTile.quickFill.value);
    if (openTile.quickFill.sign) setSign(openTile.quickFill.sign);
  };

  const handleApply = () => {
    if (!openTile) return;
    if (openTile.kind === 'text') {
      if (!input.trim()) { onWarn(`Enter a ${openTile.label.toLowerCase()}.`); return; }
      onApply(openTile.key, { text: input.trim() });
    } else {
      const val = openTile.kind === 'points' ? parseInt(input, 10) : parseFloat(input);
      const minOk = openTile.allowZero ? val >= 0 : val > 0;
      if (isNaN(val) || !minOk) {
        onWarn(openTile.kind === 'points' ? 'Enter how many points to redeem.' : openTile.allowZero ? 'Enter a valid amount.' : `Enter a valid ${openTile.label.toLowerCase()}.`);
        return;
      }
      if (openTile.kind === 'percentOrFlat') onApply(openTile.key, mode === 'pct' ? { pct: val } : { amount: val });
      else if (openTile.kind === 'signedFlat') onApply(openTile.key, { amount: sign === 'sub' ? -val : val });
      else onApply(openTile.key, { amount: val });
    }
  };

  const handleTilePress = (t: AdjustmentTile) => {
    if (t.quickToggleValue) {
      if (pending) return;
      if (t.applied) onRemove(t.key);
      else onApply(t.key, t.quickToggleValue);
      return;
    }
    onToggle(t.key);
  };

  return (
    <>
      <Text style={styles.sectionLabel}>Adjustments & Services</Text>
      <View style={styles.tileGrid}>
        {tiles.filter((t) => !t.hidden).map((t) => {
          // A quick-toggle tile's own tap already applies/removes it — the corner "x" would
          // just be a second way to do the same thing, so only the editor-flow tiles show it.
          const removable = t.applied && t.removable && !t.quickToggleValue;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tile, t.applied && styles.tileApplied, openKey === t.key && styles.tileOpen, webNoOutline]}
              onPress={() => handleTilePress(t)}
              disabled={(!!t.applied && !t.removable) || (pending && !!t.quickToggleValue)}
            >
              {removable && (
                <TouchableOpacity
                  style={[styles.tileRemove, webNoOutline]}
                  onPress={() => onRemove(t.key)}
                  disabled={pending}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Icon name="close" size={11} color="#FFFFFF" />
                </TouchableOpacity>
              )}
              <Icon name={t.icon} size={isDesktopWeb ? 16 : 14} color={t.applied ? COLORS.success : COLORS.accent} />
              <Text style={[styles.tileLabel, t.applied && styles.tileLabelApplied]} numberOfLines={1}>{t.label}</Text>
              {t.applied && !!t.amount && <Text style={styles.tileAmount} numberOfLines={1}>₹{t.amount.toFixed(2)}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {openTile && (
        <View style={styles.adjustmentEditor}>
          {openTile.hint && <Text style={styles.adjustmentHint}>{openTile.hint}</Text>}
          <View style={styles.adjustmentRow}>
            {openTile.kind === 'percentOrFlat' && (
              <View style={styles.modeToggle}>
                <TouchableOpacity style={[styles.modeBtn, mode === 'pct' && styles.modeBtnActive, webNoOutline]} onPress={() => setMode('pct')}>
                  <Text style={[styles.modeBtnText, mode === 'pct' && styles.modeBtnTextActive]}>%</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modeBtn, mode === 'flat' && styles.modeBtnActive, webNoOutline]} onPress={() => setMode('flat')}>
                  <Text style={[styles.modeBtnText, mode === 'flat' && styles.modeBtnTextActive]}>₹</Text>
                </TouchableOpacity>
              </View>
            )}
            {openTile.kind === 'signedFlat' && (
              <View style={styles.modeToggle}>
                <TouchableOpacity style={[styles.modeBtn, sign === 'sub' && styles.modeBtnActive, webNoOutline]} onPress={() => setSign('sub')}>
                  <Text style={[styles.modeBtnText, sign === 'sub' && styles.modeBtnTextActive]}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modeBtn, sign === 'add' && styles.modeBtnActive, webNoOutline]} onPress={() => setSign('add')}>
                  <Text style={[styles.modeBtnText, sign === 'add' && styles.modeBtnTextActive]}>+</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.adjustmentInputWrap}>
              <TextInput
                style={[styles.adjustmentInput, focused && styles.inputFocused, webNoOutline]}
                placeholder={isTextKind ? `${openTile.label} code` : isPointsKind ? 'Points to redeem' : '0.00'}
                placeholderTextColor={COLORS.placeholder}
                autoCapitalize={isTextKind ? 'characters' : 'none'}
                keyboardType={isTextKind ? 'default' : isPointsKind ? 'number-pad' : 'decimal-pad'}
                value={input}
                onChangeText={isTextKind ? setInput : (t) => setInput(t.replace(/[^0-9.]/g, ''))}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onSubmitEditing={handleApply}
                returnKeyType="done"
                autoFocus
              />
            </View>
            {openTile.quickFill && (
              <TouchableOpacity style={[styles.adjustmentQuickBtn, webNoOutline]} onPress={applyQuickFill}>
                <Text style={styles.adjustmentQuickBtnText}>{openTile.quickFill.label}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.adjustmentApplyBtn, webNoOutline]} onPress={handleApply} disabled={pending}>
              {pending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.adjustmentApplyBtnText}>Apply</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.muted, letterSpacing: 0.4,
    textTransform: 'uppercase', marginTop: isDesktopWeb ? 2 : 0,
  },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 6 : 5 },
  tile: {
    flexBasis: '18%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: isDesktopWeb ? 9 : 6,
    paddingHorizontal: 3,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.background,
    borderWidth: INPUT_BORDER_WIDTH,
    borderColor: COLORS.divider,
  },
  tileApplied: { backgroundColor: COLORS.successBg, borderColor: COLORS.success },
  tileOpen: { borderColor: COLORS.accent, borderWidth: INPUT_BORDER_WIDTH + 0.5 },
  tileRemove: {
    position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9,
    backgroundColor: COLORS.dangerAccent, alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  tileLabel: { fontSize: isDesktopWeb ? 10.5 : 9.5, fontWeight: '700', color: COLORS.heading, textAlign: 'center' },
  tileLabelApplied: { color: COLORS.success },
  tileAmount: { fontSize: isDesktopWeb ? 11 : 10, fontWeight: '800', color: COLORS.success },
  adjustmentEditor: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: RADIUS.card,
    padding: isDesktopWeb ? 12 : 8,
    gap: 6,
  },
  adjustmentHint: { fontSize: 11, color: COLORS.muted },
  adjustmentRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  modeToggle: { flexDirection: 'row', flexShrink: 0, borderRadius: RADIUS.button, overflow: 'hidden', borderWidth: INPUT_BORDER_WIDTH, borderColor: COLORS.divider },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: COLORS.background },
  modeBtnActive: { backgroundColor: COLORS.button },
  modeBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.heading },
  modeBtnTextActive: { color: '#FFFFFF' },
  adjustmentInputWrap: { flex: 1, minWidth: 90, borderRadius: RADIUS.button },
  adjustmentInput: {
    width: '100%',
    borderWidth: INPUT_BORDER_WIDTH,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.button,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    color: COLORS.heading,
    backgroundColor: '#FFFFFF',
  },
  inputFocused: { borderColor: COLORS.accent },
  adjustmentQuickBtn: { flexShrink: 0, paddingHorizontal: 10, paddingVertical: 8, borderRadius: RADIUS.button, backgroundColor: COLORS.cardAlt, borderWidth: INPUT_BORDER_WIDTH, borderColor: COLORS.divider },
  adjustmentQuickBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  adjustmentApplyBtn: { flexShrink: 0, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.button, backgroundColor: COLORS.button },
  adjustmentApplyBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
