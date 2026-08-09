import { apiClient } from '../network/api';
import { SubscriptionTier } from './subscriptionApi';
import { ApiStaff, StaffScreenAccess, UpdateStaffScreenAccessRequest } from './staffApi';

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

/** Cafe-level screen ceiling — see core/auth/permissions.ts's isScreenEnabledForTenant
 * and the backend's Tenant.ScreenMode/EnabledScreens. `plan` rides along read-only so the
 * picker can grey out screens above what this cafe is currently subscribed to. */
export interface TenantScreenAccess {
  tenantId: number;
  screenMode: 'PlanDefault' | 'Custom';
  enabledScreens: string[];
  plan: 'NORMAL' | 'PLUS' | 'PREMIUM';
}

export interface UpdateTenantScreenAccessRequest {
  screenMode: 'PlanDefault' | 'Custom';
  enabledScreens?: string[];
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
  tenantScreenAccess: (tenantId: number) =>
    apiClient.get<TenantScreenAccess>(`/superadmin/tenants/${tenantId}/screen-access`).then((r) => r.data),
  updateTenantScreenAccess: (tenantId: number, req: UpdateTenantScreenAccessRequest) =>
    apiClient.patch<TenantScreenAccess>(`/superadmin/tenants/${tenantId}/screen-access`, req).then((r) => r.data),
  // Per-staff override, one level below the cafe-wide ceiling above — same
  // StaffScreenAccess shape as StaffController's own /staff/{id}/screen-access, just
  // reachable cross-tenant by tenantId+staffId since a platform admin's login isn't
  // Owner/Manager on any cafe and has no ambient tenant of its own to fall into.
  tenantStaff: (tenantId: number) => apiClient.get<ApiStaff[]>(`/superadmin/tenants/${tenantId}/staff`).then((r) => r.data),
  tenantStaffScreenAccess: (tenantId: number, staffId: number) =>
    apiClient.get<StaffScreenAccess>(`/superadmin/tenants/${tenantId}/staff/${staffId}/screen-access`).then((r) => r.data),
  updateTenantStaffScreenAccess: (tenantId: number, staffId: number, req: UpdateStaffScreenAccessRequest) =>
    apiClient.patch<StaffScreenAccess>(`/superadmin/tenants/${tenantId}/staff/${staffId}/screen-access`, req).then((r) => r.data),
};
