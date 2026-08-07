import { AccessUser, canAccessRoute, isRouteHiddenByOrderType } from '../auth/permissions';
import { PlanCategory } from '../plan/planCategory';
import { ApiSettings } from '../api/settingsApi';

export interface ScreenSearchEntry {
  id: string;
  label: string;
  /** Extra terms this entry should also match on (abbreviations, alt names). */
  keywords?: string[];
  icon: string;
  /** Exact key already used by canAccessRoute/withRouteGuard for this destination —
   * not always the same as the route name it navigates to (e.g. MyAttendance is
   * guarded under 'Attendance', StockTakeDetail's parent list under 'StockTakes'). */
  permissionRouteKey: string;
  navigate: (navigation: any) => void;
}

const nav = (route: string) => (navigation: any) => navigation.navigate(route);
const navTab = (parent: string, tab: string) => (navigation: any) =>
  navigation.navigate(parent, { screen: tab });
const navNestedTab = (parent: string, tab: string, child: string) => (navigation: any) =>
  navigation.navigate(parent, { screen: tab, params: { screen: child } });

/**
 * One flat, hand-maintained list of every screen/sub-screen/submenu reachable in the
 * app, covering AppNavigator.tsx's top-level Stack.Screens plus every nested navigator
 * (CRMNavigator, TeamPortalNavigator, SuperAdminNavigator). This is the single source
 * global search reads from — see the plan doc for why this replaced three independently
 * drifting hardcoded lists (SearchController.cs's category map, and a copy each in
 * GlobalSearchTrigger.tsx / DesktopAppShell.tsx) instead of runtime-deriving from
 * React Navigation (screens here are conditionally registered by role/plan/custom
 * access, so there's no static tree to walk that's simpler than this).
 *
 * Deliberately excluded: screens that need a specific record id and are only ever
 * reached by tapping a row in their own parent list (verified against every
 * navigation.navigate call site) — StockTakeDetail, CustomerProfile, StaffProfile,
 * EditShift, PayrollRunDetail, SupportTicket, StaffAccess, StaffKitchenAssignment.
 * Their parent lists (StockTakes, CRM's Customers tab, Team Overview, Payroll Runs,
 * Help Center) are indexed below, so they stay reachable.
 */
