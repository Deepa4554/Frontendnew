import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { expensesApi, CreateCafeExpenseRequest } from '../expensesApi';

export const useCafeExpenses = () => useQuery({ queryKey: ['expenses'], queryFn: expensesApi.list });

export const useExpenseReport = (params?: { from?: string; to?: string }) =>
  useQuery({ queryKey: ['reports', 'expenses', params], queryFn: () => expensesApi.report(params) });

export const useAddCafeExpense = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateCafeExpenseRequest) => expensesApi.create(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
};

export const useRemoveCafeExpense = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => expensesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
};
