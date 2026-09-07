import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { waitlistApi } from '../waitlistApi';
import { queryKeys } from './queryKeys';
import { socketAwareInterval } from '../../realtime/socketLiveness';

// Same safety-net shape as useTables — the real-time push (RealtimeScopes.Waitlist) covers
// the common case, this just catches a dropped/blocked socket.
export const useWaitlist = () =>
  useQuery({ queryKey: queryKeys.waitlist, queryFn: waitlistApi.list, refetchInterval: socketAwareInterval(30000, 60000), refetchIntervalInBackground: true });

// Not entry-specific, so no polling needed — this token is valid indefinitely.
export const useWaitlistQrToken = () => useQuery({ queryKey: queryKeys.waitlistQrToken, queryFn: waitlistApi.getQrToken });

export const useSeatWaitlistEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tableId }: { id: number; tableId: number }) => waitlistApi.seat(id, tableId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.waitlist });
      qc.invalidateQueries({ queryKey: queryKeys.tables });
    },
  });
};

export const useCancelWaitlistEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => waitlistApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.waitlist }),
  });
};
