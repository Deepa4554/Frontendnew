import type { LinkingOptions } from '@react-navigation/native';

/**
 * Without this, NavigationContainer never touches the browser's history/URL at all — every
 * screen shares whatever URL the app happened to load on, so there's nothing for the browser's
 * back button to step back through. Pressing it then falls straight out of the app instead of
 * popping to the previous in-app screen (reported as "POS ka back button seedha web/app se
 * exit kar deta hai" — same URL for every screen was the tell).
 *
 * Every route name below must match the Stack.Screen/Tab.Screen name it's nested under exactly
 * (see AppNavigator.tsx, RootNavigator.tsx, and each feature's own Navigator.tsx) — a name that's
 * missing or misspelled here just doesn't get a path segment, which reproduces the same bug for
 * that one screen. Screens whose only params are non-string objects (e.g. EditShift's `shift`)
 * are listed without a param segment on purpose: they still get a distinct history entry (that's
 * what fixes back-button-exits-app), they just don't restore their param on a raw URL reload.
 */
export const linking: LinkingOptions<any> = {
  prefixes: [],
  config: {
    screens: {
      Auth: {
        screens: {
          Splash: 'splash',
          Login: 'login',
          CreateCafe: 'create-cafe',
          ForgotPassword: 'forgot-password',
        },
      },
      Loading: 'loading',
      Onboarding: {
        screens: {
          OnboardingWelcome: 'onboarding',
          OnboardingType: 'onboarding/type',
          OnboardingMenu: 'onboarding/menu',
          OnboardingCrew: 'onboarding/crew',
        },
      },
      SuperAdminRoot: {
        screens: {
          Overview: 'admin',
          Tenants: 'admin/tenants',
          AuditLogs: 'admin/audit-logs',
          Support: 'admin/support',
          Expenses: 'admin/expenses',
        },
      },
      App: {
        screens: {
          MainTabs: {
            screens: {
              POS: 'pos',
              Orders: 'orders',
              KDS: 'kds',
              Token: 'token',
              More: 'more',
            },
          },
          Tables: 'tables',
          QRMenu: 'qr-menu',
          TokenDashboard: 'token-dashboard',
          TakeawayDelivery: 'takeaway-delivery',
          Billing: {
            screens: {
              BillingMain: 'billing',
            },
          },
          CRM: {
            screens: {
              Customers: {
                screens: {
                  CustomerDirectory: 'crm/customers',
                  CustomerProfile: 'crm/customers/:customerId',
                  Coupons: 'crm/coupons',
                  GiftCards: 'crm/gift-cards',
                  OrderHistory: 'crm/order-history',
                  Favourites: 'crm/favourites',
                },
              },
              Points: 'crm/points',
              Insights: 'crm/insights',
            },
          },
          TeamPortal: {
            screens: {
              Overview: {
                screens: {
                  TeamOverview: 'team',
                  StaffProfile: 'team/staff/:staffId',
                  HRReports: 'team/hr-reports',
                },
              },
              Schedule: {
                screens: {
                  TeamSchedule: 'team/schedule',
                  EditShift: 'team/schedule/edit',
                },
              },
              Attendance: 'team/attendance',
              Leave: 'team/leave',
              Performance: 'team/performance',
              Payroll: {
                screens: {
                  PayrollRuns: 'team/payroll',
                  PayrollRunDetail: 'team/payroll/:runId',
                },
              },
              Loans: 'team/loans',
            },
          },
          StaffAccess: 'staff-access',
          StaffKitchenAssignment: 'staff-kitchen-assignment',
          MyAttendance: 'my-attendance',
          MyPayslips: 'my-payslips',
          Menu: 'menu',
          Inventory: 'inventory',
          RecipeBuilder: 'recipe-builder',
          InventoryLedger: 'inventory/ledger',
          PurchaseOrders: 'inventory/purchase-orders',
          Vendors: 'inventory/vendors',
          StockTakes: 'inventory/stock-takes',
          StockTakeDetail: 'inventory/stock-takes/:id',
          VarianceReport: 'inventory/variance-report',
          FoodCostReport: 'inventory/food-cost-report',
          ExpiringBatches: 'inventory/expiring-batches',
          Dashboard: 'dashboard',
          AI: 'ai',
          AIChat: 'ai/chat',
          Notifications: 'notifications',
          Approvals: 'approvals',
          Tasks: 'tasks',
          Integrations: 'integrations',
          WhatsAppSetup: 'integrations/whatsapp',
          DeliveryPartner: 'integrations/delivery',
          Branches: 'branches',
          Expenses: 'expenses',
          Khatabook: 'khatabook',
          SaaS: 'saas',
          SuperAdmin: 'super-admin',
          Profile: 'profile',
          PrinterSettings: 'profile/printer-settings',
          KitchenFlowSettings: 'profile/kitchen-flow-settings',
          StationManagement: 'profile/stations',
          TaxSlabManagement: 'profile/tax-slabs',
          OrderTypesSettings: 'profile/order-types',
          AutoChargesSettings: 'profile/auto-charges',
          ReceiptBuilder: 'profile/receipt-builder',
          CafeProfileDetail: 'profile/cafe',
          Help: 'help',
          HelpArticle: 'help/article',
          SupportTicket: 'help/support-ticket',
        },
      },
    },
  },
};
