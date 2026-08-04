import { MD3DarkTheme, MD3LightTheme, configureFonts } from 'react-native-paper';

// Premium Color Palette
const lightColors = {
  primary: '#6366F1', // Indigo 500
  onPrimary: '#FFFFFF',
  primaryContainer: '#E0E7FF', // Indigo 100
  onPrimaryContainer: '#3730A3', // Indigo 800
  secondary: '#14B8A6', // Teal 500
  onSecondary: '#FFFFFF',
  secondaryContainer: '#CCFBF1', // Teal 100
  onSecondaryContainer: '#115E59', // Teal 800
  tertiary: '#F43F5E', // Rose 500
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#FFE4E6', // Rose 100
  onTertiaryContainer: '#9F1239', // Rose 800
  error: '#DC2626',
  onError: '#FFFFFF',
  errorContainer: '#FEE2E2',
  onErrorContainer: '#991B1B',
  background: '#F8FAFC', // Slate 50
  onBackground: '#0F172A', // Slate 900
  surface: '#FFFFFF',
  onSurface: '#0F172A',
  surfaceVariant: '#E2E8F0', // Slate 200
  onSurfaceVariant: '#475569', // Slate 600
  outline: '#CBD5E1', // Slate 300
  glassBackground: 'rgba(255, 255, 255, 0.7)',
  glassBorder: 'rgba(255, 255, 255, 0.3)',
};

const darkColors = {
  primary: '#818CF8', // Indigo 400
  onPrimary: '#1E1B4B', // Indigo 950
  primaryContainer: '#4F46E5', // Indigo 600
  onPrimaryContainer: '#E0E7FF',
  secondary: '#2DD4BF', // Teal 400
  onSecondary: '#042F2E', // Teal 950
  secondaryContainer: '#0D9488', // Teal 600
  onSecondaryContainer: '#CCFBF1',
  tertiary: '#FB7185', // Rose 400
  onTertiary: '#4C0519', // Rose 950
  tertiaryContainer: '#E11D48', // Rose 600
  onTertiaryContainer: '#FFE4E6',
  error: '#F87171',
  onError: '#450A0A',
  errorContainer: '#991B1B',
  onErrorContainer: '#FEE2E2',
  background: '#0F172A', // Slate 900
  onBackground: '#F8FAFC',
  surface: '#1E293B', // Slate 800
  onSurface: '#F8FAFC',
  surfaceVariant: '#334155', // Slate 700
  onSurfaceVariant: '#CBD5E1',
  outline: '#475569', // Slate 600
  glassBackground: 'rgba(30, 41, 59, 0.7)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
};

const fontConfig = {
  fontFamily: 'System', // Will map to San Francisco on iOS and Roboto on Android
};

export const LightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...lightColors,
  },
  fonts: configureFonts({ config: fontConfig }),
};

export const DarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...darkColors,
  },
  fonts: configureFonts({ config: fontConfig }),
};
