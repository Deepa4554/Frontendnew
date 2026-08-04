import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SuperAdminDashboard } from '../screens/SuperAdminDashboard';
import { TenantManagementScreen } from '../screens/TenantManagementScreen';
import { AuditLogScreen } from '../screens/AuditLogScreen';
import { SupportTicketsScreen } from '../screens/SupportTicketsScreen';
import { ExpensesScreen } from '../screens/ExpensesScreen';

const Tab = createBottomTabNavigator();

export const SuperAdminNavigator = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let iconName = 'shield-crown';

          if (route.name === 'Overview') iconName = 'monitor-dashboard';
          else if (route.name === 'Tenants') iconName = 'domain';
          else if (route.name === 'AuditLogs') iconName = 'clipboard-text-clock';
          else if (route.name === 'Support') iconName = 'lifebuoy';
          else if (route.name === 'Expenses') iconName = 'cash-multiple';

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.error,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.error,
          borderTopWidth: 2,
          height: 56 + Math.max(insets.bottom, 12),
          paddingBottom: Math.max(insets.bottom, 12),
          paddingTop: 6,
        },
      })}
    >
      <Tab.Screen name="Overview" component={SuperAdminDashboard} />
      <Tab.Screen name="Tenants" component={TenantManagementScreen} />
      <Tab.Screen name="AuditLogs" component={AuditLogScreen} options={{ tabBarLabel: 'Audit Log' }} />
      <Tab.Screen name="Support" component={SupportTicketsScreen} options={{ tabBarLabel: 'Support' }} />
      <Tab.Screen name="Expenses" component={ExpensesScreen} />
    </Tab.Navigator>
  );
};
