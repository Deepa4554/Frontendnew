import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { RootState } from '../../core/store/rootReducer';
import { WarmColors as COLORS } from '../../shared/design/warmTheme';
import { consumePostOnboardingIntent } from '../../core/navigation/postOnboardingIntent';
import { useResponsive } from '../../core/utils/useResponsive';
import { withDesktopShell } from '../../shared/components/desktop/withDesktopShell';
import { withRouteGuard } from './withRouteGuard';
import { PendingOrdersHost } from '../../shared/components/PendingOrdersHost';
import { usePlanCategory } from '../../core/plan/planCategory';
import { canAccessRoute, isRouteHiddenByOrderType } from '../../core/auth/permissions';
import { useSettings } from '../../core/api/hooks/useSettings';
import { useLiveAccessSync } from '../../core/api/hooks/useAuth';
import { useOrdersRealtime } from '../../core/realtime/ordersRealtime';
import { usePushNotifications } from '../../core/notifications/usePushNotifications';

import { SuperAdminNavigator } from '../../features/superadmin/presentation/navigation/SuperAdminNavigator';
import { DashboardScreen } from '../../features/management/dashboard/presentation/screens/DashboardScreen';
import { IntegrationsHubScreen } from '../../features/management/integrations/presentation/screens/IntegrationsHubScreen';
import { WhatsAppSetupScreen } from '../../features/management/integrations/presentation/screens/WhatsAppSetupScreen';
import { DeliveryPartnerScreen } from '../../features/management/integrations/presentation/screens/DeliveryPartnerScreen';
import { BranchManagementScreen } from '../../features/management/branches/presentation/screens/BranchManagementScreen';
import { AIAssistantScreen } from '../../features/analytics/presentation/screens/AIAssistantScreen';
import { AIChatScreen } from '../../features/analytics/presentation/screens/AIChatScreen';
import { SubscriptionScreen } from '../../features/billing/subscription/presentation/screens/SubscriptionScreen';
import { CafeProfileScreen } from '../../features/management/profile/presentation/screens/CafeProfileScreen';
import { CafeSettingsScreen } from '../../features/management/profile/presentation/screens/CafeSettingsScreen';
import { PrinterSettingsScreen } from '../../features/management/profile/presentation/screens/PrinterSettingsScreen';
import { KitchenFlowSettingsScreen } from '../../features/management/profile/presentation/screens/KitchenFlowSettingsScreen';
import { StationManagementScreen } from '../../features/management/profile/presentation/screens/StationManagementScreen';
import { TaxSlabManagementScreen } from '../../features/management/profile/presentation/screens/TaxSlabManagementScreen';
import { OrderTypesSettingsScreen } from '../../features/management/profile/presentation/screens/OrderTypesSettingsScreen';
import { ShiftSettingsScreen } from '../../features/management/profile/presentation/screens/ShiftSettingsScreen';
import { AutoChargesSettingsScreen } from '../../features/management/profile/presentation/screens/AutoChargesSettingsScreen';
import { OffersScreen } from '../../features/management/profile/presentation/screens/OffersScreen';
import { ReceiptBuilderScreen } from '../../features/management/profile/presentation/screens/ReceiptBuilderScreen';
import { TeamPortalNavigator } from '../../features/management/staff/presentation/navigation/TeamPortalNavigator';
import { StaffAccessScreen } from '../../features/management/staff/presentation/screens/StaffAccessScreen';
import { StaffKitchenAssignmentScreen } from '../../features/management/staff/presentation/screens/StaffKitchenAssignmentScreen';
import { MyAttendanceScreen } from '../../features/management/staff/presentation/screens/MyAttendanceScreen';
import { MyPayslipsScreen } from '../../features/management/staff/presentation/screens/MyPayslipsScreen';
import { MyLeaveScreen } from '../../features/management/staff/presentation/screens/MyLeaveScreen';
import { MenuScreen } from '../../features/menu/presentation/screens/MenuScreen';
import { RecipeBuilderScreen } from '../../features/menu/presentation/screens/RecipeBuilderScreen';
import { InventoryScreen } from '../../features/inventory/stock/presentation/screens/InventoryScreen';
import { InventoryLedgerScreen } from '../../features/inventory/stock/presentation/screens/InventoryLedgerScreen';
import { PurchaseOrderScreen } from '../../features/inventory/stock/presentation/screens/PurchaseOrderScreen';
import { VendorManagementScreen } from '../../features/inventory/stock/presentation/screens/VendorManagementScreen';
import { StockTakeListScreen } from '../../features/inventory/stock/presentation/screens/StockTakeListScreen';
import { StockTakeDetailScreen } from '../../features/inventory/stock/presentation/screens/StockTakeDetailScreen';
import { VarianceReportScreen } from '../../features/inventory/stock/presentation/screens/VarianceReportScreen';
import { FoodCostReportScreen } from '../../features/inventory/stock/presentation/screens/FoodCostReportScreen';
import { ExpiringBatchesScreen } from '../../features/inventory/stock/presentation/screens/ExpiringBatchesScreen';
import { ReportsHubScreen } from '../../features/management/reports/presentation/screens/ReportsHubScreen';
import { StockReportScreen } from '../../features/management/reports/presentation/screens/StockReportScreen';
import { PurchaseReportScreen } from '../../features/management/reports/presentation/screens/PurchaseReportScreen';
import { RevenueReportScreen } from '../../features/management/reports/presentation/screens/RevenueReportScreen';
import { ProfitReportScreen } from '../../features/management/reports/presentation/screens/ProfitReportScreen';
import { SalesReportScreen } from '../../features/management/reports/presentation/screens/SalesReportScreen';
import { TaxGstReportScreen } from '../../features/management/reports/presentation/screens/TaxGstReportScreen';
import { ExpenseReportScreen } from '../../features/management/reports/presentation/screens/ExpenseReportScreen';
import { CrmReportScreen } from '../../features/management/reports/presentation/screens/CrmReportScreen';
import { OrderDetailReportScreen } from '../../features/management/reports/presentation/screens/OrderDetailReportScreen';
import { POSCheckoutScreen } from '../../features/ordering/pos/presentation/screens/POSCheckoutScreen';
import { QRMenuScreen } from '../../features/crm/presentation/screens/QRMenuScreen';
import { TokenDashboardScreen } from '../../features/ordering/tables/presentation/screens/TokenDashboardScreen';
import { TakeawayDeliveryScreen } from '../../features/ordering/tables/presentation/screens/TakeawayDeliveryScreen';
import { KDSScreen } from '../../features/kds/pipeline/presentation/screens/KDSScreen';
import { TableManagementScreen } from '../../features/ordering/tables/presentation/screens/TableManagementScreen';
import { BillingNavigator } from '../../features/billing/payment/presentation/navigation/BillingNavigator';
import { CRMNavigator } from '../../features/crm/presentation/navigation/CRMNavigator';
import { NotificationCenterScreen } from '../../features/management/notifications/presentation/screens/NotificationCenterScreen';
import { ApprovalWorkflowScreen } from '../../features/management/approvals/presentation/screens/ApprovalWorkflowScreen';
import { TaskManagementScreen } from '../../features/management/tasks/presentation/screens/TaskManagementScreen';
import { HelpCenterScreen } from '../../features/management/help/presentation/screens/HelpCenterScreen';
import { HelpArticleScreen } from '../../features/management/help/presentation/screens/HelpArticleScreen';
import { SupportTicketScreen } from '../../features/management/help/presentation/screens/SupportTicketScreen';
import { CafeExpensesScreen } from '../../features/management/expenses/presentation/screens/CafeExpensesScreen';
import { KhatabookScreen } from '../../features/management/khatabook/presentation/screens/KhatabookScreen';
import { TiffinScreen } from '../../features/tiffin/presentation/screens/TiffinScreen';
import { MoreScreen } from './MoreScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Every Stack.Screen/Tab.Screen's `component` must be a STABLE reference. withDesktopShell
// and withRouteGuard each return a brand-new function component on every call — passing one
// created inline in JSX hands React Navigation a different `component` identity on every
// AppNavigator re-render (useLiveAccessSync's 60s poll, useOrdersRealtime's pushes, any other
// Redux update reaching this component). React Navigation treats a changed `component` as a
// different screen and remounts it, discarding all local state — including whatever was
// mid-typing in a form, which is what pushed focus clean out of a textbox (e.g. Add Menu
// Item's Name field). Computing every wrapped screen once, at module load, fixes that; it's
// the same reason MainTabs itself (passed as a bare, already-stable reference below) never
// had this problem.
const PosTabScreenComp = withDesktopShell(POSCheckoutScreen, 'POS');
const OrdersTabScreenComp = withDesktopShell(TableManagementScreen, 'Orders');
const KdsTabScreenComp = withDesktopShell(KDSScreen, 'KDS');
const TokenTabScreenComp = withDesktopShell(TokenDashboardScreen, 'Token');
const MoreTabScreenComp = withDesktopShell(MoreScreen, 'More');

