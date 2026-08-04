import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchesApi } from '../branchesApi';
import { queryKeys } from './queryKeys';

export const useBranches = () => useQuery({ queryKey: queryKeys.branches, queryFn: branchesApi.list });

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
