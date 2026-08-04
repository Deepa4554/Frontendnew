import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../../core/theme/useThemeColors';

import { CustomerDirectoryScreen } from '../screens/CustomerDirectoryScreen';
import { CustomerProfileScreen } from '../screens/CustomerProfileScreen';
import { CouponsScreen } from '../screens/CouponsScreen';
import { GiftCardsScreen } from '../screens/GiftCardsScreen';
import { OrderHistoryScreen } from '../screens/OrderHistoryScreen';
import { FavouritesScreen } from '../screens/FavouritesScreen';
import { LoyaltyPointsScreen } from '../screens/LoyaltyPointsScreen';
import { CRMInsightsScreen } from '../screens/CRMInsightsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const CustomersStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="CustomerDirectory" component={CustomerDirectoryScreen} />
    <Stack.Screen name="CustomerProfile" component={CustomerProfileScreen} />
    <Stack.Screen name="Coupons" component={CouponsScreen} />
    <Stack.Screen name="GiftCards" component={GiftCardsScreen} />
    <Stack.Screen name="OrderHistory" component={OrderHistoryScreen} />
    <Stack.Screen name="Favourites" component={FavouritesScreen} />
  </Stack.Navigator>
);

const ICON_MAP: Record<string, string> = {
  Customers: 'account-group',
  Points: 'star-circle-outline',
  Insights: 'chart-box-outline',
};

export const CRMNavigator = () => {
  const COLORS = useThemeColors();
  return (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarIcon: ({ color, size }) => (
        <Icon name={ICON_MAP[route.name] ?? 'circle'} size={size} color={color} />
      ),
      tabBarActiveTintColor: COLORS.accent,
      tabBarInactiveTintColor: COLORS.muted,
      tabBarStyle: {
        backgroundColor: COLORS.cardAlt,
        borderTopColor: COLORS.divider,
        height: 64,
        paddingBottom: 8,
        paddingTop: 6,
      },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
    })}
  >
    <Tab.Screen name="Customers" component={CustomersStack} />
    <Tab.Screen name="Points" component={LoyaltyPointsScreen} />
    <Tab.Screen name="Insights" component={CRMInsightsScreen} />
  </Tab.Navigator>
  );
};
