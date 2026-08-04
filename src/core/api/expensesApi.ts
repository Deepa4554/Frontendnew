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

export const expensesApi = {
  list: () => apiClient.get<CafeExpenseSummary>('/expenses').then((r) => r.data),
  create: (req: CreateCafeExpenseRequest) =>
    apiClient.post<CafeExpense | PendingApprovalResponse>('/expenses', req).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/expenses/${id}`).then((r) => r.data),
  report: (params?: { from?: string; to?: string }) =>
    apiClient.get<CafeExpenseReport>('/expenses/report', { params }).then((r) => r.data),
};
