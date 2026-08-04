import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { integrationsApi } from '../integrationsApi';
import { queryKeys } from './queryKeys';

export const useIntegrations = () => useQuery({ queryKey: queryKeys.integrations, queryFn: integrationsApi.list });

export const useConnectIntegration = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => integrationsApi.connect(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.integrations }),
  });
};

export const useDisconnectIntegration = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => integrationsApi.disconnect(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.integrations }),
  });
};
