import { apiClient } from '../network/api';

export type SubscriptionTier = 'FREETRIAL' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

/** How long one paid term runs. Defined here rather than in paymentsApi so that module (which
 * already imports from this one) can re-export it without the two importing each other. */
export type BillingCycle = 'MONTHLY' | 'YEARLY';

export interface ApiSubscription {
  plan: SubscriptionTier;
  /** The cycle the CURRENT term was sold on. Always MONTHLY on the free trial, which isn't
   * sold on a cycle at all — read it together with `plan` before showing it. */
  cycle: BillingCycle;
  /** Start of the current term. Null only on rows the backfill migration couldn't date. */
  planStartedAt: string | null;
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

export const CYCLE_TO_WIRE: Record<BillingCycle, string> = {
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
};

/** Storefront wording for a stored cycle — 'Yearly'/'Monthly' as a plain adjective. */
export const cycleLabel = (cycle: BillingCycle) => (cycle === 'YEARLY' ? 'Yearly' : 'Monthly');

export const subscriptionApi = {
  get: () => apiClient.get<ApiSubscription>('/subscription').then((r) => r.data),
  changePlan: (plan: SubscriptionTier, couponCode?: string, cycle: BillingCycle = 'MONTHLY') =>
    apiClient
      .post<ApiSubscription>('/subscription/change-plan', { plan: PLAN_TO_WIRE[plan], couponCode, cycle: CYCLE_TO_WIRE[cycle] })
      .then((r) => r.data),
};
