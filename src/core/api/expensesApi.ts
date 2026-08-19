import { apiClient } from '../network/api';

export type ExpenseCategory = 'Rent' | 'Salaries' | 'Utilities' | 'Maintenance' | 'Supplies' | 'Marketing' | 'Other';

/** How the cafe paid for something it bought. 'Due' means it hasn't paid the vendor yet —
 * a label on the expense only, which is still booked in full on the day it was incurred.
 * Unrelated to the POS's own 'Due' tender in ordersApi, which is customer udhaar owed TO the
 * cafe and does open a Khatabook entry. */
export type PaymentMode = 'Cash' | 'UPI' | 'Card' | 'Due';

/** The bucket the API reports rows with no mode under — entries from before the field
 * existed. Not folded into Cash, which would overstate the till by whatever nobody
 * classified. Matches ExpensesController.UnsetPaymentMode. */
export const UNSET_PAYMENT_MODE = 'Not set';

export interface CafeExpense {
  id: number;
  amount: number;
  category: ExpenseCategory;
  purpose: string;
  spentBy: string;
  spentAt: string;
  recordedByName: string;
  createdAt: string;
  /** null on rows saved before the field existed — see UNSET_PAYMENT_MODE. */
  paymentMode: PaymentMode | null;
}

export interface CategoryTotal {
  category: string;
  total: number;
}

/** `mode` is a PaymentMode, or UNSET_PAYMENT_MODE for the rows carrying none. */
export interface PaymentModeTotal {
  mode: string;
  total: number;
}

export interface CafeExpenseSummary {
  totalAllTime: number;
  totalThisMonth: number;
  byCategoryThisMonth: CategoryTotal[];
  byPaymentModeThisMonth: PaymentModeTotal[];
  recent: CafeExpense[];
}

export interface CreateCafeExpenseRequest {
  amount: number;
  category: ExpenseCategory;
  purpose: string;
  spentBy: string;
  spentAt?: string;
  /** Omitted leaves the row unset rather than defaulting to Cash — unlike the daily sheet,
   * where every filled row was definitely paid somehow. */
  paymentMode?: PaymentMode;
}

/** Returned instead of the expense when a Manager's entry lands above
 * ApprovalThresholds.ExpenseAmount — held as a pending ApprovalRequest for the Owner
 * instead of being recorded immediately (see ExpensesController.Create). */
export interface PendingApprovalResponse {
  pendingApproval: true;
  message: string;
}

/** No BranchId column on CafeExpense — always a whole-tenant total, no branch filter. */
export interface CafeExpenseReport {
  total: number;
  byCategory: CategoryTotal[];
  byPaymentMode: PaymentModeTotal[];
  lines: CafeExpense[];
}

// ---------- Daily purchase list ----------

/** One row of the cafe's own daily purchase list — its fixed set of vendors and expense
 * heads (Mutton, Gas, Cook Salary, ...). The list is per-tenant and editable; it is
 * deliberately not more ExpenseCategory values, which stay a small fixed report roll-up. */
export interface PurchaseListItem {
  id: number;
  name: string;
  sortOrder: number;
  defaultCategory: ExpenseCategory;
}

/** `amount` is 0 for a row nobody bought that day, and `paymentMode` is null with it —
 * a blank row hasn't been paid any way yet, so there's nothing to default it to. Every
 * active row comes back regardless — the sheet is the entry form, so staff need to see
 * the row to fill it. */
export interface DailyPurchaseLine {
  itemId: number;
  name: string;
  defaultCategory: ExpenseCategory;
  amount: number;
  paymentMode: PaymentMode | null;
}

export interface DailyPurchaseSheet {
  /** yyyy-MM-dd, IST. */
  date: string;
  lines: DailyPurchaseLine[];
  total: number;
}

/** Saving replaces that date's list-sourced expenses rather than adding to them, so
 * re-saving a day corrects it instead of doubling it (see ExpensesController.SaveDailySheet).
 * A line missing `paymentMode` still saves — the server defaults it to Cash. */
export interface SaveDailyPurchaseRequest {
  date?: string;
  spentBy?: string;
  lines: { itemId: number; amount: number; paymentMode?: PaymentMode }[];
}

export const expensesApi = {
  list: () => apiClient.get<CafeExpenseSummary>('/expenses').then((r) => r.data),
  create: (req: CreateCafeExpenseRequest) =>
    apiClient.post<CafeExpense | PendingApprovalResponse>('/expenses', req).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/expenses/${id}`).then((r) => r.data),
  report: (params?: { from?: string; to?: string }) =>
    apiClient.get<CafeExpenseReport>('/expenses/report', { params }).then((r) => r.data),

  dailySheet: (date?: string) =>
    apiClient.get<DailyPurchaseSheet>('/expenses/daily', { params: date ? { date } : undefined }).then((r) => r.data),
  saveDailySheet: (req: SaveDailyPurchaseRequest) =>
    apiClient.post<DailyPurchaseSheet>('/expenses/daily', req).then((r) => r.data),
  addListItem: (req: { name: string; defaultCategory?: ExpenseCategory }) =>
    apiClient.post<PurchaseListItem>('/expenses/daily/items', req).then((r) => r.data),
  removeListItem: (id: number) =>
    apiClient.delete<void>(`/expenses/daily/items/${id}`).then((r) => r.data),
};
