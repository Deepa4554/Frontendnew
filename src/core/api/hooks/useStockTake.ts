import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stockTakeApi, CreateStockTakeRequest } from '../stockTakeApi';
import { queryKeys } from './queryKeys';

export const useStockTakes = () => useQuery({ queryKey: queryKeys.stockTakes, queryFn: stockTakeApi.list });

export const useStockTake = (id: number | null) =>
  useQuery({
    queryKey: queryKeys.stockTake(id ?? -1),
    queryFn: () => stockTakeApi.get(id as number),
    enabled: id !== null,
  });

export const useCreateStockTake = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateStockTakeRequest) => stockTakeApi.create(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stockTakes }),
  });
};

export const useRecordStockCount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lineId, countedQty }: { id: number; lineId: number; countedQty: number }) =>
      stockTakeApi.recordCount(id, lineId, countedQty),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: queryKeys.stockTake(vars.id) }),
  });
};

export const useFinalizeStockTake = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => stockTakeApi.finalize(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.stockTake(id) });
      qc.invalidateQueries({ queryKey: queryKeys.stockTakes });
      // Finalizing writes ManualAdjustment ledger rows and can move Current — every
      // inventory/ledger/report screen needs to see the new balances.
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
};

export const useDeleteStockTake = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => stockTakeApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stockTakes }),
  });
};
