import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, Dimensions } from 'react-native';
import { WarmColors as COLORS } from '../design/warmTheme';
import { useResponsive } from '../../core/utils/useResponsive';

export interface ConfirmButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface ConfirmState {
  title: string;
  message?: string;
  buttons: ConfirmButton[];
}

// react-native-web's Alert.alert is a no-op (see node_modules/react-native-web/src/exports/Alert)
// — on web it never shows anything and any onPress packed into its buttons never fires. This
// module-level setter + confirmAlert() function gives every screen a drop-in replacement with
// the same (title, message, buttons) signature that actually renders on every platform, backed
// by a real Modal instead of the browser's unstyled native confirm().
let setStateRef: ((s: ConfirmState | null) => void) | null = null;

export function confirmAlert(title: string, message?: string, buttons?: ConfirmButton[]): void {
  const finalButtons = buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' as const }];
  setStateRef?.({ title, message, buttons: finalButtons });
}

export const ConfirmDialogHost = () => {
  const { isDesktopWeb } = useResponsive();
  const [state, setState] = useState<ConfirmState | null>(null);

  useEffect(() => {
    setStateRef = setState;
    return () => {
      setStateRef = null;
    };
  }, []);

  if (!state) return null;

  const handlePress = (btn: ConfirmButton) => {
    setState(null);
    btn.onPress?.();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setState(null)}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{state.title}</Text>
          {!!state.message && <Text style={styles.message}>{state.message}</Text>}
          <View style={styles.buttonRow}>
            {state.buttons.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.button,
                  btn.style === 'destructive' && styles.destructiveButton,
                  btn.style === 'cancel' && styles.cancelButton,
                ]}
                onPress={() => handlePress(btn)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.buttonText,
                    btn.style === 'destructive' && styles.destructiveText,
                    btn.style === 'cancel' && styles.cancelText,
                  ]}
                >
                  {btn.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isDesktopWeb ? 24 : 18,
    // react-native-web's Modal polyfill isn't guaranteed to win the stacking
    // context on its own — pin it explicitly above everything else (sidebar,
    // tab bar, ToastHost) rather than relying on DOM mount order.
    zIndex: 999999,
    elevation: 999999,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: isDesktopWeb ? 16 : 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 6 : 4.5,
  },
  message: {
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 16,
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: isDesktopWeb ? 8 : 6,
    justifyContent: 'flex-end',
  },
  button: {
    paddingHorizontal: isDesktopWeb ? 14 : 10.5,
    paddingVertical: isDesktopWeb ? 10 : 7.5,
    borderRadius: 6,
    backgroundColor: COLORS.button,
    minWidth: 76,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  destructiveButton: {
    backgroundColor: COLORS.dangerAccent,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancelText: {
    color: COLORS.heading,
  },
  destructiveText: {
    color: '#FFFFFF',
  },
});
