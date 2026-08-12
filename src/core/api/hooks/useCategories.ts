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

export const useCreateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => categoriesApi.create(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
  });
};

export const useReorderCategories = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (names: string[]) => categoriesApi.reorder(names),
    // The server returns the whole re-ordered list, so seed it straight into the cache —
    // an invalidate-and-refetch would let the strip flick back to the old order first.
    onSuccess: (list) => qc.setQueryData(queryKeys.categories, list),
  });
};

/** Rename and delete both rewrite MenuItem.Category and any category-scoped Offer, so all
 * three caches have to go — a stale menu list would keep showing the old category name. */
const invalidateCategoryFallout = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: queryKeys.categories });
  qc.invalidateQueries({ queryKey: queryKeys.menu });
  qc.invalidateQueries({ queryKey: queryKeys.offers });
};

export const useRenameCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, newName }: { name: string; newName: string }) => categoriesApi.rename(name, newName),
    onSuccess: () => invalidateCategoryFallout(qc),
  });
};

export const useDeleteCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, moveTo }: { name: string; moveTo?: string }) => categoriesApi.remove(name, moveTo),
    onSuccess: () => invalidateCategoryFallout(qc),
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
