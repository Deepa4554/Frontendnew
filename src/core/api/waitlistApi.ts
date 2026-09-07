import { apiClient } from '../network/api';

export interface WaitlistEntry {
  id: number;
  name: string;
  phone: string;
  partySize: number;
  createdAt: string;
}

export const waitlistApi = {
  list: () => apiClient.get<WaitlistEntry[]>('/waitlist').then((r) => r.data),
  /** Token for the entrance QR — printed once, valid indefinitely. See backend
   * WaitlistController.GetQrToken. */
  getQrToken: () => apiClient.get<{ token: string }>('/waitlist/qr-token').then((r) => r.data),
  seat: (id: number, tableId: number) =>
    apiClient.post<void>(`/waitlist/${id}/seat`, { tableId }).then((r) => r.data),
  cancel: (id: number) => apiClient.post<void>(`/waitlist/${id}/cancel`).then((r) => r.data),
};
