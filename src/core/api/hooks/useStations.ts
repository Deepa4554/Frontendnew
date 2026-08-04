import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stationsApi, CreateStationRequest, UpdateStationRequest } from '../stationsApi';
import { queryKeys } from './queryKeys';

// Stations change rarely (an Owner sets them up once, not per-order), so no polling —
// unlike useTables/useOrders which need a near-live feel.
export const useStations = () => useQuery({ queryKey: queryKeys.stations, queryFn: stationsApi.list });

export const useCreateStation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateStationRequest) => stationsApi.create(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stations }),
  });
};

export const useUpdateStation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateStationRequest }) => stationsApi.update(id, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.stations });
      // A rename changes MenuItem.stationName's display value too.
      qc.invalidateQueries({ queryKey: queryKeys.menu });
    },
  });
};

export const useDeleteStation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => stationsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stations }),
  });
};
