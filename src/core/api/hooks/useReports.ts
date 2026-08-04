import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reportsApi } from '../reportsApi';
import { queryKeys } from './queryKeys';

export const useFoodCostReport = () => useQuery({ queryKey: queryKeys.foodCostReport, queryFn: reportsApi.foodCost });

export const useVarianceReport = (params?: { days?: number; from?: string; to?: string; branchId?: number | null }) =>
  useQuery({ queryKey: queryKeys.varianceReport(params), queryFn: () => reportsApi.variance(params) });

export const useMissingRecipeAlerts = () => useQuery({ queryKey: queryKeys.missingRecipeAlerts, queryFn: reportsApi.missingRecipes });

export const useStockReport = (params?: { from?: string; to?: string; branchId?: number | null }) =>
  useQuery({ queryKey: queryKeys.stockReport(params), queryFn: () => reportsApi.stockReport(params) });

export const useProfitReport = (params?: { days?: number; from?: string; to?: string; branchId?: number | null }) =>
  useQuery({ queryKey: queryKeys.profitReport(params), queryFn: () => reportsApi.profitReport(params) });

export const useSalesReport = (params?: { days?: number; from?: string; to?: string; branchId?: number | null }) =>
  useQuery({ queryKey: queryKeys.salesReport(params), queryFn: () => reportsApi.salesReport(params) });

export const useTaxGstReport = (params?: { days?: number; from?: string; to?: string; branchId?: number | null }) =>
  useQuery({ queryKey: queryKeys.taxGstReport(params), queryFn: () => reportsApi.taxGstReport(params) });

export const useCrmReport = (params?: { days?: number; from?: string; to?: string; branchId?: number | null }) =>
  useQuery({ queryKey: queryKeys.crmReport(params), queryFn: () => reportsApi.crmReport(params) });

export const useOrdersReport = (
  params?: { days?: number; from?: string; to?: string; branchId?: number | null; orderType?: string; paymentMethod?: string },
  options?: { enabled?: boolean },
) =>
  useQuery({
    queryKey: queryKeys.ordersReport(params),
    queryFn: () => reportsApi.ordersReport(params),
    enabled: options?.enabled ?? true,
  });

export const useDismissMissingRecipeAlert = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => reportsApi.dismissMissingRecipe(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.missingRecipeAlerts }),
  });
};

export const useDailyAttendanceReport = (date: string) =>
  useQuery({ queryKey: ['reports', 'daily-attendance', date], queryFn: () => reportsApi.dailyAttendance(date) });

export const useMonthlyAttendanceReport = (year: number, month: number) =>
  useQuery({ queryKey: ['reports', 'monthly-attendance', year, month], queryFn: () => reportsApi.monthlyAttendance(year, month) });

export const useOvertimeReport = (periodStart: string, periodEnd: string) =>
  useQuery({ queryKey: ['reports', 'overtime', periodStart, periodEnd], queryFn: () => reportsApi.overtime(periodStart, periodEnd) });

export const useEmployeeListReport = () => useQuery({ queryKey: ['reports', 'employee-list'], queryFn: reportsApi.employeeList });
