import { apiClient } from '../network/api';

export interface OrderNoteSuggestion {
  id: number;
  text: string;
  usageCount: number;
}

export const orderNoteSuggestionsApi = {
  list: () => apiClient.get<OrderNoteSuggestion[]>('/order-note-suggestions').then((r) => r.data),
  /** Bumps an existing suggestion's usage, or remembers a brand-new one for next time —
   * call this whenever staff applies/types a note on an order item. */
  upsert: (text: string) => apiClient.post<OrderNoteSuggestion>('/order-note-suggestions', { text }).then((r) => r.data),
};
