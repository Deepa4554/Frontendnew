import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loyaltyMilestonesApi, CreateLoyaltyMilestoneRequest, UpdateLoyaltyMilestoneRequest } from '../loyaltyMilestonesApi';
import { queryKeys } from './queryKeys';

export const useLoyaltyMilestones = () => useQuery({ queryKey: queryKeys.loyaltyMilestones, queryFn: loyaltyMilestonesApi.list });

export const useCreateLoyaltyMilestone = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateLoyaltyMilestoneRequest) => loyaltyMilestonesApi.create(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.loyaltyMilestones }),
  });
};

export const useUpdateLoyaltyMilestone = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateLoyaltyMilestoneRequest }) => loyaltyMilestonesApi.update(id, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.loyaltyMilestones }),
  });
};

export const useDeleteLoyaltyMilestone = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => loyaltyMilestonesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.loyaltyMilestones }),
  });
};
