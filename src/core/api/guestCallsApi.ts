import { apiClient } from '../network/api';

/** Two different jobs, not two words for one — see backend GuestCallKind. */
export type GuestCallKind = 'Waiter' | 'Bill';

export interface GuestCall {
  id: number;
  kind: GuestCallKind;
  /** Pre-composed on the server ("Table T5", "Token #7") so the pill, the sheet and the toast
   *  can't drift into naming the same call three different ways. */
  label: string;
  tableCode: string | null;
  tokenNumber: number | null;
  orderId: number | null;
  createdAt: string;
}

export const guestCallsApi = {
  /** Only OPEN calls, oldest first — the order they should be answered in. */
  list: () => apiClient.get<GuestCall[]>('/guest-calls').then((r) => r.data),
  /** "I've got this" — stops the alert for every device. Idempotent on the server, since two
   *  staff tapping the same card during a rush is the normal case, not an error. */
  acknowledge: (id: number) => apiClient.post<void>(`/guest-calls/${id}/acknowledge`).then((r) => r.data),
};
