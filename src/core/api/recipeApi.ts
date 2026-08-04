import { apiClient } from '../network/api';

export interface RecipeItemRequest {
  inventoryItemId: number;
  quantity: number;
  unit: string;
}

export interface RecipeItem extends RecipeItemRequest {
  inventoryItemName: string;
  inventoryItemUnit: string;
}

export interface Recipe {
  menuItemId: number;
  items: RecipeItem[];
}

export interface RecipeItemCost {
  inventoryItemId: number;
  name: string;
  quantity: number;
  unit: string;
  lineCost: number;
}

export interface RecipeCost {
  menuItemId: number;
  menuItemName: string;
  ingredientCost: number;
  menuPrice: number;
  foodCostPct: number;
  items: RecipeItemCost[];
}

export const recipeApi = {
  get: (menuItemId: number) => apiClient.get<Recipe>(`/menu-items/${menuItemId}/recipe`).then((r) => r.data),
  upsert: (menuItemId: number, items: RecipeItemRequest[]) =>
    apiClient.put<Recipe>(`/menu-items/${menuItemId}/recipe`, { items }).then((r) => r.data),
  remove: (menuItemId: number) => apiClient.delete<void>(`/menu-items/${menuItemId}/recipe`).then((r) => r.data),
  /** Server-computed ingredient cost vs menu price — Owner/Manager only. */
  getCost: (menuItemId: number) => apiClient.get<RecipeCost>(`/menu-items/${menuItemId}/recipe/cost`).then((r) => r.data),
  bulkImport: (rows: RecipeImportRow[]) =>
    apiClient.post<RecipeImportResult>('/recipe-import', rows).then((r) => r.data),
};

// ---------- Bulk recipe + inventory import (see csvRecipeImport.ts) ----------

/** Recipe (bill of materials) only — no stock or cost. Those stay owned by the Inventory
 * screen; per-dish costing falls out of quantity × the ingredient's own unit cost. */
export interface RecipeImportRow {
  menuItemName: string;
  ingredientName: string;
  quantity: number;
  unit: string;
}

export interface RecipeImportRowError {
  rowNumber: number;
  menuItemName: string;
  ingredientName: string;
  reason: string;
}

export interface RecipeImportResult {
  menuItemsUpdated: number;
  ingredientsCreated: number;
  rowsWithErrors: number;
  errors: RecipeImportRowError[];
}
