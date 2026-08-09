import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deliveryApi, UpdateDeliverySettingsRequest } from '../deliveryApi';
import { queryKeys } from './queryKeys';

export const useDeliverySettings = () =>
  useQuery({ queryKey: queryKeys.deliverySettings, queryFn: deliveryApi.getSettings });

export const useUpdateDeliverySettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateDeliverySettingsRequest) => deliveryApi.updateSettings(req),
    // The response already IS the new settings, so seed the cache with it rather than
    // invalidating and re-fetching — the screen's toggles then never flicker back to their old
    // positions while a refetch is in flight.
    onSuccess: (settings) => qc.setQueryData(queryKeys.deliverySettings, settings),
  });
};

/** Live courier state for one order. `enabled` so a screen can hold off until it actually has
 * a delivery order to ask about. */
export const useDeliveryStatus = (orderId: number | null) =>
  useQuery({
    queryKey: queryKeys.deliveryStatus(orderId ?? 0),
    queryFn: () => deliveryApi.status(orderId as number),
    enabled: orderId !== null,
  });

/** What a rider would cost, without booking one. Never refetched in the background: it's a
 * call out to Borzo, and a price that silently changes under a cashier about to press Book is
 * worse than a slightly stale one. */
export const useDeliveryQuote = (orderId: number | null, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.deliveryQuote(orderId ?? 0),
    queryFn: () => deliveryApi.quote(orderId as number),
    enabled: orderId !== null && enabled,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

export const useBookRider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, prepMinutes }: { orderId: number; prepMinutes: number }) =>
      deliveryApi.book(orderId, prepMinutes),
    onSuccess: (status) => {
      qc.setQueryData(queryKeys.deliveryStatus(status.orderId), status);
      // Booking can add the courier's fee to the bill (when the cafe passes it on), so the
      // order's own totals are no longer what the app last read.
      qc.invalidateQueries({ queryKey: queryKeys.order(status.orderId) });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

export const useCancelRider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: number) => deliveryApi.cancel(orderId),
    onSuccess: (status) => qc.setQueryData(queryKeys.deliveryStatus(status.orderId), status),
  });
};
