import React, { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { useSettings } from '../api/hooks/useSettings';
import { LightTheme, DarkTheme } from './index';

export const ThemeProviderWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const colorScheme = useColorScheme();
  const { data: settings } = useSettings();
  const themeMode = settings?.themeMode ?? 'system';
  const primaryColor = settings?.primaryColor ?? '#6366F1';

  const isDarkMode =
    themeMode === 'dark' || (themeMode === 'system' && colorScheme === 'dark');

  const theme = useMemo(() => {
    const baseTheme = isDarkMode ? DarkTheme : LightTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        primary: primaryColor,
        // Calculate container color based on primary (simplified for demo)
        primaryContainer: `${primaryColor}40`, 
        onPrimaryContainer: isDarkMode ? '#FFFFFF' : '#000000',
      },
    };
  }, [isDarkMode, primaryColor]);

  return (
    <PaperProvider theme={theme}>
      {children}
    </PaperProvider>
  );
};
