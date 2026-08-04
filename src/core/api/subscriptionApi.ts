import { apiClient } from '../network/api';

export type SubscriptionTier = 'FREETRIAL' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export interface ApiSubscription {
  plan: SubscriptionTier;
  planExpiresAt: string | null;
  monthlyOrdersUsed: number;
  maxOrdersPerMonth: number;
  maxBranches: number;
  maxStaff: number;
}

const PLAN_TO_WIRE: Record<SubscriptionTier, string> = {
  FREETRIAL: 'FreeTrial',
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
};

export const subscriptionApi = {
  get: () => apiClient.get<ApiSubscription>('/subscription').then((r) => r.data),
  changePlan: (plan: SubscriptionTier, couponCode?: string) =>
    apiClient.post<ApiSubscription>('/subscription/change-plan', { plan: PLAN_TO_WIRE[plan], couponCode }).then((r) => r.data),
};
