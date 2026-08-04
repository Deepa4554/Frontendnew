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
}

export const categoriesApi = {
  list: () => apiClient.get<Category[]>('/categories').then((r) => r.data),
  setDefaultStation: (name: string, stationId: number | null) =>
    apiClient.put<Category>(`/categories/${encodeURIComponent(name)}/default-station`, { stationId }).then((r) => r.data),
  applyStationToItems: (name: string, stationId: number) =>
    apiClient.post<{ createdCount: number; skippedCount: number }>(
      `/categories/${encodeURIComponent(name)}/apply-station-to-items`,
      { stationId },
    ).then((r) => r.data),
};
