import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { guestCallsApi } from '../guestCallsApi';
import { queryKeys } from './queryKeys';
import { socketAwareInterval } from '../../realtime/socketLiveness';

/**
 * Outstanding guest calls, for the floor-wide alert (see GuestCallsHost).
 *
 * Polled harder than the waitlist behind its realtime push (RealtimeScopes.GuestCalls): a party
 * waiting to be seated is measured in minutes, but a table that has asked for its bill is sitting
 * there watching the room, and a dropped socket must not leave them waiting the 30–60s the
 * waitlist is happy with. `refetchIntervalInBackground` for the same reason it's set there — the
 * till tab is very often not the focused one.
 */
export const useGuestCalls = () =>
  useQuery({
    queryKey: queryKeys.guestCalls,
    queryFn: guestCallsApi.list,
    refetchInterval: socketAwareInterval(10000, 20000),
    refetchIntervalInBackground: true,
  });

export const useAcknowledgeGuestCall = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => guestCallsApi.acknowledge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.guestCalls }),
  });
};
