import { apiClient } from '../network/api';

export interface LoyaltyMilestone {
  id: number;
  thresholdPoints: number;
  discountPct: number;
  isActive: boolean;
}

export interface CreateLoyaltyMilestoneRequest {
  thresholdPoints: number;
  discountPct: number;
}

export interface UpdateLoyaltyMilestoneRequest {
  thresholdPoints?: number;
  discountPct?: number;
  isActive?: boolean;
}

export const loyaltyMilestonesApi = {
  list: () => apiClient.get<LoyaltyMilestone[]>('/loyalty-milestones').then((r) => r.data),
  create: (req: CreateLoyaltyMilestoneRequest) => apiClient.post<LoyaltyMilestone>('/loyalty-milestones', req).then((r) => r.data),
  update: (id: number, req: UpdateLoyaltyMilestoneRequest) => apiClient.patch<LoyaltyMilestone>(`/loyalty-milestones/${id}`, req).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/loyalty-milestones/${id}`).then((r) => r.data),
};
