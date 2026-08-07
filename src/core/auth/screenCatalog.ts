import { PlanCategory } from '../plan/planCategory';

/**
 * Every screen an Owner can grant/revoke for a staff login via the Staff Access screen.
 * Mirrors CafePosApi/Infrastructure/ScreenCatalog.cs key-for-key and plan-for-plan — the
 * backend re-validates against its own copy on every write, this one only drives the UI
 * (which screens the picker offers, grouped parent → children, and greyed out below the
 * cafe's current plan). SuperAdmin is deliberately absent: it's gated by
 * AppUser.isPlatformAdmin, not role or screen access, and is never staff-assignable.
 *
 * `parent` groups a drill-down screen under the screen it's normally reached from (e.g.
 * RecipeBuilder is only ever opened from inside Menu) — every one of these is still its
 * own real route in AppNavigator, so it's independently guardable, just presented as a
 * "child" in the picker so the list reads the way the app is actually organized.
 */
export interface ScreenCatalogEntry {
  key: string;
  label: string;
  icon: string;
  minPlan: PlanCategory;
  parent?: string;
}

export const SCREEN_CATALOG: ScreenCatalogEntry[] = [
  { key: 'POS', label: 'POS Checkout', icon: 'cash-register', minPlan: 'NORMAL' },
  { key: 'Tables', label: 'Tables', icon: 'table-chair', minPlan: 'NORMAL' },
  { key: 'KDS', label: 'Kitchen Display (KDS)', icon: 'chef-hat', minPlan: 'NORMAL' },
  { key: 'AI', label: 'AI Assistant', icon: 'creation', minPlan: 'PLUS' },
  { key: 'TokenDashboard', label: 'Token Orders', icon: 'ticket-confirmation-outline', minPlan: 'NORMAL' },
  { key: 'TakeawayDelivery', label: 'Takeaway & Delivery', icon: 'moped-outline', minPlan: 'NORMAL' },
  { key: 'QRMenu', label: 'QR Ordering', icon: 'qrcode', minPlan: 'NORMAL' },
  { key: 'Billing', label: 'Billing', icon: 'credit-card-outline', minPlan: 'NORMAL' },
  { key: 'CRM', label: 'Customers (CRM)', icon: 'account-heart', minPlan: 'PLUS' },
  { key: 'TeamPortal', label: 'Team Portal', icon: 'account-group', minPlan: 'NORMAL' },
  { key: 'Attendance', label: 'Attendance', icon: 'clock-check-outline', minPlan: 'PLUS', parent: 'TeamPortal' },
  { key: 'Leave', label: 'Leave Requests', icon: 'calendar-remove-outline', minPlan: 'PLUS', parent: 'TeamPortal' },
  { key: 'Payroll', label: 'Payroll', icon: 'cash-multiple', minPlan: 'PLUS', parent: 'TeamPortal' },
  { key: 'Loans', label: 'Loans & Advances', icon: 'hand-coin-outline', minPlan: 'PLUS', parent: 'TeamPortal' },
  { key: 'HRReports', label: 'HR Reports', icon: 'file-chart-outline', minPlan: 'PLUS', parent: 'Reports' },
  { key: 'Menu', label: 'Menu', icon: 'food', minPlan: 'NORMAL' },
  { key: 'RecipeBuilder', label: 'Recipe Builder', icon: 'book-open-variant', minPlan: 'NORMAL', parent: 'Menu' },
  { key: 'Inventory', label: 'Inventory', icon: 'clipboard-list', minPlan: 'PLUS' },
  { key: 'InventoryLedger', label: 'Inventory Ledger', icon: 'notebook-outline', minPlan: 'PLUS', parent: 'Inventory' },
  { key: 'PurchaseOrders', label: 'Purchase Orders', icon: 'clipboard-text-outline', minPlan: 'PLUS', parent: 'Inventory' },
  { key: 'Vendors', label: 'Vendors', icon: 'truck-outline', minPlan: 'PLUS', parent: 'Inventory' },
  { key: 'StockTakes', label: 'Stock Takes', icon: 'counter', minPlan: 'PLUS', parent: 'Inventory' },
  { key: 'VarianceReport', label: 'Variance Report', icon: 'chart-bell-curve', minPlan: 'PLUS', parent: 'Reports' },
  { key: 'FoodCostReport', label: 'Food Cost Report', icon: 'chart-pie', minPlan: 'PLUS', parent: 'Reports' },
  { key: 'ExpiringBatches', label: 'Expiring Batches', icon: 'clock-alert-outline', minPlan: 'PLUS', parent: 'Inventory' },
  { key: 'Dashboard', label: 'Dashboard', icon: 'view-dashboard', minPlan: 'NORMAL' },
  { key: 'AIChat', label: 'AI Chat', icon: 'chat-processing-outline', minPlan: 'PLUS', parent: 'Dashboard' },
  { key: 'Reports', label: 'Reports', icon: 'file-chart-outline', minPlan: 'NORMAL' },
  { key: 'StockReport', label: 'Stock Report', icon: 'archive-outline', minPlan: 'PLUS', parent: 'Reports' },
  { key: 'PurchaseReport', label: 'Purchase Report', icon: 'clipboard-text-outline', minPlan: 'PLUS', parent: 'Reports' },
  { key: 'RevenueReport', label: 'Revenue Report', icon: 'cash-multiple', minPlan: 'NORMAL', parent: 'Reports' },
  { key: 'ProfitReport', label: 'Profit Report', icon: 'chart-line', minPlan: 'PLUS', parent: 'Reports' },
  { key: 'SalesReport', label: 'Sales Report', icon: 'point-of-sale', minPlan: 'PLUS', parent: 'Reports' },
  { key: 'TaxGstReport', label: 'Tax / GST Report', icon: 'percent-outline', minPlan: 'PLUS', parent: 'Reports' },
  { key: 'ExpenseReport', label: 'Expense Report', icon: 'cash-minus', minPlan: 'PLUS', parent: 'Reports' },
  { key: 'CrmReport', label: 'Customer (CRM) Report', icon: 'account-heart-outline', minPlan: 'PLUS', parent: 'Reports' },
  { key: 'OrderDetailReport', label: 'Order Detail Report', icon: 'receipt-text-outline', minPlan: 'PLUS', parent: 'Reports' },
  { key: 'Notifications', label: 'Notifications', icon: 'bell-outline', minPlan: 'NORMAL' },
  { key: 'Approvals', label: 'Approvals', icon: 'check-decagram', minPlan: 'PLUS' },
  { key: 'Tasks', label: 'Tasks', icon: 'format-list-checks', minPlan: 'PLUS' },
  { key: 'Integrations', label: 'Integrations', icon: 'api', minPlan: 'PREMIUM' },
  // Plus, unlike its Premium parent — WhatsApp Business is packaged one tier below the rest
  // of Integrations, so Plus cafes reach it through the direct "WhatsApp Business" entry in
  // MoreScreen/DesktopAppShell rather than the (still Premium) Integrations hub.
  { key: 'WhatsAppSetup', label: 'WhatsApp Business', icon: 'whatsapp', minPlan: 'PLUS', parent: 'Integrations' },
  { key: 'Branches', label: 'Branches', icon: 'storefront', minPlan: 'PLUS' },
  { key: 'Expenses', label: 'Expenses', icon: 'cash-minus', minPlan: 'NORMAL' },
  { key: 'SaaS', label: 'Subscription', icon: 'cloud-check', minPlan: 'NORMAL' },
  { key: 'Profile', label: 'Cafe Settings', icon: 'store-cog', minPlan: 'NORMAL' },
  { key: 'PrinterSettings', label: 'Printer Settings', icon: 'printer-outline', minPlan: 'NORMAL', parent: 'Profile' },
  { key: 'KitchenFlowSettings', label: 'Kitchen Flow', icon: 'chef-hat', minPlan: 'NORMAL', parent: 'Profile' },
  { key: 'StationManagement', label: 'Kitchen Stations', icon: 'chef-hat', minPlan: 'NORMAL', parent: 'Profile' },
  { key: 'TaxSlabManagement', label: 'Tax & GST Configuration', icon: 'percent-outline', minPlan: 'NORMAL', parent: 'Profile' },
  { key: 'OrderTypesSettings', label: 'Order Types', icon: 'clipboard-list-outline', minPlan: 'NORMAL', parent: 'Profile' },
  { key: 'AutoChargesSettings', label: 'Auto Charges', icon: 'cash-plus', minPlan: 'NORMAL', parent: 'Profile' },
  { key: 'ReceiptBuilder', label: 'Receipt Builder', icon: 'receipt-text-outline', minPlan: 'NORMAL', parent: 'Profile' },
  { key: 'CafeProfileDetail', label: 'Cafe Profile', icon: 'storefront-outline', minPlan: 'NORMAL', parent: 'Profile' },
  { key: 'Help', label: 'Help Center', icon: 'lifebuoy', minPlan: 'NORMAL' },
  { key: 'HelpArticle', label: 'Help Article', icon: 'file-document-outline', minPlan: 'NORMAL', parent: 'Help' },
  { key: 'SupportTicket', label: 'Support Ticket', icon: 'ticket-outline', minPlan: 'NORMAL', parent: 'Help' },
];

