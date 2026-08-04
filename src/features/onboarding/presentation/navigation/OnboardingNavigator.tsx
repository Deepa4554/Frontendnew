import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingWelcomeScreen } from '../screens/OnboardingWelcomeScreen';
import { OnboardingTypeScreen } from '../screens/OnboardingTypeScreen';
import { OnboardingMenuScreen } from '../screens/OnboardingMenuScreen';
import { OnboardingCrewScreen } from '../screens/OnboardingCrewScreen';

const Stack = createNativeStackNavigator();

export const OnboardingNavigator = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      animation: 'slide_from_right',
    }}
  >
    <Stack.Screen name="OnboardingWelcome" component={OnboardingWelcomeScreen} />
    <Stack.Screen name="OnboardingType" component={OnboardingTypeScreen} />
    <Stack.Screen name="OnboardingMenu" component={OnboardingMenuScreen} />
    <Stack.Screen name="OnboardingCrew" component={OnboardingCrewScreen} />
  </Stack.Navigator>
);
