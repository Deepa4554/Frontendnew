import { apiClient } from '../network/api';

export interface Reward {
  id: number;
  name: string;
  pointsCost: number;
  icon: string;
  isActive: boolean;
}

export interface CreateRewardRequest {
  name: string;
  pointsCost: number;
  icon?: string;
}

export interface UpdateRewardRequest {
  name?: string;
  pointsCost?: number;
  icon?: string;
  isActive?: boolean;
}

export const rewardsApi = {
  list: () => apiClient.get<Reward[]>('/rewards').then((r) => r.data),
  create: (req: CreateRewardRequest) => apiClient.post<Reward>('/rewards', req).then((r) => r.data),
  update: (id: number, req: UpdateRewardRequest) => apiClient.patch<Reward>(`/rewards/${id}`, req).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/rewards/${id}`).then((r) => r.data),
};
