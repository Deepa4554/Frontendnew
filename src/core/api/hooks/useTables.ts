import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tablesApi, CreateTableRequest } from '../tablesApi';
import { queryKeys } from './queryKeys';

// Tables' occupancy is derived from live orders, so it invalidates on the same
// OrdersHub "ordersChanged" push orders do (see useOrdersRealtime) — this interval is
// just the safety net for a dropped/blocked socket.
// refetchIntervalInBackground: a floor view left open on a second screen is unfocused, and
// React Query pauses refetchInterval while it is — see useOrders for the full reasoning.
export const useTables = () =>
  useQuery({ queryKey: queryKeys.tables, queryFn: tablesApi.list, refetchInterval: 30000, refetchIntervalInBackground: true });

// Not table-specific, so no polling needed — this token is valid indefinitely.
export const useMenuOnlyQrToken = () => useQuery({ queryKey: queryKeys.menuOnlyQrToken, queryFn: tablesApi.getMenuOnlyQrToken });

export const useCreateTable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateTableRequest) => tablesApi.create(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tables }),
  });
};

export const useDeleteTable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tablesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tables }),
  });
};

export const useRevokeSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, reason }: { tableId: number; reason?: string }) => tablesApi.revokeSession(tableId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tables }),
  });
};

export const useMergeTable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetHostTableId }: { id: number; targetHostTableId: number }) => tablesApi.merge(id, targetHostTableId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tables }),
  });
};

export const useUnmergeTable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tablesApi.unmerge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tables }),
  });
};
