import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import { getApiErrorMessage } from '../../network/api';
import { isRazorpayCheckoutAvailable, openRazorpayCheckout } from '../../payments/razorpayCheckout';
import { showToast } from '../../store/uiSlice';
import { BillingCycle, paymentsApi } from '../paymentsApi';
import { SubscriptionTier } from '../subscriptionApi';
import { queryKeys } from './queryKeys';

interface StartCheckoutArgs {
  plan: SubscriptionTier;
  cycle: BillingCycle;
  /** The plan card's own colour, so the Razorpay modal doesn't arrive in default blue on
   * top of a brown app. */
  themeColor?: string;
}

/**
 * The whole Razorpay Standard Checkout round trip behind one call: price and create the
 * order on the server, open the modal, then hand the signed result straight back to the
 * server to be verified. The plan only changes on that last step — nothing the browser is
 * told along the way is treated as proof of payment.
 *
 * Lives here rather than in SubscriptionScreen because all three steps have to stay
 * together: a create-order with no verify leaves a cafe that has paid and not been upgraded,
 * which is the one outcome worth writing code carefully to avoid.
 *
 * Not available on native — razorpayCheckout.ts (the non-.web twin) reports unavailable
 * there and the screen keeps its "contact your provider" path. See that file for why.
 */
export const useSubscriptionCheckout = () => {
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const user = useSelector((state: any) => state.auth.user);
  const [pendingPlan, setPendingPlan] = React.useState<SubscriptionTier | null>(null);

  const startCheckout = async ({ plan, cycle, themeColor }: StartCheckoutArgs) => {
    if (pendingPlan) return;
    setPendingPlan(plan);
    try {
      const order = await paymentsApi.createSubscriptionOrder(plan, cycle);

      const outcome = await openRazorpayCheckout({
        keyId: order.keyId,
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        description: order.description,
        prefillName: user?.name,
        prefillEmail: user?.email,
        prefillContact: user?.phone,
        themeColor,
      });

      // Closing the modal is not a failure and gets no error toast — the owner knows what
      // they just did, and a red banner for it reads like something went wrong.
      if (outcome.status === 'dismissed') return;

      if (outcome.status === 'failed') {
        dispatch(showToast({ message: outcome.message, icon: 'alert-circle-outline', tone: 'danger', durationMs: 4000 }));
        return;
      }

      const { subscription } = await paymentsApi.verifyPayment(outcome.payment);
      // Write the server's own copy of the subscription straight into the cache: the plan
      // gates all over the app read from this key, and a refetch racing the response would
      // leave the owner looking at the plan they just paid to leave.
      queryClient.setQueryData(queryKeys.subscription, subscription);
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription });
      dispatch(showToast({ message: 'Payment successful — your plan is active.', icon: 'check-circle-outline', tone: 'success' }));
    } catch (error) {
      // Reached either because create-order failed (nothing was charged) or because verify
      // did (something may well have been). getApiErrorMessage surfaces the server's own
      // wording, which distinguishes the two — see PaymentsController.
      dispatch(showToast({
        message: getApiErrorMessage(error, 'Could not complete the payment. Please try again.'),
        icon: 'alert-circle-outline',
        tone: 'danger',
        durationMs: 5000,
      }));
    } finally {
      setPendingPlan(null);
    }
  };

  return {
    startCheckout,
    /** Which plan's button should show a spinner — null when nothing is in flight. */
    pendingPlan,
    /**
     * False on native (no checkout.js — see razorpayCheckout.ts) and for anyone who isn't
     * the Owner. The subscription screen itself is visible to Managers/Cashiers/Accountants
     * too (see FLOOR_STAFF_HIDDEN_ROUTES), but /api/payments is Policy.OwnerOnly, so without
     * this check their Upgrade button would open a modal and then 403 after they had paid.
     * They keep the "contact your provider" path instead.
     */
    isCheckoutSupported: isRazorpayCheckoutAvailable() && user?.role === 'Owner',
  };
};
