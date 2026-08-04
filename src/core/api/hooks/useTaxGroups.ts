import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { taxGroupsApi, CreateTaxGroupRequest, UpdateTaxGroupRequest } from '../taxGroupsApi';
import { queryKeys } from './queryKeys';

// Set up once by an Owner, not touched per-order — no polling, same as useStations.
export const useTaxGroups = () => useQuery({ queryKey: queryKeys.taxGroups, queryFn: taxGroupsApi.list });

export const useCreateTaxGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateTaxGroupRequest) => taxGroupsApi.create(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.taxGroups }),
  });
};

export const useUpdateTaxGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateTaxGroupRequest }) => taxGroupsApi.update(id, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.taxGroups });
      // Menu rows show their slab's name/rate, and changing the default re-points every
      // item that has no group of its own.
      qc.invalidateQueries({ queryKey: queryKeys.menu });
    },
  });
};

export const useDeleteTaxGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => taxGroupsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.taxGroups });
      // Server clears taxGroupId on every item that pointed here.
      qc.invalidateQueries({ queryKey: queryKeys.menu });
    },
  });
};
