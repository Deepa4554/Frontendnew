import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loansApi, CreateStaffLoanRequest, UpdateStaffLoanRequest, LoanStatus } from '../loansApi';
import { queryKeys } from './queryKeys';

const invalidateLoans = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['staff-loans'] });

export const useStaffLoans = (staffId?: number, status?: LoanStatus) =>
  useQuery({ queryKey: queryKeys.staffLoans(staffId, status), queryFn: () => loansApi.list(staffId, status) });

export const useMyLoans = () => useQuery({ queryKey: queryKeys.myLoans, queryFn: loansApi.me });

export const useCreateStaffLoan = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (req: CreateStaffLoanRequest) => loansApi.create(req), onSuccess: () => invalidateLoans(qc) });
};

export const useUpdateStaffLoan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateStaffLoanRequest }) => loansApi.update(id, req),
    onSuccess: () => invalidateLoans(qc),
  });
};

export const useCloseStaffLoan = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => loansApi.close(id), onSuccess: () => invalidateLoans(qc) });
};
