import { useSubscription } from '../api/hooks/useSubscription';
import { SubscriptionTier } from '../api/subscriptionApi';

/**
 * Product-facing plan categories. The subscription backend still uses the finer
 * FREE_TRIAL/STARTER/PROFESSIONAL/ENTERPRISE tiers; these three categories are the
 * customer-facing packaging (Normal / Plus / Premium) that gate which screens a cafe
 * sees. Premium unlocks later together with the integration features.
 *
 * The plan lives on the cafe's subscription (business level), so every user in the
 * cafe — Owner, Manager, Waiter — inherits the same category automatically. Role-based
 * access (see core/auth/permissions.ts) is a separate, orthogonal gate.
 */
export type PlanCategory = 'NORMAL' | 'PLUS' | 'PREMIUM';

export const PLAN_CATEGORY_RANK: Record<PlanCategory, number> = {
  NORMAL: 0,
  PLUS: 1,
  PREMIUM: 2,
};

export const PLAN_CATEGORY_LABEL: Record<PlanCategory, string> = {
  NORMAL: 'Normal',
  PLUS: 'Plus',
  PREMIUM: 'Premium',
};

// Maps the existing subscription tiers onto the three product categories. When the
// backend tiers are eventually renamed to Normal/Plus/Premium (see
// docs/multi-tenant-saas-plan.md §16.3) this mapping becomes a straight pass-through.
// The 14-day free trial defaults to PLUS (not the full PREMIUM/Integrations tier) —
// enough for a new cafe to explore CRM/Dashboard/Staff/Inventory plus WhatsApp Business,
// but the Integrations hub itself stays paid-only Premium even during the trial (WhatsApp
// Business is the one integration packaged at PLUS). Mirrors the backend's PlanCategoryMapper
// (Infrastructure/PlanCategory.cs) exactly.
const TIER_TO_CATEGORY: Record<SubscriptionTier, PlanCategory> = {
  FREETRIAL: 'PLUS',
  STARTER: 'NORMAL',
  PROFESSIONAL: 'PLUS',
  ENTERPRISE: 'PREMIUM',
};

export const tierToCategory = (tier: SubscriptionTier): PlanCategory =>
  TIER_TO_CATEGORY[tier] ?? 'NORMAL';

export const categoryMeetsMin = (current: PlanCategory, min: PlanCategory): boolean =>
  PLAN_CATEGORY_RANK[current] >= PLAN_CATEGORY_RANK[min];

/**
 * Current cafe's plan category, derived from its subscription. Defaults to NORMAL
 * while loading or if the subscription can't be read, so the core POS is never hidden.
 */
export const usePlanCategory = () => {
  const { data: subscription, isLoading } = useSubscription();
  const category: PlanCategory = subscription ? tierToCategory(subscription.plan) : 'NORMAL';
  return {
    category,
    rank: PLAN_CATEGORY_RANK[category],
    isLoading,
    /** True if the cafe's plan includes features requiring `min` or lower. */
    hasPlan: (min: PlanCategory) => categoryMeetsMin(category, min),
  };
};
