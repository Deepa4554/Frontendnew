import React, { useEffect } from 'react';
import { View, StyleSheet, Text, Platform, Dimensions } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../../../../core/store';
import { restoreSession } from '../viewmodels/authSlice';
import { useResponsive } from '../../../../core/utils/useResponsive';

export const SplashScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      // Brief brand moment, then check for a previously-stored session so a
      // relaunch doesn't force the user to log in again every time.
      await new Promise<void>((resolve) => setTimeout(resolve, 1200));
      const result = await dispatch(restoreSession());
      if (cancelled) return;

      if (restoreSession.rejected.match(result)) {
        navigation.replace('Login');
      }
      // On success, isAuthenticated flips true in the store and RootNavigator
      // swaps away from this whole stack on its own — no navigation needed.
    };

    boot();
    return () => {
      cancelled = true;
    };
  }, [navigation, dispatch]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.logoText, { color: theme.colors.primary }]}>PRABANDHOS</Text>
      <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>Brewing perfection.</Text>
    </View>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 42,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  subtitle: {
    fontSize: isDesktopWeb ? 16 : 14,
    letterSpacing: 1,
  },
});
