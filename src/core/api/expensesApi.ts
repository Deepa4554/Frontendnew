import { apiClient } from '../network/api';

export type ExpenseCategory = 'Rent' | 'Salaries' | 'Utilities' | 'Maintenance' | 'Supplies' | 'Marketing' | 'Other';

export interface CafeExpense {
  id: number;
  amount: number;
  category: ExpenseCategory;
  purpose: string;
  spentBy: string;
  spentAt: string;
  recordedByName: string;
  createdAt: string;
}

export interface CategoryTotal {
  category: string;
  total: number;
}

export interface CafeExpenseSummary {
  totalAllTime: number;
  totalThisMonth: number;
  byCategoryThisMonth: CategoryTotal[];
  recent: CafeExpense[];
}

export interface CreateCafeExpenseRequest {
  amount: number;
  category: ExpenseCategory;
  purpose: string;
  spentBy: string;
  spentAt?: string;
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

/** `amount` is 0 for a row nobody bought that day. Every active row comes back regardless —
 * the sheet is the entry form, so staff need to see the row to fill it. */
export interface DailyPurchaseLine {
  itemId: number;
  name: string;
  defaultCategory: ExpenseCategory;
  amount: number;
}

export interface DailyPurchaseSheet {
  /** yyyy-MM-dd, IST. */
  date: string;
  lines: DailyPurchaseLine[];
  total: number;
}

/** Saving replaces that date's list-sourced expenses rather than adding to them, so
 * re-saving a day corrects it instead of doubling it (see ExpensesController.SaveDailySheet). */
export interface SaveDailyPurchaseRequest {
  date?: string;
  spentBy?: string;
  lines: { itemId: number; amount: number }[];
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
