import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rewardsApi, CreateRewardRequest, UpdateRewardRequest } from '../rewardsApi';
import { queryKeys } from './queryKeys';

export const useRewards = () => useQuery({ queryKey: queryKeys.rewards, queryFn: rewardsApi.list });

export const useCreateReward = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateRewardRequest) => rewardsApi.create(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rewards }),
  });
};

export const useUpdateReward = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateRewardRequest }) => rewardsApi.update(id, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rewards }),
  });
};

export const useDeleteReward = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => rewardsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rewards }),
  });
};