export const SCREEN_SEARCH_INDEX: ScreenSearchEntry[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'view-dashboard-outline', permissionRouteKey: 'Dashboard', navigate: nav('Dashboard') },
  { id: 'pos', label: 'POS', keywords: ['checkout', 'point of sale'], icon: 'cash-register', permissionRouteKey: 'POS', navigate: navTab('MainTabs', 'POS') },
  { id: 'tables', label: 'Tables', keywords: ['orders', 'dine in'], icon: 'table-chair', permissionRouteKey: 'Tables', navigate: nav('Tables') },
  { id: 'kds', label: 'Kitchen', keywords: ['kds', 'kitchen display'], icon: 'chef-hat', permissionRouteKey: 'KDS', navigate: navTab('MainTabs', 'KDS') },
  { id: 'token', label: 'Token Orders', icon: 'ticket-confirmation-outline', permissionRouteKey: 'TokenDashboard', navigate: nav('TokenDashboard') },
  { id: 'takeaway', label: 'Takeaway & Delivery', keywords: ['delivery'], icon: 'moped-outline', permissionRouteKey: 'TakeawayDelivery', navigate: nav('TakeawayDelivery') },
  { id: 'qrmenu', label: 'QR Ordering', keywords: ['qr code'], icon: 'qrcode', permissionRouteKey: 'QRMenu', navigate: nav('QRMenu') },
  { id: 'billing', label: 'Billing', icon: 'credit-card-outline', permissionRouteKey: 'Billing', navigate: nav('Billing') },

  // CRM
  { id: 'customers', label: 'Customers', keywords: ['crm', 'customer directory'], icon: 'account-heart', permissionRouteKey: 'CRM', navigate: navNestedTab('CRM', 'Customers', 'CustomerDirectory') },
  { id: 'coupons', label: 'Coupons', icon: 'ticket-percent-outline', permissionRouteKey: 'CRM', navigate: navNestedTab('CRM', 'Customers', 'Coupons') },
  { id: 'giftcards', label: 'Gift Cards', icon: 'gift-outline', permissionRouteKey: 'CRM', navigate: navNestedTab('CRM', 'Customers', 'GiftCards') },
  { id: 'crm-orderhistory', label: 'Order History', icon: 'history', permissionRouteKey: 'CRM', navigate: navNestedTab('CRM', 'Customers', 'OrderHistory') },
  { id: 'favourites', label: 'Favourites', icon: 'heart-outline', permissionRouteKey: 'CRM', navigate: navNestedTab('CRM', 'Customers', 'Favourites') },
  { id: 'loyaltypoints', label: 'Loyalty Points', keywords: ['points'], icon: 'star-circle-outline', permissionRouteKey: 'CRM', navigate: navTab('CRM', 'Points') },
  { id: 'crminsights', label: 'CRM Insights', icon: 'chart-box-outline', permissionRouteKey: 'CRM', navigate: navTab('CRM', 'Insights') },

  // Team Portal
  { id: 'teamportal', label: 'Team Portal', keywords: ['team overview', 'staff'], icon: 'account-group', permissionRouteKey: 'TeamPortal', navigate: navNestedTab('TeamPortal', 'Overview', 'TeamOverview') },
  { id: 'teamschedule', label: 'Team Schedule', keywords: ['shifts'], icon: 'calendar-outline', permissionRouteKey: 'TeamPortal', navigate: navNestedTab('TeamPortal', 'Schedule', 'TeamSchedule') },
  { id: 'attendance', label: 'Attendance', icon: 'clock-check-outline', permissionRouteKey: 'Attendance', navigate: navTab('TeamPortal', 'Attendance') },
  { id: 'leave', label: 'Leave Requests', icon: 'calendar-remove-outline', permissionRouteKey: 'Leave', navigate: navTab('TeamPortal', 'Leave') },
  { id: 'performance', label: 'Performance Reports', icon: 'chart-line', permissionRouteKey: 'TeamPortal', navigate: navTab('TeamPortal', 'Performance') },
  { id: 'payrollruns', label: 'Payroll', keywords: ['payroll runs'], icon: 'cash-multiple', permissionRouteKey: 'Payroll', navigate: navNestedTab('TeamPortal', 'Payroll', 'PayrollRuns') },
  { id: 'loans', label: 'Staff Loans', icon: 'hand-coin-outline', permissionRouteKey: 'Loans', navigate: navTab('TeamPortal', 'Loans') },
  { id: 'hrreports', label: 'HR Reports', icon: 'file-chart-outline', permissionRouteKey: 'HRReports', navigate: navNestedTab('TeamPortal', 'Overview', 'HRReports') },

  // Self-service
  { id: 'myattendance', label: 'My Attendance', icon: 'clock-check-outline', permissionRouteKey: 'Attendance', navigate: nav('MyAttendance') },
  { id: 'myleave', label: 'My Leave', icon: 'calendar-remove-outline', permissionRouteKey: 'Leave', navigate: nav('MyLeave') },
  { id: 'mypayslips', label: 'My Payslips', icon: 'file-document-outline', permissionRouteKey: 'Payroll', navigate: nav('MyPayslips') },

  // Menu / Inventory
  { id: 'menu', label: 'Menu', icon: 'food', permissionRouteKey: 'Menu', navigate: nav('Menu') },
  { id: 'recipebuilder', label: 'Recipe Builder', keywords: ['recipes'], icon: 'chef-hat', permissionRouteKey: 'RecipeBuilder', navigate: nav('RecipeBuilder') },
  { id: 'inventory', label: 'Inventory', icon: 'clipboard-list', permissionRouteKey: 'Inventory', navigate: nav('Inventory') },
  { id: 'inventoryledger', label: 'Inventory Ledger', icon: 'notebook-outline', permissionRouteKey: 'InventoryLedger', navigate: nav('InventoryLedger') },
  { id: 'purchaseorders', label: 'Purchase Orders', icon: 'cart-outline', permissionRouteKey: 'PurchaseOrders', navigate: nav('PurchaseOrders') },
  { id: 'vendors', label: 'Vendors', icon: 'truck-outline', permissionRouteKey: 'Vendors', navigate: nav('Vendors') },
  { id: 'stocktakes', label: 'Stock Takes', icon: 'clipboard-check-outline', permissionRouteKey: 'StockTakes', navigate: nav('StockTakes') },
  { id: 'variancereport', label: 'Variance Report', icon: 'file-compare', permissionRouteKey: 'VarianceReport', navigate: nav('VarianceReport') },
  { id: 'foodcostreport', label: 'Food Cost Report', icon: 'food-variant', permissionRouteKey: 'FoodCostReport', navigate: nav('FoodCostReport') },
  { id: 'expiringbatches', label: 'Expiring Batches', icon: 'timer-sand-alert', permissionRouteKey: 'ExpiringBatches', navigate: nav('ExpiringBatches') },

  // Reports
  { id: 'reports', label: 'Reports', icon: 'file-chart-outline', permissionRouteKey: 'Reports', navigate: nav('Reports') },
  { id: 'stockreport', label: 'Stock Report', icon: 'package-variant', permissionRouteKey: 'StockReport', navigate: nav('StockReport') },
  { id: 'purchasereport', label: 'Purchase Report', icon: 'cart-outline', permissionRouteKey: 'PurchaseReport', navigate: nav('PurchaseReport') },
  { id: 'revenuereport', label: 'Revenue Report', icon: 'chart-line', permissionRouteKey: 'RevenueReport', navigate: nav('RevenueReport') },
  { id: 'profitreport', label: 'Profit Report', icon: 'chart-areaspline', permissionRouteKey: 'ProfitReport', navigate: nav('ProfitReport') },
  { id: 'salesreport', label: 'Sales Report', icon: 'chart-bar', permissionRouteKey: 'SalesReport', navigate: nav('SalesReport') },
  { id: 'taxgstreport', label: 'Tax / GST Report', keywords: ['gst', 'tax'], icon: 'receipt-text-outline', permissionRouteKey: 'TaxGstReport', navigate: nav('TaxGstReport') },
  { id: 'expensereport', label: 'Expense Report', icon: 'cash-minus', permissionRouteKey: 'ExpenseReport', navigate: nav('ExpenseReport') },
  { id: 'crmreport', label: 'CRM Report', icon: 'account-heart-outline', permissionRouteKey: 'CrmReport', navigate: nav('CrmReport') },
  { id: 'orderdetailreport', label: 'Order Detail Report', icon: 'receipt', permissionRouteKey: 'OrderDetailReport', navigate: nav('OrderDetailReport') },

  // Insights / Workflow
  { id: 'ai', label: 'AI Assistant', icon: 'creation', permissionRouteKey: 'AI', navigate: nav('AI') },
  { id: 'aichat', label: 'AI Chat', icon: 'chat-processing-outline', permissionRouteKey: 'AIChat', navigate: nav('AIChat') },
  { id: 'notifications', label: 'Notifications', icon: 'bell-outline', permissionRouteKey: 'Notifications', navigate: nav('Notifications') },
  { id: 'approvals', label: 'Approvals', icon: 'check-decagram', permissionRouteKey: 'Approvals', navigate: nav('Approvals') },
  { id: 'tasks', label: 'Tasks', icon: 'format-list-checks', permissionRouteKey: 'Tasks', navigate: nav('Tasks') },

  // Business
  { id: 'integrations', label: 'Integrations', icon: 'api', permissionRouteKey: 'Integrations', navigate: nav('Integrations') },
  { id: 'whatsappsetup', label: 'WhatsApp Business', keywords: ['whatsapp'], icon: 'whatsapp', permissionRouteKey: 'WhatsAppSetup', navigate: nav('WhatsAppSetup') },
  { id: 'branches', label: 'Branches', icon: 'storefront', permissionRouteKey: 'Branches', navigate: nav('Branches') },
  { id: 'expenses', label: 'Expenses', icon: 'cash-minus', permissionRouteKey: 'Expenses', navigate: nav('Expenses') },
  { id: 'saas', label: 'Subscription', keywords: ['plan', 'billing plan'], icon: 'cloud-check', permissionRouteKey: 'SaaS', navigate: nav('SaaS') },

  // Super Admin
  { id: 'superadmin-overview', label: 'Super Admin', keywords: ['platform overview'], icon: 'shield-crown', permissionRouteKey: 'SuperAdmin', navigate: navTab('SuperAdmin', 'Overview') },
  { id: 'tenants', label: 'Tenants', icon: 'domain', permissionRouteKey: 'SuperAdmin', navigate: navTab('SuperAdmin', 'Tenants') },
  { id: 'auditlogs', label: 'Audit Logs', icon: 'clipboard-text-clock', permissionRouteKey: 'SuperAdmin', navigate: navTab('SuperAdmin', 'AuditLogs') },
  { id: 'superadmin-support', label: 'Support Tickets (Admin)', icon: 'lifebuoy', permissionRouteKey: 'SuperAdmin', navigate: navTab('SuperAdmin', 'Support') },
  { id: 'platformexpenses', label: 'Platform Expenses', icon: 'cash-multiple', permissionRouteKey: 'SuperAdmin', navigate: navTab('SuperAdmin', 'Expenses') },

  // Settings
  { id: 'profile', label: 'Cafe Settings', keywords: ['settings'], icon: 'store-cog', permissionRouteKey: 'Profile', navigate: nav('Profile') },
  { id: 'printersettings', label: 'Printer Settings', icon: 'printer-outline', permissionRouteKey: 'PrinterSettings', navigate: nav('PrinterSettings') },
  { id: 'kitchenflowsettings', label: 'Kitchen Flow Settings', icon: 'chef-hat', permissionRouteKey: 'KitchenFlowSettings', navigate: nav('KitchenFlowSettings') },
  { id: 'stationmanagement', label: 'Station Management', icon: 'silverware', permissionRouteKey: 'StationManagement', navigate: nav('StationManagement') },
  { id: 'taxslabmanagement', label: 'Tax Slab Management', keywords: ['tax slab', 'gst slab'], icon: 'percent-outline', permissionRouteKey: 'TaxSlabManagement', navigate: nav('TaxSlabManagement') },
  { id: 'ordertypessettings', label: 'Order Types Settings', icon: 'format-list-bulleted-type', permissionRouteKey: 'OrderTypesSettings', navigate: nav('OrderTypesSettings') },
  { id: 'autochargessettings', label: 'Auto Charges Settings', icon: 'cash-plus', permissionRouteKey: 'AutoChargesSettings', navigate: nav('AutoChargesSettings') },
  { id: 'receiptbuilder', label: 'Receipt Builder', icon: 'receipt', permissionRouteKey: 'ReceiptBuilder', navigate: nav('ReceiptBuilder') },
  { id: 'cafeprofiledetail', label: 'Cafe Profile', icon: 'store', permissionRouteKey: 'CafeProfileDetail', navigate: nav('CafeProfileDetail') },

  // Help
  { id: 'help', label: 'Help Center', keywords: ['support'], icon: 'lifebuoy', permissionRouteKey: 'Help', navigate: nav('Help') },
  { id: 'helparticle', label: 'Help Article', icon: 'book-open-outline', permissionRouteKey: 'Help', navigate: nav('HelpArticle') },
];

