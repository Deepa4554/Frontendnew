import { apiClient } from '../network/api';
import { SubscriptionTier } from './subscriptionApi';

export interface ApiTenantSummary {
  id: number;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  plan: string;
  planExpiresAt: string | null;
  staffCount: number;
  branchCount: number;
}

const PLAN_TO_WIRE: Record<SubscriptionTier, string> = {
  FREETRIAL: 'FreeTrial',
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
};

export interface DailySales {
  date: string;
  revenue: number;
  orderCount: number;
}

export interface MonthlySales {
  month: string;
  revenue: number;
  orderCount: number;
}

export interface TenantSales {
  tenantId: number;
  tenantName: string;
  todayRevenue: number;
  thisMonthRevenue: number;
  allTimeRevenue: number;
  allTimeOrderCount: number;
  daily: DailySales[];
  monthly: MonthlySales[];
}

/** A PrabandhOS-the-startup business expense — not any cafe's own expense. */
export interface PlatformExpense {
  id: number;
  amount: number;
  spentBy: string;
  purpose: string;
  spentAt: string;
  recordedByName: string;
  createdAt: string;
}

export interface PlatformExpenseSummary {
  totalAllTime: number;
  totalThisMonth: number;
  recent: PlatformExpense[];
}

export interface CreatePlatformExpenseRequest {
  amount: number;
  spentBy: string;
  purpose: string;
  spentAt?: string;
}

export const superAdminApi = {
  listTenants: () => apiClient.get<ApiTenantSummary[]>('/superadmin/tenants').then((r) => r.data),
  changeTenantPlan: (tenantId: number, plan: SubscriptionTier) =>
    apiClient
      .post<ApiTenantSummary>(`/superadmin/tenants/${tenantId}/change-plan`, { plan: PLAN_TO_WIRE[plan] })
      .then((r) => r.data),
  tenantSales: (tenantId: number) => apiClient.get<TenantSales>(`/superadmin/tenants/${tenantId}/sales`).then((r) => r.data),
  listExpenses: () => apiClient.get<PlatformExpenseSummary>('/superadmin/expenses').then((r) => r.data),
  addExpense: (req: CreatePlatformExpenseRequest) => apiClient.post<PlatformExpense>('/superadmin/expenses', req).then((r) => r.data),
  removeExpense: (id: number) => apiClient.delete<void>(`/superadmin/expenses/${id}`).then((r) => r.data),
};
