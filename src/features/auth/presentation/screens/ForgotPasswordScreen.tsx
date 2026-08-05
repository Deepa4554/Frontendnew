import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { authApi } from '../../../../core/api/authApi';
import { getApiErrorMessage } from '../../../../core/network/api';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { showToast } from '../../../../core/store/uiSlice';

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// See LoginScreen.tsx for why this is needed (removes the browser's default focus
// ring, which clashes with the rounded inputWrapper border).
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

// See LoginScreen.tsx — <input type="email"> blocks text selection in browsers.
const emailKeyboardType = Platform.OS === 'web' ? 'default' : 'email-address';

export const ForgotPasswordScreen = ({ navigation }: any) => {
  const dispatch = useDispatch();
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  // See LoginScreen.tsx — drives the wrapper's border color since the browser's own
  // focus ring is off.
  const [focusedField, setFocusedField] = useState<string | null>(null);
  // Same approach as CreateCafeScreen: a field is only flagged once the user has left
  // it or pressed a button, so a freshly opened form isn't already covered in red.
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [sendAttempted, setSendAttempted] = useState(false);
  const [resetAttempted, setResetAttempted] = useState(false);

  const emailError = isValidEmail(email) ? null : 'Enter a valid email address.';
  const otpError = /^\d{6}$/.test(otp.trim()) ? null : 'Enter the 6-digit code sent to your email.';
  const passwordError = newPassword.length >= 6 ? null : 'Password must be at least 6 characters.';

  const markTouched = (field: string) => {
    setFocusedField(null);
    setTouchedFields((prev) => ({ ...prev, [field]: true }));
  };

  const warn = (message: string) => dispatch(showToast({ message, icon: 'alert-circle-outline', tone: 'warning' }));

  const sendOtp = async () => {
    setSendAttempted(true);
    if (emailError) return warn(emailError);
    setSending(true);
    try {
      await authApi.forgotPasswordRequestOtp(email.trim().toLowerCase());
      setOtpSent(true);
      dispatch(showToast({ message: 'If that email has an account, a 6-digit code has been sent to it.', icon: 'email-check-outline', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not send code'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setSending(false);
    }
  };

  const submitReset = async () => {
    setResetAttempted(true);
    if (otpError) return warn(otpError);
    if (passwordError) return warn(passwordError);

    setResetting(true);
    try {
      await authApi.resetPassword(email.trim().toLowerCase(), otp.trim(), newPassword);
      dispatch(showToast({ message: 'Password changed. Please sign in.', icon: 'check-circle', tone: 'success' }));
      navigation.goBack();
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not reset password'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setResetting(false);
    }
  };

  return (
    <LinearGradient colors={[COLORS.gradientTop, COLORS.gradientBottom]} style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, isDesktopWeb && styles.scrollContentDesktop]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={isDesktopWeb ? styles.desktopCenterWrap : undefined}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>

          <View style={styles.headerContainer}>
            <View style={styles.logoBox}>
              <Icon name="lock-reset" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.brandTitle}>Reset Password</Text>
            <Text style={styles.brandSubtitle}>WE’LL EMAIL YOU A VERIFICATION CODE</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Work Email</Text>
            <View style={[
              styles.inputWrapper,
              focusedField === 'email' && styles.inputWrapperFocused,
              !!((touchedFields.email || sendAttempted) && emailError) && styles.inputWrapperError,
            ]}>
              <Icon name="at" size={20} color={COLORS.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, webNoOutline]}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={COLORS.placeholder}
                keyboardType={emailKeyboardType}
                autoCapitalize="none"
                editable={!otpSent}
                onFocus={() => setFocusedField('email')}
                onBlur={() => markTouched('email')}
              />
            </View>
            {!!((touchedFields.email || sendAttempted) && emailError) && (
              <Text style={styles.errorText}>{emailError}</Text>
            )}

            {!otpSent ? (
              <TouchableOpacity style={styles.primaryButton} onPress={sendOtp} disabled={sending} activeOpacity={0.85}>
                {sending ? <ActivityIndicator color="#FFFFFF" /> : (
                  <>
                    <Text style={styles.primaryButtonText}>Send Verification Code</Text>
                    <Icon name="email-fast-outline" size={20} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Verification Code</Text>
                <View style={[
                  styles.inputWrapper,
                  focusedField === 'otp' && styles.inputWrapperFocused,
                  !!((touchedFields.otp || resetAttempted) && otpError) && styles.inputWrapperError,
                ]}>
                  <Icon name="shield-key-outline" size={20} color={COLORS.muted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, webNoOutline]}
                    value={otp}
                    onChangeText={setOtp}
                    placeholder="123456"
                    placeholderTextColor={COLORS.placeholder}
                    keyboardType="number-pad"
                    maxLength={6}
                    onFocus={() => setFocusedField('otp')}
                    onBlur={() => markTouched('otp')}
                  />
                </View>
                {!!((touchedFields.otp || resetAttempted) && otpError) && (
                  <Text style={styles.errorText}>{otpError}</Text>
                )}

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>New Password</Text>
                <View style={[
                  styles.inputWrapper,
                  focusedField === 'newPassword' && styles.inputWrapperFocused,
                  !!((touchedFields.newPassword || resetAttempted) && passwordError) && styles.inputWrapperError,
                ]}>
                  <Icon name="lock-outline" size={20} color={COLORS.muted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, webNoOutline]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPassword}
                    placeholder="At least 6 characters"
                    placeholderTextColor={COLORS.placeholder}
                    onFocus={() => setFocusedField('newPassword')}
                    onBlur={() => markTouched('newPassword')}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.muted} />
                  </TouchableOpacity>
                </View>
                {!!((touchedFields.newPassword || resetAttempted) && passwordError) && (
                  <Text style={styles.errorText}>{passwordError}</Text>
                )}

                <TouchableOpacity onPress={sendOtp} disabled={sending} style={styles.resendBtn}>
                  <Text style={styles.resendText}>{sending ? 'Resending…' : 'Resend code'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={submitReset}
                  disabled={resetting}
                  activeOpacity={0.85}
                >
                  {resetting ? <ActivityIndicator color="#FFFFFF" /> : (
                    <>
                      <Text style={styles.primaryButtonText}>Reset Password</Text>
                      <Icon name="check-circle-outline" size={20} color="#FFFFFF" />
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: isDesktopWeb ? 24 : 18, paddingTop: isDesktopWeb ? 24 : 18, paddingBottom: isDesktopWeb ? 48 : 36 },
  scrollContentDesktop: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopCenterWrap: {
    width: '100%',
    maxWidth: 440,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: isDesktopWeb ? 8 : 6 },
  headerContainer: { alignItems: 'center', marginBottom: isDesktopWeb ? 24 : 18 },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: COLORS.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isDesktopWeb ? 16 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  brandTitle: { fontSize: 26, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 4.5 },
  brandSubtitle: { fontSize: 11, fontWeight: '700', color: COLORS.muted, letterSpacing: 1.5 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: isDesktopWeb ? 28 : 21,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 6,
  },
  fieldLabel: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '600', color: COLORS.heading, marginBottom: isDesktopWeb ? 8 : 6 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    height: 56,
  },
  inputWrapperFocused: {
    borderColor: COLORS.accent,
    borderWidth: 2,
  },
  // Listed after inputWrapperFocused everywhere it's applied, so a focused field that
  // still has an error stays red rather than reverting to the neutral accent border.
  inputWrapperError: {
    borderColor: '#B3261E',
    borderWidth: 1.5,
  },
  // Matches LoginScreen.tsx's errorText so every auth form flags problems identically.
  errorText: {
    color: '#B3261E',
    fontSize: 12,
    marginTop: isDesktopWeb ? 4 : 3,
    marginLeft: isDesktopWeb ? 4 : 3,
  },
  inputIcon: { marginRight: isDesktopWeb ? 10 : 7.5 },
  input: {
    flex: 1,
    // minWidth: 0 overrides a flex item's web default of min-width:auto — without it,
    // the input refuses to shrink below its native intrinsic width on a narrow screen
    // and pushes the eye-toggle button that follows it outside inputWrapper's box.
    minWidth: 0,
    fontSize: 16,
    color: COLORS.heading,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.button,
    borderRadius: 6,
    height: 56,
    marginTop: isDesktopWeb ? 24 : 18,
    gap: isDesktopWeb ? 8 : 6,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  resendBtn: { alignSelf: 'flex-end', marginTop: 7.5 },
  resendText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
});