const rank = (label: string, term: string): number => {
  const l = label.toLowerCase();
  if (l === term) return 0;
  if (l.startsWith(term)) return 1;
  return 2;
};

export interface ScreenSearchContext {
  user: AccessUser | undefined;
  planCategory: PlanCategory;
  settings: Pick<ApiSettings, 'dineInEnabled'> | undefined;
}

const MAX_SCREEN_RESULTS = 6;

export function searchScreens(query: string, ctx: ScreenSearchContext): ScreenSearchEntry[] {
  const term = query.trim().toLowerCase();
  if (term.length < 2) return [];

  return SCREEN_SEARCH_INDEX.filter((entry) => {
    const haystacks = [entry.label, ...(entry.keywords ?? [])];
    if (!haystacks.some((h) => h.toLowerCase().includes(term))) return false;
    return (
      canAccessRoute(ctx.user, entry.permissionRouteKey, ctx.planCategory) &&
      !isRouteHiddenByOrderType(entry.permissionRouteKey, ctx.settings)
    );
  })
    .sort((a, b) => {
      const ra = Math.min(rank(a.label, term), ...(a.keywords ?? []).map((k) => rank(k, term)));
      const rb = Math.min(rank(b.label, term), ...(b.keywords ?? []).map((k) => rank(k, term)));
      if (ra !== rb) return ra - rb;
      return a.label.localeCompare(b.label);
    })
    .slice(0, MAX_SCREEN_RESULTS);
}
