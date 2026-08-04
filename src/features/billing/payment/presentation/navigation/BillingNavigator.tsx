import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BillingScreen } from '../screens/BillingScreen';

const Stack = createNativeStackNavigator();

export const BillingNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="BillingMain" component={BillingScreen} />
  </Stack.Navigator>
);
