import { apiClient } from '../network/api';
import { RecipeItemCost } from './recipeApi';

export interface RecipeCostReportRow {
  menuItemId: number;
  menuItemName: string;
  ingredientCost: number;
  menuPrice: number;
  foodCostPct: number;
  items: RecipeItemCost[];
}

export interface VarianceReportLine {
  inventoryItemId: number;
  name: string;
  unit: string;
  /** What the recipes say should have been consumed (sum of Sale-ledger deductions). */
  theoreticalConsumption: number;
  purchasedQty: number;
  wastageQty: number;
  /** From the most recent FINALIZED stock take, if any — this system's only physical
   * "actual" measurement (not a continuous meter feed). */
  latestStockTakeVariance: number | null;
  latestStockTakeAt: string | null;
}

export interface StockReportLine {
  inventoryItemId: number;
  name: string;
  category: string;
  unit: string;
  currentQty: number;
  unitCost: number;
  currentValue: number;
  /** Only populated when a date range was requested — null in "current valuation only" mode. */
  openingBalance: number | null;
  purchased: number | null;
  sold: number | null;
  wasted: number | null;
  other: number | null;
  closingBalance: number | null;
}

export interface ProfitDayLine {
  day: string;
  revenue: number;
  cogs: number;
  expenses: number;
}

export interface ProfitReport {
  revenue: number;
  cogs: number;
  grossProfit: number;
  /** Whole-tenant only — CafeExpense has no BranchId column, so a branch filter never narrows this. */
  expenses: number;
  netProfit: number;
  /** Orders containing at least one item with no Recipe on file — those items contributed
   * zero COGS, understating cost. Link out to Missing Recipes to fix. */
  ordersWithoutRecipeCost: number;
  daily: ProfitDayLine[];
}

export interface SalesItemLine {
  menuItemId: number;
  name: string;
  qtySold: number;
  netSales: number;
}

export interface SalesCategoryLine {
  category: string;
  qtySold: number;
  netSales: number;
}

export interface SalesPaymentLine {
  method: string;
  amount: number;
  txnCount: number;
}

export interface SalesReport {
  grossSales: number;
  totalDiscounts: number;
  netSales: number;
  refundsTotal: number;
  orderCount: number;
  itemWise: SalesItemLine[];
  categoryWise: SalesCategoryLine[];
  paymentModeWise: SalesPaymentLine[];
  /** Written off on the Complimentary tender — already excluded from netSales above (see
   * ReportsController.Sales), broken out here so the report can show it as its own line. */
  complimentaryTotal: number;
}

export interface TaxRateLine {
  ratePct: number;
  taxableAmount: number;
  taxAmount: number;
  lineCount: number;
}

export interface TaxBillLine {
  orderId: number;
  /** The number printed on the guest's copy of this bill (see ApiOrder.number). Show this,
   * not orderId — the filing detail is only checkable against physical bills if they match. */
  orderNumber: string;
  title: string;
  createdAt: string;
  taxableAmount: number;
  taxAmount: number;
}

export interface TaxGstReport {
  totalTaxableAmount: number;
  totalTaxCollected: number;
  byRate: TaxRateLine[];
  /** Bill-level detail so rate totals can be traced back to individual invoices. */
  bills: TaxBillLine[];
}

export interface OrderDetailItem {
  name: string;
  variantName: string | null;
  qty: number;
  price: number;
  lineTotal: number;
  taxAmount: number;
  /** Struck off the bill — shown for audit, contributes nothing to totals. */
  voided: boolean;
}

export interface OrderDetailLine {
  orderId: number;
  /** The number printed on the guest's copy of this bill (see ApiOrder.number). */
  orderNumber: string;
  title: string;
  createdAt: string;
  orderType: string;
  tableCode: string | null;
  tokenNumber: number | null;
  customerName: string | null;
  customerPhone: string | null;
  subtotal: number;
  /** All five reductions (order-time, bill, coupon, gift card, loyalty) folded into one. */
  discountTotal: number;
  tax: number;
  total: number;
  paymentMethod: string | null;
  paid: boolean;
  refunded: boolean;
  refundedAmount: number | null;
  itemCount: number;
  items: OrderDetailItem[];
}

export interface OrdersReport {
  /** Total matching orders, which may exceed the rows returned — see `truncated`. */
  orderCount: number;
  grossTotal: number;
  discountTotal: number;
  taxTotal: number;
  netTotal: number;
  refundTotal: number;
  truncated: boolean;
  orders: OrderDetailLine[];
}

export interface CrmReportCustomerLine {
  customerId: number;
  name: string;
  phone: string | null;
  tier: string;
  visitsInPeriod: number;
  spentInPeriod: number;
  avgOrderValueInPeriod: number;
  lifetimeVisits: number;
  lifetimeSpent: number;
  availablePoints: number;
  lastVisitAt: string;
  joinedAt: string;
  isNewInPeriod: boolean;
}