const TablesScreenComp = withRouteGuard(withDesktopShell(TableManagementScreen, 'Tables'), 'Tables');
const QRMenuScreenComp = withRouteGuard(withDesktopShell(QRMenuScreen, 'QRMenu'), 'QRMenu');
const TokenDashboardScreenComp = withRouteGuard(withDesktopShell(TokenDashboardScreen, 'TokenDashboard'), 'TokenDashboard');
const TakeawayDeliveryScreenComp = withRouteGuard(withDesktopShell(TakeawayDeliveryScreen, 'TakeawayDelivery'), 'TakeawayDelivery');
const BillingScreenComp = withRouteGuard(withDesktopShell(BillingNavigator, 'Billing'), 'Billing');
const CRMScreenComp = withRouteGuard(withDesktopShell(CRMNavigator, 'CRM'), 'CRM');
const TeamPortalScreenComp = withRouteGuard(withDesktopShell(TeamPortalNavigator, 'TeamPortal'), 'TeamPortal');
// Own route keys (not 'TeamPortal') — these must stay Owner/Manager-only even when a
// staff login has been granted plain "Team Portal" visibility via Custom Screen Access;
// see OWNER_MANAGER_ONLY_ROUTES in permissions.ts.
const StaffAccessScreenComp = withRouteGuard(StaffAccessScreen, 'StaffAccess');
const StaffKitchenAssignmentScreenComp = withRouteGuard(StaffKitchenAssignmentScreen, 'StaffKitchenAssignment');
const MyAttendanceScreenComp = withRouteGuard(withDesktopShell(MyAttendanceScreen, 'Attendance'), 'Attendance');
const MyPayslipsScreenComp = withRouteGuard(withDesktopShell(MyPayslipsScreen, 'Payroll'), 'Payroll');
const MyLeaveScreenComp = withRouteGuard(withDesktopShell(MyLeaveScreen, 'Leave'), 'Leave');
const MenuScreenComp = withRouteGuard(withDesktopShell(MenuScreen, 'Menu'), 'Menu');
const InventoryScreenComp = withRouteGuard(withDesktopShell(InventoryScreen, 'Inventory'), 'Inventory');
const RecipeBuilderScreenComp = withRouteGuard(withDesktopShell(RecipeBuilderScreen, 'Menu'), 'RecipeBuilder');
const InventoryLedgerScreenComp = withRouteGuard(withDesktopShell(InventoryLedgerScreen, 'Inventory'), 'InventoryLedger');
const PurchaseOrdersScreenComp = withRouteGuard(withDesktopShell(PurchaseOrderScreen, 'Inventory'), 'PurchaseOrders');
const VendorsScreenComp = withRouteGuard(withDesktopShell(VendorManagementScreen, 'Inventory'), 'Vendors');
const StockTakesScreenComp = withRouteGuard(withDesktopShell(StockTakeListScreen, 'Inventory'), 'StockTakes');
const StockTakeDetailScreenComp = withRouteGuard(withDesktopShell(StockTakeDetailScreen, 'Inventory'), 'StockTakes');
const VarianceReportScreenComp = withRouteGuard(withDesktopShell(VarianceReportScreen, 'Inventory'), 'VarianceReport');
const FoodCostReportScreenComp = withRouteGuard(withDesktopShell(FoodCostReportScreen, 'Inventory'), 'FoodCostReport');
const ExpiringBatchesScreenComp = withRouteGuard(withDesktopShell(ExpiringBatchesScreen, 'Inventory'), 'ExpiringBatches');
const ReportsHubScreenComp = withRouteGuard(withDesktopShell(ReportsHubScreen, 'Reports'), 'Reports');
const StockReportScreenComp = withRouteGuard(withDesktopShell(StockReportScreen, 'Reports'), 'StockReport');
const PurchaseReportScreenComp = withRouteGuard(withDesktopShell(PurchaseReportScreen, 'Reports'), 'PurchaseReport');
const RevenueReportScreenComp = withRouteGuard(withDesktopShell(RevenueReportScreen, 'Reports'), 'RevenueReport');
const ProfitReportScreenComp = withRouteGuard(withDesktopShell(ProfitReportScreen, 'Reports'), 'ProfitReport');
const SalesReportScreenComp = withRouteGuard(withDesktopShell(SalesReportScreen, 'Reports'), 'SalesReport');
const TaxGstReportScreenComp = withRouteGuard(withDesktopShell(TaxGstReportScreen, 'Reports'), 'TaxGstReport');
const ExpenseReportScreenComp = withRouteGuard(withDesktopShell(ExpenseReportScreen, 'Reports'), 'ExpenseReport');
const CrmReportScreenComp = withRouteGuard(withDesktopShell(CrmReportScreen, 'Reports'), 'CrmReport');
const OrderDetailReportScreenComp = withRouteGuard(withDesktopShell(OrderDetailReportScreen, 'Reports'), 'OrderDetailReport');
const DashboardScreenComp = withRouteGuard(withDesktopShell(DashboardScreen, 'Dashboard'), 'Dashboard');
const AIScreenComp = withRouteGuard(withDesktopShell(AIAssistantScreen, 'AI'), 'AI');
const AIChatScreenComp = withRouteGuard(withDesktopShell(AIChatScreen, 'AIChat'), 'AIChat');
const NotificationsScreenComp = withRouteGuard(withDesktopShell(NotificationCenterScreen, 'Notifications'), 'Notifications');
const ApprovalsScreenComp = withRouteGuard(withDesktopShell(ApprovalWorkflowScreen, 'Approvals'), 'Approvals');
const TasksScreenComp = withRouteGuard(withDesktopShell(TaskManagementScreen, 'Tasks'), 'Tasks');
const IntegrationsScreenComp = withRouteGuard(withDesktopShell(IntegrationsHubScreen, 'Integrations'), 'Integrations');
const WhatsAppSetupScreenComp = withRouteGuard(withDesktopShell(WhatsAppSetupScreen, 'WhatsAppSetup'), 'WhatsAppSetup');
const DeliveryPartnerScreenComp = withRouteGuard(withDesktopShell(DeliveryPartnerScreen, 'DeliveryPartner'), 'DeliveryPartner');
const BranchesScreenComp = withRouteGuard(withDesktopShell(BranchManagementScreen, 'Branches'), 'Branches');
const ExpensesScreenComp = withRouteGuard(withDesktopShell(CafeExpensesScreen, 'Expenses'), 'Expenses');
const KhatabookScreenComp = withRouteGuard(withDesktopShell(KhatabookScreen, 'Khatabook'), 'Khatabook');
const TiffinScreenComp = withRouteGuard(withDesktopShell(TiffinScreen, 'Tiffin'), 'Tiffin');
const SaaSScreenComp = withRouteGuard(withDesktopShell(SubscriptionScreen, 'SaaS'), 'SaaS');
const SuperAdminScreenComp = withRouteGuard(SuperAdminNavigator, 'SuperAdmin');
const ProfileScreenComp = withRouteGuard(withDesktopShell(CafeSettingsScreen, 'Profile'), 'Profile');
const PrinterSettingsScreenComp = withRouteGuard(withDesktopShell(PrinterSettingsScreen, 'Profile'), 'PrinterSettings');
const KitchenFlowSettingsScreenComp = withRouteGuard(withDesktopShell(KitchenFlowSettingsScreen, 'Profile'), 'KitchenFlowSettings');
const StationManagementScreenComp = withRouteGuard(withDesktopShell(StationManagementScreen, 'Profile'), 'StationManagement');
const TaxSlabManagementScreenComp = withRouteGuard(withDesktopShell(TaxSlabManagementScreen, 'Profile'), 'TaxSlabManagement');
const OrderTypesSettingsScreenComp = withRouteGuard(withDesktopShell(OrderTypesSettingsScreen, 'Profile'), 'OrderTypesSettings');
const ShiftSettingsScreenComp = withRouteGuard(withDesktopShell(ShiftSettingsScreen, 'Profile'), 'ShiftSettings');
const AutoChargesSettingsScreenComp = withRouteGuard(withDesktopShell(AutoChargesSettingsScreen, 'Profile'), 'AutoChargesSettings');
const OffersScreenComp = withRouteGuard(withDesktopShell(OffersScreen, 'Profile'), 'Offers');
const ReceiptBuilderScreenComp = withRouteGuard(withDesktopShell(ReceiptBuilderScreen, 'Profile'), 'ReceiptBuilder');
const CafeProfileDetailScreenComp = withRouteGuard(withDesktopShell(CafeProfileScreen, 'Profile'), 'CafeProfileDetail');
const HelpScreenComp = withRouteGuard(withDesktopShell(HelpCenterScreen, 'Help'), 'Help');
const HelpArticleScreenComp = withRouteGuard(withDesktopShell(HelpArticleScreen, 'Help'), 'HelpArticle');
const SupportTicketScreenComp = withRouteGuard(withDesktopShell(SupportTicketScreen, 'Help'), 'SupportTicket');

