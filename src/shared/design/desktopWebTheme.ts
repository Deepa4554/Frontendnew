/**
 * "Warm Precision" desktop-web redesign palette (DESIGN.md) — used ONLY when
 * `isDesktopWeb` is true (tablet/desktop-width browser). Native app and mobile-width
 * browser keep the original `WarmColors` palette from ./warmTheme untouched.
 *
 * Keys intentionally mirror WarmColors 1:1 so `useThemeColors()` is a drop-in swap —
 * screens keep writing `COLORS.heading`, `COLORS.accent`, etc. and get whichever
 * palette matches the current platform/width automatically.
 */

export const DesktopColors = {
  gradientTop: '#EAE0D6',
  gradientBottom: '#241209',

  background: '#FDF9F4',
  card: '#FFFFFF',
  cardAlt: '#FFFFFF',

  heading: '#1C1C19',
  muted: '#4F4540',
  placeholder: '#81756F',

  accent: '#904D00',
  button: '#0E0401',

  inputBg: '#FFFFFF',
  inputBorder: '#D2C3BD',
  divider: '#EBE8E3',

  aiCardBg: '#FFDCC3',
  aiIconBg: '#FE932C',

  danger: '#BA1A1A',
  dangerBg: '#FFDAD6',
  dangerAccent: '#BA1A1A',

  pillActiveBg: '#FE932C',
  pillActiveText: '#0E0401',

  superAdmin: '#8B2E2E',
  superAdminBg: '#FBE9E7',
  superAdminDark: '#3D1414',

  success: '#2E7D4F',
  successBg: '#DCEBDD',
  warning: '#8A6D1F',
  warningBg: '#F6ECC8',

  chipBg: '#F1EDE8',
  chipActiveBg: '#0E0401',

  onboardTop: '#F3EBE3',
  onboardBottom: '#E4D6C8',
  inputTint: '#F7F3EE',
  proTipBg: '#F1EDE8',
  stepDone: '#0E0401',
  stepActive: '#904D00',
  stepIdle: '#E6E2DD',

  vibeEspresso: '#4A2C1D',
  vibeCrema: '#D98C5F',
  vibeSage: '#7E9B6D',
  vibeMaroon: '#A34A63',
  vibeOlive: '#B5A96A',

  // Desktop-shell-specific tokens with no WarmColors equivalent (sidebar/topbar chrome).
  sidebarBg: '#FDF9F4',
  sidebarActivePillBg: '#FE932C',
  sidebarActiveText: '#0E0401',
  sidebarInactiveText: '#4F4540',
  statDarkBg: '#0E0401',
  fontFamily: 'Plus Jakarta Sans, -apple-system, sans-serif',
} as const;