export interface CrmReport {
  activeCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  repeatRatePct: number;
  /** No visit in 60+ days — a win-back list, lifetime not period-scoped. */
  lapsedCustomers: number;
  revenueFromCustomers: number;
  revenueFromWalkIns: number;
  identifiedRevenuePct: number;
  avgSpendPerCustomer: number;
  avgVisitsPerCustomer: number;
  pointsRedeemedInPeriod: number;
  /** Unredeemed loyalty balance across every customer — a standing liability, not a period figure. */
  pointsOutstanding: number;
  customers: CrmReportCustomerLine[];
}

export interface MissingRecipeAlert {
  id: number;
  menuItemId: number;
  menuItemName: string;
  occurrenceCount: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
}

export interface DailyAttendanceReportLine {
  staffId: number;
  staffName: string;
  role: string;
  date: string;
  status: string;
  punchInAt: string | null;
  punchOutAt: string | null;
  workedMinutes: number | null;
  lateMinutes: number;
}

export interface MonthlyAttendanceReportLine {
  staffId: number;
  staffName: string;
  role: string;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  totalWorkedHours: number;
}

export interface OvertimeReportLine {
  staffId: number;
  staffName: string;
  role: string;
  totalOvertimeHours: number;
  overtimeDays: number;
}

export interface EmployeeListLine {
  staffId: number;
  name: string;
  role: string;
  department: string | null;
  designation: string | null;
  branchName: string | null;
  joinedAt: string;
  status: string;
  salaryType: string;
  basicSalary: number | null;
  hourlyRate: number | null;
  hasLogin: boolean;
}

export const reportsApi = {
  /** Owner/Manager only — ingredient cost vs menu price, worst food-cost% first. */
  foodCost: () => apiClient.get<RecipeCostReportRow[]>('/reports/food-cost').then((r) => r.data),
  variance: (params?: { days?: number; from?: string; to?: string; branchId?: number | null }) =>
    apiClient.get<VarianceReportLine[]>('/reports/variance', { params }).then((r) => r.data),
  missingRecipes: () => apiClient.get<MissingRecipeAlert[]>('/reports/missing-recipes').then((r) => r.data),
  dismissMissingRecipe: (id: number) => apiClient.post<void>(`/reports/missing-recipes/${id}/dismiss`).then((r) => r.data),

  stockReport: (params?: { from?: string; to?: string; branchId?: number | null }) =>
    apiClient.get<StockReportLine[]>('/reports/stock', { params }).then((r) => r.data),
  profitReport: (params?: { days?: number; from?: string; to?: string; branchId?: number | null }) =>
    apiClient.get<ProfitReport>('/reports/profit', { params }).then((r) => r.data),
  salesReport: (params?: { days?: number; from?: string; to?: string; branchId?: number | null }) =>
    apiClient.get<SalesReport>('/reports/sales', { params }).then((r) => r.data),
  taxGstReport: (params?: { days?: number; from?: string; to?: string; branchId?: number | null }) =>
    apiClient.get<TaxGstReport>('/reports/tax-gst', { params }).then((r) => r.data),
  crmReport: (params?: { days?: number; from?: string; to?: string; branchId?: number | null }) =>
    apiClient.get<CrmReport>('/reports/crm', { params }).then((r) => r.data),
  ordersReport: (params?: { days?: number; from?: string; to?: string; branchId?: number | null; orderType?: string; paymentMethod?: string }) =>
    apiClient.get<OrdersReport>('/reports/orders', { params }).then((r) => r.data),

  dailyAttendance: (date: string) => apiClient.get<DailyAttendanceReportLine[]>('/reports/daily-attendance', { params: { date } }).then((r) => r.data),
  dailyAttendanceExportPath: (date: string) => `/reports/daily-attendance/export?date=${date}`,
  monthlyAttendance: (year: number, month: number) =>
    apiClient.get<MonthlyAttendanceReportLine[]>('/reports/monthly-attendance', { params: { year, month } }).then((r) => r.data),
  monthlyAttendanceExportPath: (year: number, month: number) => `/reports/monthly-attendance/export?year=${year}&month=${month}`,
  overtime: (periodStart: string, periodEnd: string) =>
    apiClient.get<OvertimeReportLine[]>('/reports/overtime', { params: { periodStart, periodEnd } }).then((r) => r.data),
  overtimeExportPath: (periodStart: string, periodEnd: string) => `/reports/overtime/export?periodStart=${periodStart}&periodEnd=${periodEnd}`,
  employeeList: () => apiClient.get<EmployeeListLine[]>('/reports/employee-list').then((r) => r.data),
  employeeListExportPath: () => '/reports/employee-list/export',
  salaryRegisterExportPath: (payrollRunId: number) => `/reports/salary-register/export?payrollRunId=${payrollRunId}`,
  leaveExportPath: (periodStart?: string, periodEnd?: string) =>
    `/reports/leave/export${periodStart || periodEnd ? `?${[periodStart ? `periodStart=${periodStart}` : '', periodEnd ? `periodEnd=${periodEnd}` : ''].filter(Boolean).join('&')}` : ''}`,
};
