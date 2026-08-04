import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { WarmColors as COLORS } from '../../../../shared/design/warmTheme';
import { OnboardingScaffold } from '../components/OnboardingScaffold';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { useUpdateSettings } from '../../../../core/api/hooks/useSettings';
import { showToast } from '../../../../core/store/uiSlice';

const CAFE_TYPES = [
  { id: 'coffee', label: 'QSR', desc: 'e.g. Cafe, Food Truck, Quick Bites', icon: 'coffee' },
  { id: 'bakery', label: 'Bakery', desc: 'Pastries, bread & desserts', icon: 'food-croissant' },
  { id: 'restaurant', label: 'Full Restaurant', desc: 'Dine-in with table service', icon: 'silverware-fork-knife' },
  { id: 'lounge', label: 'Bar & Lounge', desc: 'Drinks, tapas & evening service', icon: 'glass-cocktail' },
];

// Matches OrderTypesSettingsScreen's five toggles exactly (same field names below) —
// this screen is just the onboarding-time version of that same setting, not a
// separate list of its own, so it can't drift out of sync with what Settings shows.
const SERVICE_MODES = ['Dine In', 'Takeaway', 'Delivery', 'Token', 'Cash Sale'];

export const OnboardingTypeScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const dispatch = useDispatch();
  const updateSettings = useUpdateSettings();
  const [type, setType] = useState('coffee');
  const [modes, setModes] = useState<string[]>(['Dine In', 'Takeaway']);

  const toggleMode = (m: string) => {
    setModes((prev) => {
      if (!prev.includes(m)) return [...prev, m];
      // Same guard as OrderTypesSettingsScreen's own toggle — a cafe with zero
      // service modes enabled can't take a single order once onboarding finishes.
      if (prev.length <= 1) {
        dispatch(showToast({ message: 'At least one service mode must stay enabled.', icon: 'alert-circle-outline', tone: 'warning' }));
        return prev;
      }
      return prev.filter((x) => x !== m);
    });
  };

  const handleNext = () => {
    updateSettings.mutate({
      businessType: type,
      dineInEnabled: modes.includes('Dine In'),
      takeawayEnabled: modes.includes('Takeaway'),
      deliveryEnabled: modes.includes('Delivery'),
      qsrEnabled: modes.includes('Token'),
      cashEnabled: modes.includes('Cash Sale'),
    });
    navigation.navigate('OnboardingMenu');
  };

  return (
    <OnboardingScaffold
      step={2}
      onBack={() => navigation.goBack()}
      onNext={handleNext}
    >
      <Text style={styles.headline}>What's your style?</Text>
      <Text style={styles.subtitle}>
        Pick the setup that best matches your space so we can tailor your workspace.
      </Text>

      <View style={styles.grid}>
        {CAFE_TYPES.map((t) => {
          const selected = t.id === type;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.typeCard, selected && styles.typeCardSelected]}
              onPress={() => setType(t.id)}
              activeOpacity={0.85}
            >
              <View style={[styles.typeIconBox, selected && styles.typeIconBoxSelected]}>
                <Icon name={t.icon} size={26} color={selected ? '#FFFFFF' : COLORS.heading} />
              </View>
              <Text style={styles.typeLabel}>{t.label}</Text>
              <Text style={styles.typeDesc}>{t.desc}</Text>
              {selected && (
                <View style={styles.checkBadge}>
                  <Icon name="check" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>How do you serve customers?</Text>
      <View style={styles.modeRow}>
        {SERVICE_MODES.map((m) => {
          const active = modes.includes(m);
          return (
            <TouchableOpacity
              key={m}
              style={[styles.modeChip, active && styles.modeChipActive]}
              onPress={() => toggleMode(m)}
            >
              {active && <Icon name="check" size={13} color="#FFFFFF" />}
              <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>{m}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.proTip}>
        <Icon name="lightbulb-on-outline" size={18} color={COLORS.accent} />
        <Text style={styles.proTipText}>
          <Text style={styles.proTipBold}>Pro Tip: </Text>
          You can enable more service modes anytime from Settings once you're up and running.
        </Text>
      </View>
    </OnboardingScaffold>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  headline: {
    fontSize: isDesktopWeb ? 32 : 12,
    fontWeight: '800',
    color: COLORS.heading,
    textAlign: 'center',
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  subtitle: {
    fontSize: isDesktopWeb ? 15 : 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: isDesktopWeb ? 24 : 18,
    paddingHorizontal: isDesktopWeb ? 8 : 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: isDesktopWeb ? 12 : 9,
  },
  typeCard: {
    width: '47.5%',
    flexGrow: 1,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 16 : 12,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#4A2C1D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  typeCardSelected: {
    borderColor: COLORS.accent,
  },
  typeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: COLORS.inputTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  typeIconBoxSelected: {
    backgroundColor: COLORS.accent,
  },
  typeLabel: {
    fontSize: isDesktopWeb ? 15 : 12,
    fontWeight: '700',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 2 : 1.5,
  },
  typeDesc: {
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 16,
  },
  checkBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: isDesktopWeb ? 17 : 12,
    fontWeight: '700',
    color: COLORS.heading,
    marginTop: isDesktopWeb ? 24 : 18,
    marginBottom: isDesktopWeb ? 14 : 10.5,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: isDesktopWeb ? 10 : 7.5,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 5 : 3.75,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 20,
    paddingHorizontal: isDesktopWeb ? 16 : 12,
    paddingVertical: isDesktopWeb ? 10 : 7.5,
  },
  modeChipActive: {
    backgroundColor: COLORS.button,
  },
  modeChipText: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '600',
    color: COLORS.muted,
  },
  modeChipTextActive: {
    color: '#FFFFFF',
  },
  proTip: {
    flexDirection: 'row',
    gap: 7.5,
    backgroundColor: COLORS.proTipBg,
    borderRadius: 8,
    padding: 12,
    marginTop: 18,
  },
  proTipText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.heading,
    lineHeight: 19,
  },
  proTipBold: {
    fontWeight: '700',
    color: COLORS.accent,
  },
});