export const SCREEN_MIN_PLAN: Record<string, PlanCategory> = Object.fromEntries(
  SCREEN_CATALOG.map((s) => [s.key, s.minPlan]),
);

/** Parent screens only, in catalog order — the top-level rows the picker renders,
 * each with its `children` (if any) nested underneath. */
export const PARENT_SCREENS: ScreenCatalogEntry[] = SCREEN_CATALOG.filter((s) => !s.parent);

export const childrenOf = (parentKey: string): ScreenCatalogEntry[] =>
  SCREEN_CATALOG.filter((s) => s.parent === parentKey);

export const isValidScreenKey = (key: string): boolean => key in SCREEN_MIN_PLAN;

const PARENT_OF: Record<string, string | undefined> = Object.fromEntries(
  SCREEN_CATALOG.map((s) => [s.key, s.parent]),
);

/** Walks `key`'s parent chain up to the top-level screen, nearest first. Empty for a
 * key with no parent. Mirrors CafePosApi/Infrastructure/ScreenCatalog.cs's AncestorsOf
 * exactly — both sides must agree on what "reachable" means for a child screen. */
export const ancestorsOf = (key: string): string[] => {
  const chain: string[] = [];
  let current = PARENT_OF[key];
  while (current) {
    chain.push(current);
    current = PARENT_OF[current];
  }
  return chain;
};