const TAB_ICON_MAP: Record<string, string> = {
  POS: 'cash-register',
  Orders: 'receipt',
  KDS: 'chef-hat',
  Token: 'ticket-confirmation-outline',
  More: 'view-grid-outline',
};

// Bottom tab bar on phones (native or a narrow browser window); the same 5
// tabs become a left sidebar rail once the viewport is desktop-wide, so a
// wide browser window doesn't waste it on an oddly-stretched phone tab bar.
// Everything beyond these 5 stays one tap away inside "More" either way.
const MainTabs = () => {
  const insets = useSafeAreaInsets();
  const { isWideLayout, isDesktopWeb } = useResponsive();
  const user = useSelector((s: RootState) => s.auth.user);
  const { category: planCategory } = usePlanCategory();
  const { data: settings } = useSettings();
  // Same canAccessRoute the More screen and every pushed Stack screen already go
  // through — a staff member in Custom mode without a given tab loses its icon
  // from the bar entirely, not just the screens reachable from More.
  const showPosTab = canAccessRoute(user ?? undefined, 'POS', planCategory);
  const showOrdersTab =
    canAccessRoute(user ?? undefined, 'Tables', planCategory) && !isRouteHiddenByOrderType('Tables', settings);
  const showKdsTab = canAccessRoute(user ?? undefined, 'KDS', planCategory);
  // 'TokenDashboard' — the same catalog key the pushed Token Orders route is guarded by,
  // so revoking it hides the tab as well as the More entry. "More" is deliberately left
  // ungated: it's the only way back to sign-out/settings, and everything inside it is
  // already filtered item by item.
  const showTokenTab = canAccessRoute(user ?? undefined, 'TokenDashboard', planCategory);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        // On a desktop-web browser, DesktopAppShell's own sidebar (wired onto each
        // tab below) replaces this bar entirely, so it's hidden rather than shown
        // side-by-side with a second sidebar. Native tablets keep the original
        // left-rail tab bar untouched — this only checks the web-specific flag.
        tabBarPosition: isWideLayout ? 'left' : 'bottom',
        tabBarIcon: ({ color, size }) => (
          <Icon name={TAB_ICON_MAP[route.name] ?? 'circle'} size={size} color={color} />
        ),
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: isDesktopWeb
          ? { display: 'none' }
          : isWideLayout
          ? {
              backgroundColor: COLORS.cardAlt,
              borderRightColor: COLORS.divider,
              borderRightWidth: 1,
              width: 96,
              paddingTop: 16,
            }
          : {
              backgroundColor: COLORS.cardAlt,
              borderTopColor: COLORS.divider,
              height: 56 + Math.max(insets.bottom, 12),
              paddingBottom: Math.max(insets.bottom, 12),
              paddingTop: 6,
            },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      })}
    >
      {showPosTab && <Tab.Screen name="POS" component={PosTabScreenComp} />}
      {showOrdersTab && <Tab.Screen name="Orders" component={OrdersTabScreenComp} />}
      {showKdsTab && <Tab.Screen name="KDS" component={KdsTabScreenComp} />}
      {showTokenTab && <Tab.Screen name="Token" component={TokenTabScreenComp} />}
      <Tab.Screen name="More" component={MoreTabScreenComp} />
    </Tab.Navigator>
  );
};

