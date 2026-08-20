import { apiClient } from '../network/api';
import { ApiSubscription, BillingCycle, CYCLE_TO_WIRE, SubscriptionTier } from './subscriptionApi';

// Re-exported for the screens and hooks that have always imported it from here.
export type { BillingCycle };

export interface CreatedOrder {
  orderId: string;
  /** Paise. Passed to checkout.js as-is — the amount is the server's decision, never ours. */
  amount: number;
  currency: string;
  /** Public Razorpay key id. Served per-request instead of being baked into the bundle:
   * env.ts is checked-in constants, so a build-time key would mean editing source to switch
   * between the test and live gateway. See RazorpayOptions.KeyId on the backend. */
  keyId: string;
  description: string;
}

export interface VerifiedPayment {
  verified: boolean;
  subscription: ApiSubscription;
}

export interface RazorpayPaymentResult {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

// Same wire-casing dance as subscriptionApi's PLAN_TO_WIRE — the API's enums are
// PascalCase, the app's are SHOUTY.
const PLAN_TO_WIRE: Record<SubscriptionTier, string> = {
  FREETRIAL: 'FreeTrial',
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
};

export const paymentsApi = {
  /** Note what is NOT sent: a price. The server prices the plan itself (SubscriptionPricing)
   * so a tampered request can't buy the ₹799 plan for ₹1. */
  createSubscriptionOrder: (plan: SubscriptionTier, cycle: BillingCycle) =>
    apiClient
      .post<CreatedOrder>('/payments/create-order', { plan: PLAN_TO_WIRE[plan], cycle: CYCLE_TO_WIRE[cycle] })
      .then((r) => r.data),

  /** The only call that can move the plan — everything before it is just a browser saying so. */
  verifyPayment: (payment: RazorpayPaymentResult) =>
    apiClient.post<VerifiedPayment>('/payments/verify', payment).then((r) => r.data),
};
