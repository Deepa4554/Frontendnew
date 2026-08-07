import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { superAdminApi, CreatePlatformExpenseRequest, UpdateTenantScreenAccessRequest } from '../superAdminApi';
import { SubscriptionTier } from '../subscriptionApi';
import { queryKeys } from './queryKeys';

export const useSuperAdminTenants = () =>
  useQuery({ queryKey: queryKeys.superAdminTenants, queryFn: superAdminApi.listTenants });

export const useTenantSales = (tenantId: number | null) =>
  useQuery({
    queryKey: queryKeys.superAdminTenantSales(tenantId ?? 0),
    queryFn: () => superAdminApi.tenantSales(tenantId as number),
    enabled: tenantId !== null,
  });

export const useChangeTenantPlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, plan }: { tenantId: number; plan: SubscriptionTier }) =>
      superAdminApi.changeTenantPlan(tenantId, plan),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.superAdminTenants }),
  });
};

export const usePlatformExpenses = () =>
  useQuery({ queryKey: ['superadmin-expenses'], queryFn: superAdminApi.listExpenses });

export const useAddPlatformExpense = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreatePlatformExpenseRequest) => superAdminApi.addExpense(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['superadmin-expenses'] }),
  });
};

export const useRemovePlatformExpense = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => superAdminApi.removeExpense(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['superadmin-expenses'] }),
  });
};

export const useTenantScreenAccess = (tenantId: number | null) =>
  useQuery({
    queryKey: ['superadmin', 'tenant-screen-access', tenantId ?? -1],
    queryFn: () => superAdminApi.tenantScreenAccess(tenantId as number),
    enabled: tenantId !== null,
  });

export const useUpdateTenantScreenAccess = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, req }: { tenantId: number; req: UpdateTenantScreenAccessRequest }) =>
      superAdminApi.updateTenantScreenAccess(tenantId, req),
    onSuccess: (_data, { tenantId }) => qc.invalidateQueries({ queryKey: ['superadmin', 'tenant-screen-access', tenantId] }),
  });
};
