import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BillingCycle, subscriptionApi, SubscriptionTier } from '../subscriptionApi';
import { queryKeys } from './queryKeys';

export const useSubscription = () => useQuery({ queryKey: queryKeys.subscription, queryFn: subscriptionApi.get });

export const useChangePlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ plan, couponCode, cycle }: { plan: SubscriptionTier; couponCode?: string; cycle?: BillingCycle }) =>
      subscriptionApi.changePlan(plan, couponCode, cycle),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.subscription }),
  });
};
