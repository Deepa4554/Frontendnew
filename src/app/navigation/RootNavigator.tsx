import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useSelector } from 'react-redux';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { SplashScreen } from '../../features/auth/presentation/screens/SplashScreen';
import { LoginScreen } from '../../features/auth/presentation/screens/LoginScreen';
import { CreateCafeScreen } from '../../features/auth/presentation/screens/CreateCafeScreen';
import { ForgotPasswordScreen } from '../../features/auth/presentation/screens/ForgotPasswordScreen';
import { OnboardingNavigator } from '../../features/onboarding/presentation/navigation/OnboardingNavigator';
import { useSettings } from '../../core/api/hooks/useSettings';
import { WarmColors as COLORS } from '../../shared/design/warmTheme';
import { SuperAdminNavigator } from '../../features/superadmin/presentation/navigation/SuperAdminNavigator';
import { navigationRef } from '../../core/navigation/navigationRef';
import { linking } from '../../core/navigation/linking';

const Stack = createNativeStackNavigator();

import { AppNavigator } from './AppNavigator';

const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Splash" component={SplashScreen} />
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="CreateCafe" component={CreateCafeScreen} />
    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
  </Stack.Navigator>
);

const LoadingScreen = () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
    <ActivityIndicator size="large" color={COLORS.accent} />
  </View>
);

export const RootNavigator = () => {
  const isAuthenticated = useSelector((state: any) => state.auth.isAuthenticated);
  const isPlatformAdmin = useSelector((state: any) => state.auth.user?.isPlatformAdmin);
  // Onboarding-completion now lives on the backend (CafeSettings), not Redux —
  // fetched once here to decide which top-level stack to mount. SplashScreen
  // (first screen inside AuthStack) is what actually waits on restoreSession
  // before this component ever sees isAuthenticated flip true.
  const { data: settings, isLoading: settingsLoading } = useSettings();

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : isPlatformAdmin ? (
          // The platform operator (you) never sees any single cafe's POS/Tables/
          // Menu/etc. — Default Cafe is just where the bootstrap account happens to
          // live, not a cafe you run. Super Admin gets its own dedicated navigator
          // instead of AppNavigator, and skips per-cafe onboarding entirely.
          <Stack.Screen name="SuperAdminRoot" component={SuperAdminNavigator} />
        ) : settingsLoading || !settings ? (
          <Stack.Screen name="Loading" component={LoadingScreen} />
        ) : !settings.hasCompletedOnboarding ? (
          <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
        ) : (
          <Stack.Screen name="App" component={AppNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
