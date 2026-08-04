import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vendorsApi, VendorRequest } from '../vendorsApi';
import { queryKeys } from './queryKeys';

export const useVendors = (includeInactive = false) =>
  useQuery({ queryKey: queryKeys.vendors(includeInactive), queryFn: () => vendorsApi.list(includeInactive) });

const invalidateVendors = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['vendors'] });

export const useCreateVendor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: VendorRequest) => vendorsApi.create(req),
    onSuccess: () => invalidateVendors(qc),
  });
};

export const useUpdateVendor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: VendorRequest & { isActive: boolean } }) => vendorsApi.update(id, req),
    onSuccess: () => invalidateVendors(qc),
  });
};

export const useDeactivateVendor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => vendorsApi.deactivate(id),
    onSuccess: () => invalidateVendors(qc),
  });
};
