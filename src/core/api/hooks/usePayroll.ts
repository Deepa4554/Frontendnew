import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { payrollApi, GeneratePayrollRunRequest, UpdatePayrollLineRequest } from '../payrollApi';
import { queryKeys } from './queryKeys';

const invalidatePayrollRuns = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['payroll-runs'] });

export const usePayrollRuns = (year?: number, month?: number) =>
  useQuery({ queryKey: queryKeys.payrollRuns(year, month), queryFn: () => payrollApi.list(year, month) });

export const usePayrollRun = (id: number | null) =>
  useQuery({ queryKey: queryKeys.payrollRun(id ?? -1), queryFn: () => payrollApi.get(id as number), enabled: id !== null });

export const useGeneratePayrollRun = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (req: GeneratePayrollRunRequest) => payrollApi.generate(req), onSuccess: () => invalidatePayrollRuns(qc) });
};

export const useUpdatePayrollLine = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, lineId, req }: { runId: number; lineId: number; req: UpdatePayrollLineRequest }) =>
      payrollApi.updateLine(runId, lineId, req),
    onSuccess: (_data, { runId }) => qc.invalidateQueries({ queryKey: queryKeys.payrollRun(runId) }),
  });
};

export const useDeletePayrollRun = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => payrollApi.remove(id), onSuccess: () => invalidatePayrollRuns(qc) });
};

export const useLockPayrollRun = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => payrollApi.lock(id),
    onSuccess: (_data, id) => { invalidatePayrollRuns(qc); qc.invalidateQueries({ queryKey: queryKeys.payrollRun(id) }); },
  });
};

export const useReopenPayrollRun = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => payrollApi.reopen(id),
    onSuccess: (_data, id) => { invalidatePayrollRuns(qc); qc.invalidateQueries({ queryKey: queryKeys.payrollRun(id) }); },
  });
};

export const useMarkPayrollRunPaid = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => payrollApi.markPaid(id),
    onSuccess: (_data, id) => {
      invalidatePayrollRuns(qc);
      qc.invalidateQueries({ queryKey: queryKeys.payrollRun(id) });
      qc.invalidateQueries({ queryKey: ['staff-loans'] }); // mark-paid decrements loan balances
    },
  });
};

export const useMyPayslips = (year?: number) =>
  useQuery({ queryKey: queryKeys.myPayslips(year), queryFn: () => payrollApi.myPayslips(year) });
