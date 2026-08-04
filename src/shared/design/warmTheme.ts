/**
 * "Warm Precision" redesign palette.
 * Used by screens redesigned to match the new Figma warm brown/cream visual language.
 */

export const WarmColors = {
  gradientTop: '#EAE0D6',
  gradientBottom: '#241209',

  background: '#F7EFE8',
  card: '#FBF4EF',
  cardAlt: '#FFFFFF',

  heading: '#2B1810',
  muted: '#8A7364',
  placeholder: '#B5A69B',

  accent: '#C5652E',
  button: '#2B1810',

  inputBg: '#FFFFFF',
  inputBorder: '#EDE2D8',
  divider: '#EDE2D8',

  aiCardBg: '#F3DFC9',
  aiIconBg: '#E8C7A0',

  danger: '#C0392B',
  dangerBg: '#F8D9D3',
  dangerAccent: '#B3261E',

  pillActiveBg: '#F6DCC4',
  pillActiveText: '#C5652E',

  // Super Admin — distinct crimson to signal high-privilege/system-level context
  superAdmin: '#8B2E2E',
  superAdminBg: '#FBE9E7',
  superAdminDark: '#3D1414',

  success: '#2E7D4F',
  successBg: '#DCEBDD',
  warning: '#8A6D1F',
  warningBg: '#F6ECC8',

  chipBg: '#EFE6E3',
  chipActiveBg: '#31170A',

  // Onboarding / setup wizard
  onboardTop: '#F3EBE3',
  onboardBottom: '#E4D6C8',
  inputTint: '#F6E9E4',
  proTipBg: '#F3E4D5',
  stepDone: '#2B1810',
  stepActive: '#C5652E',
  stepIdle: '#E1D3C6',

  // Brand vibe swatches
  vibeEspresso: '#4A2C1D',
  vibeCrema: '#D98C5F',
  vibeSage: '#7E9B6D',
  vibeMaroon: '#A34A63',
  vibeOlive: '#B5A96A',
} as const;
