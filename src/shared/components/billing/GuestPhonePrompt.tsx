import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { RADIUS, INPUT_BORDER_WIDTH } from '../../design/commonStyles';

// See OrderBillActions' webNoOutline — same reason, the browser's own focus ring on a
// react-native-web TouchableOpacity reads as a stray outline around the whole control.
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

interface Props {
  visible: boolean;
  /** Prefills the field — pass whatever number is already on file when this is opened to
   *  correct one rather than to add a missing one. */
  initialPhone?: string | null;
  /** Resolved with a validated 10-digit number. The caller decides what that means: saving
   *  it onto a server order, or (in POS's Pay First sheet) just holding it until the order
   *  is created. Keep the modal open by throwing — `submitting` covers the await. */
  onSubmit: (phone: string) => void | Promise<void>;
  onCancel: () => void;
  /** Shown under the title so each entry point can say what the number is for. */
  hint?: string;
}

/**
 * "No mobile number on file" prompt, shown when a cashier taps a Send-on-WhatsApp action for
 * a guest whose number was never taken. Replaces what used to be a dead-end warning toast
 * ("add a number first") with somewhere to actually add it, without losing the action that
 * was being attempted — every caller re-runs that action once this resolves.
 *
 * Lives here rather than in OrderBillActions so POS's Pay First sheet (which settles a local
 * cart, with no server order to save against yet) shows the identical prompt.
 */
export const GuestPhonePrompt: React.FC<Props> = ({ visible, initialPhone, onSubmit, onCancel, hint }) => {
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS);
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset per opening rather than on mount — the component stays mounted between opens, so
  // without this a corrected-then-cancelled number would still be sitting there next time.
  useEffect(() => {
    if (visible) {
      setPhone(initialPhone ?? '');
      setError(null);
      setSubmitting(false);
    }
  }, [visible, initialPhone]);

  const handleSubmit = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) {
      setError('Enter a 10-digit mobile number.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(digits);
    } catch {
      // The caller surfaces its own failure toast; just hand the field back so the number
      // isn't lost and can be retried.
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.head}>
            <Icon name="whatsapp" size={20} color={COLORS.accent} />
            <Text style={styles.title}>Guest Mobile Number</Text>
          </View>
          <Text style={styles.hint}>{hint ?? 'Needed to send the bill on WhatsApp.'}</Text>

          <TextInput
            style={[styles.input, !!error && styles.inputError]}
            value={phone}
            onChangeText={(t) => { setPhone(t.replace(/\D/g, '').slice(0, 10)); setError(null); }}
            placeholder="10-digit mobile number"
            placeholderTextColor={COLORS.muted}
            keyboardType="number-pad"
            maxLength={10}
            autoFocus
            editable={!submitting}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
          />
          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.cancelBtn, webNoOutline]} onPress={onCancel} disabled={submitting}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, submitting && { opacity: 0.6 }, webNoOutline]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="send" size={15} color="#FFFFFF" />
              )}
              <Text style={styles.saveText}>Save & Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.card,
    padding: 16,
    gap: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15.5, fontWeight: '700', color: COLORS.heading },
  hint: { fontSize: 12.5, color: COLORS.muted, lineHeight: 17 },
  input: {
    borderWidth: INPUT_BORDER_WIDTH,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.button,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    letterSpacing: 1,
    color: COLORS.heading,
    backgroundColor: COLORS.cardAlt,
    marginTop: 4,
  },
  inputError: { borderColor: COLORS.danger },
  error: { fontSize: 12, color: COLORS.danger },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: RADIUS.button,
    borderWidth: INPUT_BORDER_WIDTH,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.cardAlt,
  },
  cancelText: { fontSize: 13, fontWeight: '700', color: COLORS.heading },
  saveBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.button,
  },
  saveText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
