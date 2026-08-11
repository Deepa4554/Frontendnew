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
  Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch } from '../../../../core/store';
import { loginWithEmail, clearError } from '../viewmodels/authSlice';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../core/utils/useResponsive';
import brandIcon from '../../../../assets/brand/prabandhos-icon.png';

// Owners/demo accounts sign in with a real email; staff logins (Waiter/Cashier/etc.,
// see StaffController.Create) sign in with their 10-digit mobile number instead — this
// one field accepts either, since it's the same shared login screen for every role.
const loginSchema = z.object({
  email: z
    .string()
    .refine(
      (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^\d{10}$/.test(v),
      'Enter a valid email or 10-digit mobile number',
    ),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// react-native-web renders TextInput as an <input>, which the browser gives its own
// default focus ring — that ring ignores our rounded inputWrapper border and looks
// like a broken double-outline. The wrapper's border is the only focus affordance we
// need, so the native one is turned off. `outlineStyle` isn't part of RN's TextStyle
// type (web-only CSS property react-native-web passes through), hence the `any` cast.
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

// react-native-web maps keyboardType="email-address" to <input type="email">, which
// browsers (per the HTML spec) don't allow text selection in — no click-drag, no
// double-click-to-select-word, no Ctrl+A. That's fine on native (there's no such
// restriction there, and the point was just to show the @ keyboard), but on web it
// makes the field feel broken, so it falls back to a plain text input there instead.
const emailKeyboardType = Platform.OS === 'web' ? 'default' : 'email-address';

export const LoginScreen = ({ navigation }: any) => {
  const dispatch = useDispatch<AppDispatch>();
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const { isLoading, error } = useSelector((state: any) => state.auth);
  const [showPassword, setShowPassword] = useState(false);
  // Since the browser's own focus ring is turned off (see webNoOutline above), the
  // wrapper's border color is the only way a user can tell a field is focused —
  // without this, clicking into a field gives no visible feedback at all.
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur', // validate as soon as a field is left, not only on submit
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = (data: LoginFormValues) => {
    dispatch(loginWithEmail({ email: data.email, password: data.password }));
  };

  const formCard = (
    <View style={isDesktopWeb ? styles.cardDesktop : styles.card}>
      <Text style={styles.welcomeTitle}>Welcome Back</Text>
      <Text style={styles.welcomeSubtitle}>Securely access your branch dashboard</Text>

      <Text style={styles.fieldLabel}>Email or Mobile Number</Text>
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <View style={[styles.inputWrapper, focusedField === 'email' && styles.inputWrapperFocused]}>
            <Icon name="at" size={20} color={COLORS.muted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, webNoOutline]}
              value={value}
              onChangeText={(t) => { onChange(t); if (error) dispatch(clearError()); }}
              placeholder="manager@prabandhos.ai"
              placeholderTextColor={COLORS.placeholder}
              keyboardType={emailKeyboardType}
              autoCapitalize="none"
              onFocus={() => setFocusedField('email')}
              onBlur={() => { onBlur(); setFocusedField(null); }}
            />
          </View>
        )}
      />
      {!!errors.email && <Text style={styles.errorText}>{errors.email.message}</Text>}

      <View style={styles.labelRow}>
        <Text style={styles.fieldLabel}>Security Key</Text>
        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={styles.forgotText}>Forgot Access?</Text>
        </TouchableOpacity>
      </View>
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <View style={[styles.inputWrapper, focusedField === 'password' && styles.inputWrapperFocused]}>
            <Icon name="lock-outline" size={20} color={COLORS.muted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, webNoOutline]}
              value={value}
              onChangeText={(t) => { onChange(t); if (error) dispatch(clearError()); }}
              secureTextEntry={!showPassword}
              placeholder="••••••••"
              placeholderTextColor={COLORS.placeholder}
              onFocus={() => setFocusedField('password')}
              onBlur={() => { onBlur(); setFocusedField(null); }}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Icon
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={COLORS.muted}
              />
            </TouchableOpacity>
          </View>
        )}
      />
      {!!errors.password && <Text style={styles.errorText}>{errors.password.message}</Text>}

      {!!error && (
        <View style={styles.authErrorBox}>
          <Icon name="alert-circle-outline" size={16} color="#B3261E" />
          <Text style={styles.authErrorText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.signInButton}
        onPress={handleSubmit(onSubmit)}
        disabled={isLoading}
        activeOpacity={0.85}
      >
        <Text style={styles.signInText}>{isLoading ? 'Signing In…' : 'Sign In'}</Text>
        <Icon name="arrow-right" size={20} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );

  const footerLink = (
    <TouchableOpacity style={styles.footerPill} onPress={() => navigation.navigate('CreateCafe')} activeOpacity={0.75}>
      <Text style={styles.footerText}>
        New cafe? <Text style={styles.footerTextBold}>Create your account</Text>
      </Text>
    </TouchableOpacity>
  );

  if (isDesktopWeb) {
    return (
      <View style={styles.desktopSplit}>
        <View style={styles.desktopLeftPanel}>
          <View style={styles.desktopBrandRow}>
            <Image source={brandIcon} style={styles.desktopBrandIcon} resizeMode="contain" />
            <Text style={styles.desktopBrandName}>PrabandhOS</Text>
          </View>
          <Text style={styles.desktopHeadline}>Efficiency served hot.</Text>
          <Text style={styles.desktopHeadlineSub}>
            The all-in-one POS crafted for the modern artisan kitchen and busy cafe floor.
          </Text>
        </View>
        <View style={styles.desktopRightPanel}>
          {formCard}
          {footerLink}
        </View>
      </View>
    );
  }

  return (
    <LinearGradient colors={[COLORS.gradientTop, COLORS.gradientBottom]} style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerContainer}>
            <Image source={brandIcon} style={styles.logoBox} resizeMode="contain" />
            <Text style={styles.brandTitle}>PrabandhOS</Text>
            <Text style={styles.brandSubtitle}>WARM PRECISION · V2027.4</Text>
          </View>

          {formCard}

          {footerLink}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  desktopSplit: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.background,
  },
  desktopLeftPanel: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: isDesktopWeb ? 48 : 36,
    backgroundColor: COLORS.background,
  },
  desktopBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 10 : 7.5,
    marginBottom: isDesktopWeb ? 18 : 13.5,
  },
  desktopBrandIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
  },
  desktopBrandName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.heading,
  },
  desktopHeadline: {
    fontSize: isDesktopWeb ? 40 : 12,
    fontWeight: '800',
    color: COLORS.heading,
    lineHeight: 46,
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  desktopHeadlineSub: {
    fontSize: isDesktopWeb ? 15 : 12,
    color: COLORS.muted,
    lineHeight: 22,
    maxWidth: 420,
  },
  desktopRightPanel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 32 : 24,
  },
  cardDesktop: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 22 : 16.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: isDesktopWeb ? 20 : 15,
    paddingTop: isDesktopWeb ? 28 : 21,
    paddingBottom: isDesktopWeb ? 40 : 30,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: isDesktopWeb ? 16 : 12,
  },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    marginBottom: isDesktopWeb ? 10 : 7.5,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 4 : 3,
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 2,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: isDesktopWeb ? 20 : 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 6,
  },
  welcomeTitle: {
    fontSize: isDesktopWeb ? 22 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 4 : 3,
  },
  welcomeSubtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: isDesktopWeb ? 16 : 12,
  },
  fieldLabel: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '600',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 6 : 4.5,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: isDesktopWeb ? 10 : 7.5,
  },
  forgotText: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: COLORS.accent,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    height: 48,
  },
  inputWrapperFocused: {
    borderColor: COLORS.accent,
    borderWidth: 2,
  },
  inputIcon: {
    marginRight: isDesktopWeb ? 10 : 7.5,
  },
  input: {
    flex: 1,
    // minWidth: 0 overrides a flex item's web default of min-width:auto — without it,
    // the input refuses to shrink below its native intrinsic width on a narrow screen
    // and pushes the eye-toggle button that follows it outside inputWrapper's box
    // instead of leaving it flush against the right edge.
    minWidth: 0,
    fontSize: 16,
    color: COLORS.heading,
  },
  errorText: {
    color: '#B3261E',
    fontSize: 12,
    marginTop: isDesktopWeb ? 4 : 3,
    marginLeft: isDesktopWeb ? 4 : 3,
  },
  authErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 8 : 6,
    backgroundColor: '#FBEAE6',
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 9,
    marginTop: isDesktopWeb ? 16 : 12,
  },
  authErrorText: {
    flex: 1,
    color: '#B3261E',
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '600',
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.button,
    borderRadius: 6,
    height: 50,
    marginTop: isDesktopWeb ? 16 : 12,
    gap: isDesktopWeb ? 8 : 6,
  },
  signInText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  footerPill: {
    alignSelf: 'center',
    marginTop: 9,
    marginBottom: 3,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 999,
    paddingHorizontal: 13.5,
    paddingVertical: 7.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  footerText: {
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  footerTextBold: {
    color: COLORS.accent,
    fontWeight: '800',
  },
});
