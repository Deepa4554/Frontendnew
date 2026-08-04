import { apiClient } from '../network/api';

export interface SearchResult {
  category: 'Menu' | 'Tables' | 'Customers' | 'Inventory' | 'Orders';
  id: string;
  title: string;
  subtitle: string;
}

export const searchApi = {
  search: (q: string) => apiClient.get<SearchResult[]>('/search', { params: { q } }).then((r) => r.data),
};