// Everything reachable from the "More" screen is pushed on top of the tabs,
// so the bottom bar always stays clean at 5 items. Every pushed screen gets
// a header with a back arrow so there's always an obvious way to return.
export const AppNavigator = () => {
  // Set by the onboarding wizard ("Start from scratch" / "Import CSV") right before
  // it marks onboarding complete, so the very first screen after setup is the real
  // Menu screen (where items actually get added) instead of always defaulting to POS.
  const [initialRoute] = React.useState(() => consumePostOnboardingIntent() ?? 'MainTabs');
  // The handful of screens below still lean on the native stack header for their title.
  // On desktop web that header is a second, differently-styled bar sitting under the
  // shell topbar — they render DesktopPageHeader in-content instead, so hide it there.
  const { isDesktopWeb } = useResponsive();
  const stackHeader = (title: string) =>
    isDesktopWeb ? { headerShown: false } : { title, headerStyle: { backgroundColor: COLORS.background } };
  // Keeps this device's role/screen-access fresh, pushed via useOrdersRealtime's
  // "accessChanged" event below with only a rarely-firing poll as a safety net — see the
  // hook's own doc comment.
  useLiveAccessSync();
  // Live push for orders/tables/KDS and access changes (see useOrders.ts/useTables.ts/
  // useAuth.ts's safety-net refetchIntervals) — mounted here so it starts on login and
  // stops on logout, same lifecycle as useLiveAccessSync above (AppNavigator only renders
  // once authenticated).
  useOrdersRealtime();
  // Registers this device for FCM push (order placed/pending-confirmation/ready-to-serve —
  // see CafePosDbContext.SaveChangesAsync on the backend) — same mount-on-login lifecycle.
  usePushNotifications();

  return (
    <>
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.cardAlt },
        headerTintColor: COLORS.heading,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Tables" component={TablesScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="QRMenu" component={QRMenuScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="TokenDashboard" component={TokenDashboardScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="TakeawayDelivery" component={TakeawayDeliveryScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Billing" component={BillingScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="CRM" component={CRMScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="TeamPortal" component={TeamPortalScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="StaffAccess" component={StaffAccessScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="StaffKitchenAssignment" component={StaffKitchenAssignmentScreenComp} options={{ headerShown: false }} />
      {/* Self-service, reachable by every role (incl. Waiter/Chef/KitchenStaff, who
          can't reach TeamPortal at all) — gated by plan only via the Attendance/Payroll/Leave
          catalog keys, never by FLOOR_STAFF_HIDDEN_ROUTES (TeamPortal is, these aren't). */}
      <Stack.Screen name="MyAttendance" component={MyAttendanceScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="MyPayslips" component={MyPayslipsScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="MyLeave" component={MyLeaveScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Menu" component={MenuScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Inventory" component={InventoryScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="RecipeBuilder" component={RecipeBuilderScreenComp} options={stackHeader('Recipe Builder')} />
      <Stack.Screen name="InventoryLedger" component={InventoryLedgerScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="PurchaseOrders" component={PurchaseOrdersScreenComp} options={stackHeader('Purchase Orders')} />
      <Stack.Screen name="Vendors" component={VendorsScreenComp} options={stackHeader('Vendors')} />
      <Stack.Screen name="StockTakes" component={StockTakesScreenComp} options={stackHeader('Stock Takes')} />
      <Stack.Screen name="StockTakeDetail" component={StockTakeDetailScreenComp} options={stackHeader('Stock Take')} />
      <Stack.Screen name="VarianceReport" component={VarianceReportScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="FoodCostReport" component={FoodCostReportScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="ExpiringBatches" component={ExpiringBatchesScreenComp} options={stackHeader('Expiring Batches')} />
      {/* Every Reports screen draws its own in-content back arrow + heading (the
          InventoryLedger pattern), so the native header would just duplicate it. */}
      <Stack.Screen name="Reports" component={ReportsHubScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="StockReport" component={StockReportScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="PurchaseReport" component={PurchaseReportScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="RevenueReport" component={RevenueReportScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="ProfitReport" component={ProfitReportScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="SalesReport" component={SalesReportScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="TaxGstReport" component={TaxGstReportScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="ExpenseReport" component={ExpenseReportScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="CrmReport" component={CrmReportScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="OrderDetailReport" component={OrderDetailReportScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Dashboard" component={DashboardScreenComp} options={{ headerShown: false }} />
      {/* AI Assistant lost its bottom-tab slot to Token Orders — still reachable from
          More (mobile) and the sidebar (desktop web) as a plain pushed screen instead. */}
      <Stack.Screen name="AI" component={AIScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="AIChat" component={AIChatScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Notifications" component={NotificationsScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Approvals" component={ApprovalsScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Tasks" component={TasksScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Integrations" component={IntegrationsScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="WhatsAppSetup" component={WhatsAppSetupScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="DeliveryPartner" component={DeliveryPartnerScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Branches" component={BranchesScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Expenses" component={ExpensesScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Khatabook" component={KhatabookScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Tiffin" component={TiffinScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="SaaS" component={SaaSScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="SuperAdmin" component={SuperAdminScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="PrinterSettings" component={PrinterSettingsScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="KitchenFlowSettings" component={KitchenFlowSettingsScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="StationManagement" component={StationManagementScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="TaxSlabManagement" component={TaxSlabManagementScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="OrderTypesSettings" component={OrderTypesSettingsScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="ShiftSettings" component={ShiftSettingsScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="AutoChargesSettings" component={AutoChargesSettingsScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Offers" component={OffersScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="ReceiptBuilder" component={ReceiptBuilderScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="CafeProfileDetail" component={CafeProfileDetailScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="Help" component={HelpScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="HelpArticle" component={HelpArticleScreenComp} options={{ headerShown: false }} />
      <Stack.Screen name="SupportTicket" component={SupportTicketScreenComp} options={{ headerShown: false }} />
    </Stack.Navigator>
    <PendingOrdersHost />
    </>
  );
};
