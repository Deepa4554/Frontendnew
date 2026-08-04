import { apiClient } from '../network/api';

/** A managed kitchen prep station (e.g. "Main Kitchen", "Bar", "Dessert") — replaces the
 * old free-text kitchenStation field on MenuItem. Drives KDS station filtering and
 * per-station KOT print routing. See backend StationsController. */
export interface Station {
  id: number;
  name: string;
  icon: string;
  sortOrder: number;
  active: boolean;
}

export interface CreateStationRequest {
  name: string;
  icon?: string;
}

export interface UpdateStationRequest {
  name?: string;
  icon?: string;
  sortOrder?: number;
  active?: boolean;
}

export const stationsApi = {
  list: () => apiClient.get<Station[]>('/stations').then((r) => r.data),
  create: (req: CreateStationRequest) => apiClient.post<Station>('/stations', req).then((r) => r.data),
  update: (id: number, req: UpdateStationRequest) => apiClient.patch<Station>(`/stations/${id}`, req).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/stations/${id}`).then((r) => r.data),
};
