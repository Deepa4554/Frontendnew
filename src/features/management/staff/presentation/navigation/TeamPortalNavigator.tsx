import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { usePlanCategory } from '../../../../../core/plan/planCategory';
import { RootState } from '../../../../../core/store/rootReducer';
import { canAccessRoute } from '../../../../../core/auth/permissions';

import { TeamOverviewScreen } from '../screens/TeamOverviewScreen';
import { StaffProfileScreen } from '../screens/StaffProfileScreen';
import { TeamScheduleScreen } from '../screens/TeamScheduleScreen';
import { EditShiftScreen } from '../screens/EditShiftScreen';
import { PerformanceReportsScreen } from '../screens/PerformanceReportsScreen';
import { PayrollRunsScreen } from '../screens/PayrollRunsScreen';
import { PayrollRunDetailScreen } from '../screens/PayrollRunDetailScreen';
import { LeaveRequestsScreen } from '../screens/LeaveRequestsScreen';
import { AttendanceScreen } from '../screens/AttendanceScreen';
import { LoansScreen } from '../screens/LoansScreen';
import { HRReportsScreen } from '../screens/HRReportsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const OverviewStack = () => {
  // HRReports has its own catalog key and its own web URL (linking.ts → team/hr-reports),
  // so it can't ride on plain Team Portal access. Not registering the screen at all is the
  // right guard here rather than withRouteGuard: that HOC replaces onto 'MainTabs', which
  // doesn't exist inside this nested stack.
  const user = useSelector((s: RootState) => s.auth.user);
  const { category: planCategory } = usePlanCategory();
  const canSeeHRReports = canAccessRoute(user ?? undefined, 'HRReports', planCategory);
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TeamOverview" component={TeamOverviewScreen} />
      <Stack.Screen name="StaffProfile" component={StaffProfileScreen} />
      {canSeeHRReports && <Stack.Screen name="HRReports" component={HRReportsScreen} />}
    </Stack.Navigator>
  );
};

const ScheduleStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="TeamSchedule" component={TeamScheduleScreen} />
    <Stack.Screen name="EditShift" component={EditShiftScreen} />
  </Stack.Navigator>
);

const PayrollStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="PayrollRuns" component={PayrollRunsScreen} />
    <Stack.Screen name="PayrollRunDetail" component={PayrollRunDetailScreen} />
  </Stack.Navigator>
);

const ICON_MAP: Record<string, string> = {
  Overview: 'account-group-outline',
  Schedule: 'calendar-outline',
  Leave: 'calendar-remove-outline',
  Performance: 'chart-line',
  Payroll: 'cash-multiple',
  Attendance: 'clock-check-outline',
  Loans: 'hand-coin-outline',
};

export const TeamPortalNavigator = () => {
  const COLORS = useThemeColors();
  // Roster (Overview) is a Basic-plan feature — every cafe needs to be able to add a
  // Waiter/Cashier login regardless of plan. Scheduling/Leave/Performance/Payroll/
  // Attendance/Loans are the HR-analytics tooling that's actually Plus-exclusive (see
  // StaffController/AttendanceController/PayrollController/StaffLoansController), so
  // those tabs simply don't exist for a Basic-plan cafe rather than showing a
  // locked/greyed state — matches how other Plus-only routes are hidden elsewhere.
  const { hasPlan, category: planCategory } = usePlanCategory();
  const showPlusTabs = hasPlan('PLUS');
  // Getting into TeamPortal at all (the outer AppNavigator guard) only proves the login
  // has plain "Team Portal" access — Attendance/Leave/Payroll/Loans are separately
  // toggleable in Custom Screen Access (see screenCatalog.ts), so each needs its own
  // canAccessRoute check here too, or a Custom-mode grant of just "Team Portal" would
  // silently hand over every HR tab regardless of what was actually turned on for them.
  // Schedule/Performance have no catalog entry of their own — they stay bundled with
  // base Team Portal access, same as Overview.
  const user = useSelector((s: RootState) => s.auth.user);
  const showAttendanceTab = showPlusTabs && canAccessRoute(user ?? undefined, 'Attendance', planCategory);
  const showLeaveTab = showPlusTabs && canAccessRoute(user ?? undefined, 'Leave', planCategory);
  const showPayrollTab = showPlusTabs && canAccessRoute(user ?? undefined, 'Payroll', planCategory);
  const showLoansTab = showPlusTabs && canAccessRoute(user ?? undefined, 'Loans', planCategory);
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
    <Tab.Screen name="Overview" component={OverviewStack} />
    {showPlusTabs && <Tab.Screen name="Schedule" component={ScheduleStack} />}
    {showAttendanceTab && <Tab.Screen name="Attendance" component={AttendanceScreen} />}
    {showLeaveTab && <Tab.Screen name="Leave" component={LeaveRequestsScreen} />}
    {showPlusTabs && <Tab.Screen name="Performance" component={PerformanceReportsScreen} />}
    {showPayrollTab && <Tab.Screen name="Payroll" component={PayrollStack} />}
    {showLoansTab && <Tab.Screen name="Loans" component={LoansScreen} />}
  </Tab.Navigator>
  );
};
