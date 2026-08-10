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
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch } from '../../../../core/store';
import { registerCafe, clearError } from '../viewmodels/authSlice';
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

export const CreateCafeScreen = ({ navigation }: any) => {
  const dispatch = useDispatch<AppDispatch>();
  const { isLoading, error } = useSelector((state: any) => state.auth);
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);

  const [cafeName, setCafeName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  // See LoginScreen.tsx — the browser's own focus ring is off, so this drives the
  // wrapper's border color instead; without it a focused field looks identical to
  // an unfocused one.
  const [focusedField, setFocusedField] = useState<string | null>(null);
  // A field's error appears only once the user has left it, or once they've pressed a
  // button — otherwise every field on a freshly opened form is already flagged red.
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [createAttempted, setCreateAttempted] = useState(false);

  const isValidPhone = (p: string) => /^\d{10}$/.test(p.trim());

  // Single source of truth for what's wrong with the form: the inline message under
  // each field and the toast raised on submit both read from here, so the two can't
  // drift apart as the rules change.
  const fieldErrors: Record<string, string | null> = {
    cafeName: cafeName.trim() ? null : 'Enter your cafe’s name.',
    ownerName: ownerName.trim() ? null : 'Enter your name.',
    email: isValidEmail(email) ? null : 'Enter a valid email address.',
    phone: isValidPhone(phone) ? null : 'Enter a 10-digit mobile number.',
    password: password.length >= 6 ? null : 'Password must be at least 6 characters.',
  };
  // Ordered so the toast names the topmost problem, which is where the user looks first.
  const firstError =
    ['cafeName', 'ownerName', 'email', 'phone', 'password'].map((f) => fieldErrors[f]).find(Boolean) ?? null;
  const canSendOtp = !firstError;

  const otpError = /^\d{6}$/.test(otp.trim()) ? null : 'Enter the 6-digit code sent to your email.';

  const markTouched = (field: string) => {
    setFocusedField(null);
    setTouchedFields((prev) => ({ ...prev, [field]: true }));
  };
  const errorFor = (field: string) => (touchedFields[field] || submitAttempted ? fieldErrors[field] : null);

  const warn = (message: string) => dispatch(showToast({ message, icon: 'alert-circle-outline', tone: 'warning' }));

  // Validation is deliberately kept out of the async sendOtp below and run
  // synchronously here, so a press that only fails validation never leaves a
  // pending promise behind — the errors are on screen by the time the press
  // handler returns.
  const onSendPress = () => {
    // Reveals every inline error at once, not just the one the toast names.
    setSubmitAttempted(true);
    if (firstError) {
      warn(firstError);
      return;
    }
    void sendOtp();
  };

  const sendOtp = async () => {
    setSendingOtp(true);
    try {
      await authApi.requestOtp(email.trim().toLowerCase());
      setOtpSent(true);
      dispatch(showToast({ message: `Verification code sent to ${email.trim()}.`, icon: 'email-check-outline', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not send code'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setSendingOtp(false);
    }
  };

  const onCreateCafe = () => {
    setCreateAttempted(true);
    if (otpError) return warn(otpError);
    dispatch(clearError());
    dispatch(
      registerCafe({
        cafeName: cafeName.trim(),
        email: email.trim().toLowerCase(),
        password,
        ownerName: ownerName.trim(),
        phone: phone.trim(),
        otp: otp.trim(),
      }),
    );
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
              <Icon name="storefront-outline" size={22} color="#FFFFFF" />
            </View>
            <Text style={styles.brandTitle}>Create Your Cafe</Text>
            <Text style={styles.brandSubtitle}>START YOUR 14-DAY FREE TRIAL</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Cafe Name</Text>
            <View style={[
              styles.inputWrapper,
              focusedField === 'cafeName' && styles.inputWrapperFocused,
              !!errorFor('cafeName') && styles.inputWrapperError,
            ]}>
              <Icon name="storefront-outline" size={20} color={COLORS.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, webNoOutline]}
                value={cafeName}
                onChangeText={setCafeName}
                placeholder="e.g. Aroma Loft"
                placeholderTextColor={COLORS.placeholder}
                editable={!otpSent}
                onFocus={() => setFocusedField('cafeName')}
                onBlur={() => markTouched('cafeName')}
              />
            </View>
            {!!errorFor('cafeName') && <Text style={styles.errorText}>{errorFor('cafeName')}</Text>}

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Your Name</Text>
            <View style={[
              styles.inputWrapper,
              focusedField === 'ownerName' && styles.inputWrapperFocused,
              !!errorFor('ownerName') && styles.inputWrapperError,
            ]}>
              <Icon name="account-outline" size={20} color={COLORS.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, webNoOutline]}
                value={ownerName}
                onChangeText={setOwnerName}
                placeholder="e.g. Priya Sharma"
                placeholderTextColor={COLORS.placeholder}
                editable={!otpSent}
                onFocus={() => setFocusedField('ownerName')}
                onBlur={() => markTouched('ownerName')}
              />
            </View>
            {!!errorFor('ownerName') && <Text style={styles.errorText}>{errorFor('ownerName')}</Text>}

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Email</Text>
            <View style={[
              styles.inputWrapper,
              focusedField === 'email' && styles.inputWrapperFocused,
              !!errorFor('email') && styles.inputWrapperError,
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
            {!!errorFor('email') && <Text style={styles.errorText}>{errorFor('email')}</Text>}

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Mobile Number</Text>
            <View style={[
              styles.inputWrapper,
              focusedField === 'phone' && styles.inputWrapperFocused,
              !!errorFor('phone') && styles.inputWrapperError,
            ]}>
              <Icon name="phone-outline" size={20} color={COLORS.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, webNoOutline]}
                value={phone}
                onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                placeholderTextColor={COLORS.placeholder}
                keyboardType="phone-pad"
                maxLength={10}
                editable={!otpSent}
                onFocus={() => setFocusedField('phone')}
                onBlur={() => markTouched('phone')}
              />
            </View>
            {!!errorFor('phone') && <Text style={styles.errorText}>{errorFor('phone')}</Text>}

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Password</Text>
            <View style={[
              styles.inputWrapper,
              focusedField === 'password' && styles.inputWrapperFocused,
              !!errorFor('password') && styles.inputWrapperError,
            ]}>
              <Icon name="lock-outline" size={20} color={COLORS.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, webNoOutline]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="At least 6 characters"
                placeholderTextColor={COLORS.placeholder}
                editable={!otpSent}
                onFocus={() => setFocusedField('password')}
                onBlur={() => markTouched('password')}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            {!!errorFor('password') && <Text style={styles.errorText}>{errorFor('password')}</Text>}

            {!otpSent ? (
              <TouchableOpacity
                style={[styles.primaryButton, !canSendOtp && styles.primaryButtonDisabled]}
                onPress={onSendPress}
                // Deliberately not disabled while the form is incomplete. A disabled button
                // swallows the press, so sendOtp's validation messages could never fire and
                // the user was left staring at a dead grey button with no idea which field
                // was wrong. It still dims as an "incomplete" hint, but pressing it now
                // names the problem and reveals every inline error.
                disabled={sendingOtp}
                activeOpacity={0.85}
              >
                {sendingOtp ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Send Verification Code</Text>
                    <Icon name="email-fast-outline" size={20} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Verification Code</Text>
                <Text style={styles.otpHint}>Enter the 6-digit code we emailed to {email.trim()}</Text>
                <View style={[
                  styles.inputWrapper,
                  focusedField === 'otp' && styles.inputWrapperFocused,
                  !!((touchedFields.otp || createAttempted) && otpError) && styles.inputWrapperError,
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
                {!!((touchedFields.otp || createAttempted) && otpError) && (
                  <Text style={styles.errorText}>{otpError}</Text>
                )}

                <TouchableOpacity onPress={sendOtp} disabled={sendingOtp} style={styles.resendBtn}>
                  <Text style={styles.resendText}>{sendingOtp ? 'Resending…' : 'Resend code'}</Text>
                </TouchableOpacity>

                {!!error && (
                  <View style={styles.authErrorBox}>
                    <Icon name="alert-circle-outline" size={16} color="#B3261E" />
                    <Text style={styles.authErrorText}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={onCreateCafe}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  {isLoading ? <ActivityIndicator color="#FFFFFF" /> : (
                    <>
                      <Text style={styles.primaryButtonText}>Create Cafe</Text>
                      <Icon name="arrow-right" size={20} color="#FFFFFF" />
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
  scrollContent: { flexGrow: 1, padding: isDesktopWeb ? 12 : 18, paddingTop: isDesktopWeb ? 10 : 14, paddingBottom: isDesktopWeb ? 10 : 48 },
  scrollContentDesktop: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopCenterWrap: {
    width: '100%',
    maxWidth: 440,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isDesktopWeb ? 2 : 2,
  },
  headerContainer: { alignItems: 'center', marginBottom: isDesktopWeb ? 6 : 10 },
  logoBox: {
    width: isDesktopWeb ? 40 : 48,
    height: isDesktopWeb ? 40 : 48,
    borderRadius: isDesktopWeb ? 12 : 14,
    backgroundColor: COLORS.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isDesktopWeb ? 4 : 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  brandTitle: {
    fontSize: isDesktopWeb ? 18 : 21,
    fontWeight: 'bold',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 1 : 3,
  },
  brandSubtitle: { fontSize: 11, fontWeight: '700', color: COLORS.muted, letterSpacing: 1.5 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: isDesktopWeb ? 18 : 22,
    padding: isDesktopWeb ? 14 : 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 6,
  },
  fieldLabel: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '600', color: COLORS.heading, marginBottom: isDesktopWeb ? 3 : 4 },
  fieldLabelSpaced: { marginTop: isDesktopWeb ? 6 : 8 },
  otpHint: { fontSize: 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 8 : 6 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: isDesktopWeb ? 12 : 13,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    height: isDesktopWeb ? 40 : 44,
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
    borderRadius: isDesktopWeb ? 14 : 16,
    height: isDesktopWeb ? 42 : 46,
    marginTop: isDesktopWeb ? 10 : 12,
    gap: isDesktopWeb ? 8 : 6,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  // Matches LoginScreen.tsx's errorText so both auth forms flag problems identically.
  errorText: {
    color: '#B3261E',
    fontSize: 12,
    marginTop: isDesktopWeb ? 4 : 3,
    marginLeft: isDesktopWeb ? 4 : 3,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: isDesktopWeb ? 16 : 12, fontWeight: '700' },
  resendBtn: { alignSelf: 'flex-end', marginTop: isDesktopWeb ? 6 : 6 },
  resendText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.accent },
  authErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 8 : 6,
    backgroundColor: '#FBEAE6',
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 10,
    marginTop: isDesktopWeb ? 10 : 10,
  },
  authErrorText: { flex: 1, color: '#B3261E', fontSize: 12, fontWeight: '600' },
});
