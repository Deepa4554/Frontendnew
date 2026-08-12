import { apiClient } from '../network/api';

/** A per-tenant default station for a MenuItem.Category value — Category itself stays a
 * free-text string on MenuItem, this is just a convenience lookup so a cafe can set
 * "everything in Beverages defaults to the Bar station" once instead of tagging every
 * item individually. See backend CategoriesController. */
export interface Category {
  name: string;
  defaultStationId: number | null;
  defaultStationName: string | null;
  itemCount: number;
  /** Position in the POS category strip, low first. The server already returns the list in
   * this order, so prefer the array order over comparing this — categories with no position
   * configured come back as int.MaxValue. */
  sortOrder: number;
}

/** What a rename/delete actually moved, so the UI can report it instead of just closing. */
export interface CategoryMutationResult {
  name: string;
  movedItemCount: number;
  updatedOfferCount: number;
  /** True when a rename landed on a name that already existed and the two were merged. */
  mergedInto: boolean;
}

export const categoriesApi = {
  list: () => apiClient.get<Category[]>('/categories').then((r) => r.data),
  create: (name: string) => apiClient.post<Category>('/categories', { name }).then((r) => r.data),
  /** Full list in the order it should appear, front first. Returns the re-ordered list. */
  reorder: (names: string[]) => apiClient.put<Category[]>('/categories/reorder', { names }).then((r) => r.data),
  rename: (name: string, newName: string) =>
    apiClient.put<CategoryMutationResult>(`/categories/${encodeURIComponent(name)}/rename`, { newName }).then((r) => r.data),
  /** moveTo is required by the server whenever the category still has items in it. */
  remove: (name: string, moveTo?: string) =>
    apiClient
      .delete<CategoryMutationResult>(`/categories/${encodeURIComponent(name)}`, {
        params: moveTo ? { moveTo } : undefined,
      })
      .then((r) => r.data),
  setDefaultStation: (name: string, stationId: number | null) =>
    apiClient.put<Category>(`/categories/${encodeURIComponent(name)}/default-station`, { stationId }).then((r) => r.data),
  applyStationToItems: (name: string, stationId: number) =>
    apiClient.post<{ createdCount: number; skippedCount: number }>(
      `/categories/${encodeURIComponent(name)}/apply-station-to-items`,
      { stationId },
    ).then((r) => r.data),
};
