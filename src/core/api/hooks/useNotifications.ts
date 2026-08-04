import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../notificationsApi';
import { queryKeys } from './queryKeys';

/**
 * Polls on the same 30s safety-net cadence as usePendingConfirmationOrders, and for a
 * stronger reason: this list has no realtime channel at all behind it. useOrdersRealtime
 * deliberately leaves ['notifications'] out of SCOPE_QUERY_KEYS (see its own comment) on the
 * grounds that FCM is the precise per-user delivery channel for it — but FCM is off wherever
 * the Firebase credentials aren't configured (no google-services.json / blank
 * Fcm:CredentialsPath), and there the list was left with no refresh trigger whatsoever: the
 * global 5-minute staleTime and no interval meant a new order's notification only surfaced
 * when some unrelated notification mutation happened to invalidate it.
 *
 * staleTime: 0 so any invalidation (a push, a mark-read) still forces a fresh fetch rather
 * than being swallowed by the global default, and refetchIntervalInBackground because the
 * bell has to keep counting while the POS window sits behind another app — same reason
 * useOrders spells out.
 */
export const useNotifications = () =>
  useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => notificationsApi.list(),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

export const useMarkNotificationRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
};

export const useMarkAllNotificationsRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
};

export const useArchiveNotification = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notificationsApi.archive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
};

export const useRetryNotification = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notificationsApi.retry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
};

export const useMyNotificationPreferences = () =>
  useQuery({ queryKey: queryKeys.myNotificationPreferences, queryFn: () => notificationsApi.myPreferences() });

export const useUpdateMyNotificationPreference = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ category, enabled }: { category: string; enabled: boolean }) =>
      notificationsApi.updateMyPreference(category, enabled),
    // Invalidates the ['notifications'] prefix, which covers the preference list AND the
    // notification list itself — muting a category hides its existing rows from this user
    // server-side (NotificationsController.List), so a stale list would keep showing entries
    // the toggle was just used to get rid of.
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
};

export const useDeleteNotification = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notificationsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
};
