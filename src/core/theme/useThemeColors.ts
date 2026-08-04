import { WarmColors } from '../../shared/design/warmTheme';
import { DesktopColors } from '../../shared/design/desktopWebTheme';
import { useResponsive } from '../utils/useResponsive';

export type ThemeColors = Record<keyof typeof WarmColors, string> & Partial<Record<keyof typeof DesktopColors, string>>;

/**
 * Drop-in replacement for `import { WarmColors as COLORS } from '.../warmTheme'`.
 * Returns the desktop-web "Warm Precision" redesign palette on a tablet/desktop
 * browser, and the original WarmColors everywhere else (native app at any size,
 * or a narrow mobile browser) — see isDesktopWeb in useResponsive.ts for why.
 */
export const useThemeColors = (): ThemeColors => {
  const { isDesktopWeb } = useResponsive();
  return (isDesktopWeb ? DesktopColors : WarmColors) as ThemeColors;
};
