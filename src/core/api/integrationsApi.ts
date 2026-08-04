import { apiClient } from '../network/api';

export interface ApiIntegration {
  id: number;
  name: string;
  category: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  connectedAt: string | null;
}

export const integrationsApi = {
  list: () => apiClient.get<ApiIntegration[]>('/integrations').then((r) => r.data),
  connect: (id: number) => apiClient.post<ApiIntegration>(`/integrations/${id}/connect`).then((r) => r.data),
  disconnect: (id: number) => apiClient.post<ApiIntegration>(`/integrations/${id}/disconnect`).then((r) => r.data),
};
