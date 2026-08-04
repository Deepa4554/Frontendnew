import { apiClient } from '../network/api';

export interface ApiBranch {
  id: number;
  name: string;
  address: string;
  isActive: boolean;
}

export const branchesApi = {
  list: () => apiClient.get<ApiBranch[]>('/branches').then((r) => r.data),
  create: (name: string, address: string) => apiClient.post<ApiBranch>('/branches', { name, address }).then((r) => r.data),
  deactivate: (id: number) => apiClient.patch<void>(`/branches/${id}/deactivate`).then((r) => r.data),
};
