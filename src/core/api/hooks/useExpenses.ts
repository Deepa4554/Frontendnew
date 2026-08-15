import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { expensesApi, CreateCafeExpenseRequest, ExpenseCategory, SaveDailyPurchaseRequest } from '../expensesApi';

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

// ---------- Daily purchase list ----------
// Saving a sheet writes CafeExpense rows, so these all invalidate 'expenses' too — the
// All tab and the month totals are reading the very rows the Daily tab just wrote.

export const useDailyPurchaseSheet = (date?: string) =>
  useQuery({ queryKey: ['expenses', 'daily', date ?? 'today'], queryFn: () => expensesApi.dailySheet(date) });

export const useSaveDailyPurchaseSheet = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SaveDailyPurchaseRequest) => expensesApi.saveDailySheet(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
};

export const useAddPurchaseListItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: { name: string; defaultCategory?: ExpenseCategory }) => expensesApi.addListItem(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', 'daily'] }),
  });
};

export const useRemovePurchaseListItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => expensesApi.removeListItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', 'daily'] }),
  });
};
