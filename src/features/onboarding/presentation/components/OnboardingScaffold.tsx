import React from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { WarmColors as COLORS } from '../../../../shared/design/warmTheme';
import { ScreenContainer } from '../../../../core/components/ScreenContainer';
import { useResponsive } from '../../../../core/utils/useResponsive';

interface OnboardingScaffoldProps {
  step: number; // 1-based
  totalSteps?: number;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextEnabled?: boolean;
  children: React.ReactNode;
}

export const OnboardingScaffold: React.FC<OnboardingScaffoldProps> = ({
  step,
  totalSteps = 4,
  onBack,
  onNext,
  nextLabel = 'Continue',
  nextEnabled = true,
  children,
}) => {
  const { isDesktopWeb } = useResponsive();
  const progress = step / totalSteps;
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={[COLORS.onboardTop, COLORS.onboardBottom]} style={styles.container}>
      {/* Thin top progress strip */}
      <View style={styles.progressStrip}>
        <View style={[styles.progressStripFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Everything below stays a single-column form width even on a wide
          desktop browser — full-bleed here would look like a giant empty
          setup wizard rather than a form. */}
      <ScreenContainer maxWidth={560} style={styles.flex}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity style={styles.backIconBtn} onPress={onBack} disabled={!onBack}>
            <Icon name="arrow-left" size={22} color={onBack ? COLORS.heading : 'transparent'} />
          </TouchableOpacity>
          <Text style={styles.setupTitle}>Setup</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.stepText}>
            Step {step} of {totalSteps}
          </Text>
        </View>

        {/* Segmented progress dashes */}
        <View style={styles.segmentRow}>
          {Array.from({ length: totalSteps }).map((_, i) => {
            const idx = i + 1;
            const color =
              idx < step ? COLORS.stepDone : idx === step ? COLORS.stepActive : COLORS.stepIdle;
            return <View key={idx} style={[styles.segment, { backgroundColor: color }]} />;
          })}
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {children}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.backBtn} onPress={onBack} disabled={!onBack}>
              <Icon name="chevron-left" size={18} color={onBack ? COLORS.heading : COLORS.muted} />
              <Text style={[styles.backBtnText, !onBack && { color: COLORS.muted }]}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.nextBtn, !nextEnabled && styles.nextBtnDisabled]}
              onPress={onNext}
              disabled={!nextEnabled}
              activeOpacity={0.85}
            >
              <Text style={styles.nextBtnText}>{nextLabel}</Text>
              <Icon name="chevron-right" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </ScreenContainer>
    </LinearGradient>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  progressStrip: {
    height: 4,
    backgroundColor: COLORS.stepIdle,
  },
  progressStripFill: {
    height: 4,
    backgroundColor: COLORS.accent,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    paddingTop: isDesktopWeb ? 14 : 10.5,
    paddingBottom: isDesktopWeb ? 8 : 6,
    gap: isDesktopWeb ? 8 : 6,
  },
  backIconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupTitle: {
    fontSize: isDesktopWeb ? 22 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  stepText: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: COLORS.accent,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: isDesktopWeb ? 8 : 6,
    paddingHorizontal: isDesktopWeb ? 20 : 15,
    marginTop: isDesktopWeb ? 10 : 7.5,
    marginBottom: isDesktopWeb ? 6 : 4.5,
  },
  segment: {
    width: 30,
    height: 6,
    borderRadius: 3,
  },
  scrollContent: {
    padding: isDesktopWeb ? 20 : 15,
    paddingBottom: isDesktopWeb ? 24 : 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: isDesktopWeb ? 20 : 15,
    paddingTop: isDesktopWeb ? 12 : 9,
    paddingBottom: isDesktopWeb ? 20 : 15,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 2 : 1.5,
    paddingVertical: isDesktopWeb ? 10 : 7.5,
    paddingHorizontal: isDesktopWeb ? 8 : 6,
  },
  backBtnText: {
    fontSize: isDesktopWeb ? 15 : 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4.5,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: 10.5,
    paddingHorizontal: 21,
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
