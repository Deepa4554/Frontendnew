import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoriesApi } from '../categoriesApi';
import { queryKeys } from './queryKeys';

// Categories change rarely (an Owner configures them once, not per-order), same
// no-polling reasoning as useStations.
export const useCategories = () => useQuery({ queryKey: queryKeys.categories, queryFn: categoriesApi.list });

export const useSetCategoryDefaultStation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, stationId }: { name: string; stationId: number | null }) =>
      categoriesApi.setDefaultStation(name, stationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
  });
};

export const useApplyCategoryStationToItems = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, stationId }: { name: string; stationId: number }) =>
      categoriesApi.applyStationToItems(name, stationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories });
      // Bulk-updates MenuItem.StationId for every item in the category.
      qc.invalidateQueries({ queryKey: queryKeys.menu });
    },
  });
};
