import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tablesApi, ApiTable, CreateTableRequest, UpdateTableRequest } from '../tablesApi';
import { queryKeys } from './queryKeys';
import { socketAwareInterval } from '../../realtime/socketLiveness';

// Tables' occupancy is derived from live orders, so it invalidates on the same
// OrdersHub "ordersChanged" push orders do (see useOrdersRealtime) — this interval is
// just the safety net for a dropped/blocked socket, relaxed to 60s once the socket has
// proven itself alive (see socketLiveness.ts) and back to 30s the moment it hasn't.
// refetchIntervalInBackground: a floor view left open on a second screen is unfocused, and
// React Query pauses refetchInterval while it is — see useOrders for the full reasoning.
export const useTables = () =>
  useQuery({ queryKey: queryKeys.tables, queryFn: tablesApi.list, refetchInterval: socketAwareInterval(30000, 60000), refetchIntervalInBackground: true });

// Not table-specific, so no polling needed — this token is valid indefinitely.
export const useMenuOnlyQrToken = () => useQuery({ queryKey: queryKeys.menuOnlyQrToken, queryFn: tablesApi.getMenuOnlyQrToken });

export const useDeliveryQrToken = () => useQuery({ queryKey: queryKeys.deliveryQrToken, queryFn: tablesApi.getDeliveryQrToken });

export const useTokenQrToken = () => useQuery({ queryKey: queryKeys.tokenQrToken, queryFn: tablesApi.getTokenQrToken });

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

/**
 * Merging and unmerging felt slow for a reason that had nothing to do with the server: both
 * endpoints answer 204 (no body), so the grid could only catch up by refetching the whole table
 * list afterwards. That is two round trips before anything moves on screen, and a merge is a
 * gesture staff make standing at the table with a party waiting.
 *
 * Both now rewrite the cached list immediately and let the refetch reconcile behind it, so the
 * tiles change under the finger. The server stays the authority — an error rolls the cache back
 * to exactly what it held before, and the invalidate still runs either way.
 */
export const useMergeTable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetHostTableId }: { id: number; targetHostTableId: number }) => tablesApi.merge(id, targetHostTableId),
    onMutate: async ({ id, targetHostTableId }) => {
      // Stop any in-flight fetch from landing on top of the optimistic write.
      await qc.cancelQueries({ queryKey: queryKeys.tables });
      const previous = qc.getQueryData<ApiTable[]>(queryKeys.tables);
      qc.setQueryData<ApiTable[]>(queryKeys.tables, (old) => {
        if (!old) return old;
        const guest = old.find((t) => t.id === id);
        if (!guest) return old;
        // A merged-in guest disappears from the grid entirely and its seats fold into its
        // host's total — exactly what TablesController.List does server-side.
        return old
          .filter((t) => t.id !== id)
          .map((t) => t.id === targetHostTableId
            ? {
              ...t,
              mergedWith: [...(t.mergedWith ?? []), { id: guest.id, code: guest.code }],
              mergedSeats: (t.mergedSeats ?? t.seats) + guest.seats,
            }
            : t);
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.tables, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.tables }),
  });
};

export const useUnmergeTable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tablesApi.unmerge(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.tables });
      const previous = qc.getQueryData<ApiTable[]>(queryKeys.tables);
      qc.setQueryData<ApiTable[]>(queryKeys.tables, (old) => old?.map((t) =>
        (t.mergedWith ?? []).some((g) => g.id === id)
          ? { ...t, mergedWith: (t.mergedWith ?? []).filter((g) => g.id !== id) }
          : t));
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.tables, context.previous);
    },
    // Deliberately only drops the guest from its host's list here, and leaves restoring the
    // guest's own tile to the refetch: the cache never held that row (a merged-in table is
    // hidden from the list), so there is nothing to put back from memory. The chip and the
    // outline clear instantly, which is the part staff are watching for; the freed tile
    // reappears a moment later.
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.tables }),
  });
};
