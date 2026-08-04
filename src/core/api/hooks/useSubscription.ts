import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { subscriptionApi, SubscriptionTier } from '../subscriptionApi';
import { queryKeys } from './queryKeys';

export const useSubscription = () => useQuery({ queryKey: queryKeys.subscription, queryFn: subscriptionApi.get });

export const useChangePlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ plan, couponCode }: { plan: SubscriptionTier; couponCode?: string }) => subscriptionApi.changePlan(plan, couponCode),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.subscription }),
  });
};
