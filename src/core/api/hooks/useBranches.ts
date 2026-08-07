import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchesApi } from '../branchesApi';
import { queryKeys } from './queryKeys';

// `enabled` lets a caller that already knows this login/plan can never see branches
// (e.g. a role/plan gate on the Settings tile) skip the request entirely instead of
// firing it and eating the resulting 403 — defaults to on for every existing caller.
export const useBranches = (options?: { enabled?: boolean }) =>
  useQuery({ queryKey: queryKeys.branches, queryFn: branchesApi.list, enabled: options?.enabled ?? true });

export const useCreateBranch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, address }: { name: string; address: string }) => branchesApi.create(name, address),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.branches });
      qc.invalidateQueries({ queryKey: queryKeys.subscription });
    },
  });
};

export const useDeactivateBranch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => branchesApi.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.branches }),
  });
};
