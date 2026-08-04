import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { whatsappApi } from '../whatsappApi';
import { queryKeys } from './queryKeys';

// Polls rather than a true push stream — React Native has no built-in EventSource and
// pulling in a polyfill just for a Settings screen that's open for a few seconds at a time
// isn't worth it. 2s while a QR pairing is in flight (so the "Connected" flip shows up
// promptly), otherwise a slow background refresh in case it was changed from elsewhere.
export const useWhatsAppStatus = () =>
  useQuery({
    queryKey: queryKeys.whatsAppStatus,
    queryFn: whatsappApi.status,
    refetchInterval: (query) => (query.state.data?.status === 'Connecting' ? 2000 : 15000),
  });

export const useWhatsAppPair = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: whatsappApi.pair,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.whatsAppStatus }),
  });
};

export const useWhatsAppLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: whatsappApi.logout,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.whatsAppStatus });
      qc.invalidateQueries({ queryKey: queryKeys.integrations });
    },
  });
};

export const useUpdateWhatsAppSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updatesEnabled: boolean) => whatsappApi.updateSettings(updatesEnabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.whatsAppStatus }),
  });
};
