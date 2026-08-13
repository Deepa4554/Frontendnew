import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, TextInput, Switch } from 'react-native';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';
import { VoidReasonCode } from '../../../core/api/ordersApi';

export type { VoidReasonCode };

/** The fixed list, in tap order. `neverMade` is only a DEFAULT for the "kitchen never made it"
 * switch, not a rule: it's what that reason usually implies, and the staff member can always
 * disagree. The two axes really are independent — a guest can send back a dish that was never
 * cooked, and a mis-tap can land on one that was. Only the switch decides stock; the code is
 * just the cafe's why, kept for grouping in reports. */
export const VOID_REASONS: { code: VoidReasonCode; label: string; neverMade: boolean }[] = [
  { code: 'MisTappedServed', label: 'Served by mistake', neverMade: true },
  { code: 'WrongItemPunched', label: 'Wrong item punched', neverMade: true },
  { code: 'GuestReturned', label: 'Guest sent it back', neverMade: false },
  { code: 'KitchenError', label: 'Kitchen error', neverMade: false },
  { code: 'Other', label: 'Other', neverMade: false },
];

export interface VoidReasonState {
  reasonCode: VoidReasonCode;
  pick: (code: VoidReasonCode) => void;
  note: string;
  setNote: (text: string) => void;
  /** Staff's assertion that the kitchen never actually made this food. Only ever sent for a
   * line/units already recorded as SERVED — the server ignores it anywhere else, because at
   * every other stage the unit counts already answer the question. */
  unprepared: boolean;
  setUnprepared: (value: boolean) => void;
  /** Free text is the fallback, so it's only required when nothing on the list fitted. */
  isComplete: boolean;
  reset: () => void;
}

/** Shared state behind <VoidReasonPicker>, so the single-line void prompt and the quantity
 * reduction prompt collect the reason the same way instead of growing two vocabularies for the
 * same question. */
export const useVoidReasonState = (): VoidReasonState => {
  const [reasonCode, setReasonCode] = React.useState<VoidReasonCode>('Other');
  const [note, setNote] = React.useState('');
  const [unprepared, setUnprepared] = React.useState(false);

  // Picking a reason resets the switch to that reason's usual answer rather than leaving the
  // previous pick's default sitting there — the staff member reads the switch after tapping a
  // chip, so it has to describe the reason they just chose.
  const pick = (code: VoidReasonCode) => {
    setReasonCode(code);
    setUnprepared(VOID_REASONS.find(r => r.code === code)?.neverMade ?? false);
  };

  const reset = () => {
    setReasonCode('Other');
    setNote('');
    setUnprepared(false);
  };

  return {
    reasonCode,
    pick,
    note,
    setNote,
    unprepared,
    setUnprepared,
    isComplete: reasonCode !== 'Other' || note.trim().length > 0,
    reset,
  };
};

/** Reason chips + optional note, plus the stock switch when the thing being pulled back was
 * already recorded as served. Selection shows as fill + border colour, never a tick glyph. */
export const VoidReasonPicker: React.FC<{
  state: VoidReasonState;
  /** True when this pull-back reaches units the system had recorded as SERVED — the only case
   * where the stock question is the staff member's to answer (see OrdersController.RemoveItem). */
  askAboutStock: boolean;
}> = ({ state, askAboutStock }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const { reasonCode, pick, note, setNote, unprepared, setUnprepared } = state;

  return (
    <View>
      <View style={styles.chipRow}>
        {VOID_REASONS.map(r => {
          const active = r.code === reasonCode;
          return (
            <TouchableOpacity
              key={r.code}
              onPress={() => pick(r.code)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{r.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput
        style={styles.noteInput}
        placeholder={reasonCode === 'Other' ? 'Reason (required)' : 'Note (optional)'}
        placeholderTextColor={COLORS.muted}
        value={note}
        onChangeText={setNote}
      />

      {askAboutStock && (
        <View style={styles.stockRow}>
          <View style={styles.stockTextCol}>
            <Text style={styles.stockLabel}>Kitchen never made it</Text>
            <Text style={styles.stockHelp}>
              {unprepared
                ? 'Ingredients go back on the shelf — the deduction was for food that was never cooked.'
                : 'Stock stays deducted. The food was made, so it really is gone.'}
            </Text>
          </View>
          <Switch
            value={unprepared}
            onValueChange={setUnprepared}
            trackColor={{ false: COLORS.divider, true: COLORS.accent }}
          />
        </View>
      )}
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: isDesktopWeb ? 11 : 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: COLORS.divider, backgroundColor: COLORS.cardAlt },
  chipActive: { borderColor: COLORS.heading, backgroundColor: COLORS.heading },
  chipText: { fontSize: isDesktopWeb ? 12 : 11.5, fontWeight: '600', color: COLORS.muted },
  chipTextActive: { color: '#FFFFFF' },
  noteInput: { borderWidth: 1, borderColor: COLORS.divider, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 11 : 10.5, paddingVertical: isDesktopWeb ? 10 : 9, fontSize: isDesktopWeb ? 14 : 16, color: COLORS.heading, marginBottom: isDesktopWeb ? 11 : 10 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8, backgroundColor: COLORS.cardAlt, marginBottom: isDesktopWeb ? 13 : 12 },
  stockTextCol: { flex: 1 },
  stockLabel: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading },
  stockHelp: { fontSize: isDesktopWeb ? 11.5 : 11, color: COLORS.muted, marginTop: 2 },
});
