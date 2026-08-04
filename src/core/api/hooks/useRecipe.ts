import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recipeApi, RecipeItemRequest, RecipeImportRow } from '../recipeApi';
import { queryKeys } from './queryKeys';

/** 404 means "no recipe built yet" — a normal, expected state, not an error to surface. */
export const useRecipe = (menuItemId: number | null) =>
  useQuery({
    queryKey: queryKeys.recipe(menuItemId ?? -1),
    queryFn: () => recipeApi.get(menuItemId as number),
    enabled: menuItemId !== null,
    retry: false,
  });

export const useUpsertRecipe = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, items }: { menuItemId: number; items: RecipeItemRequest[] }) => recipeApi.upsert(menuItemId, items),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.recipe(vars.menuItemId) });
      qc.invalidateQueries({ queryKey: queryKeys.recipeCost(vars.menuItemId) });
    },
  });
};

/** 404 means "no recipe built yet" — same expected-state handling as useRecipe. */
export const useRecipeCost = (menuItemId: number | null) =>
  useQuery({
    queryKey: queryKeys.recipeCost(menuItemId ?? -1),
    queryFn: () => recipeApi.getCost(menuItemId as number),
    enabled: menuItemId !== null,
    retry: false,
  });

/** One file wires up many menu items' recipes and possibly new/restocked ingredients at
 * once — broad invalidation (not per-menuItemId like useUpsertRecipe) since we don't know
 * in advance which ids the file touched. */
export const useBulkImportRecipes = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: RecipeImportRow[]) => recipeApi.bulkImport(rows),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu-items'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-batches'] });
      qc.invalidateQueries({ queryKey: ['inventory-expiring'] });
      qc.invalidateQueries({ queryKey: queryKeys.missingRecipeAlerts });
    },
  });
};
