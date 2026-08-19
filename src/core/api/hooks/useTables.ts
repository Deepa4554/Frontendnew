import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tablesApi, CreateTableRequest, UpdateTableRequest } from '../tablesApi';
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

export const useDeliveryQrToken = () => useQuery({ queryKey: queryKeys.deliveryQrToken, queryFn: tablesApi.getDeliveryQrToken });

export const useCreateTable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateTableRequest) => tablesApi.create(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tables }),
  });
};

export const useUpdateTable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...req }: UpdateTableRequest & { id: number }) => tablesApi.update(id, req),
    // Orders are invalidated alongside tables because a rename changes the label the floor
    // plan matches open orders against — a stale order list would keep showing the old name.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tables });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
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
