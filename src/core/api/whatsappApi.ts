import { apiClient } from '../network/api';

export interface WhatsAppStaffStatus {
  status: 'Disconnected' | 'Connecting' | 'Connected' | 'Error';
  phoneNumberE164: string | null;
  connectedAt: string | null;
  updatesEnabled: boolean;
}

export interface WhatsAppPairResponse {
  qrDataUrl: string | null;
  status: string;
}

export const whatsappApi = {
  status: () => apiClient.get<WhatsAppStaffStatus>('/whatsapp/status').then((r) => r.data),
  pair: () => apiClient.post<WhatsAppPairResponse>('/whatsapp/pair').then((r) => r.data),
  logout: () => apiClient.post('/whatsapp/logout'),
  updateSettings: (updatesEnabled: boolean) => apiClient.patch('/whatsapp/settings', { updatesEnabled }),
};
