import { apiClient } from '../network/api';

/** A named tax slab (e.g. "GST 5%") that menu items are assigned to, so one bill can carry
 * more than one rate. A line's rate resolves as: the item's own group → the group flagged
 * `isDefault` → Cafe Settings' flat `taxRatePct`. The resolved rate is snapshotted onto the
 * order line when it's placed, so editing a group never re-prices an existing bill.
 * See backend TaxGroupsController. */
export interface TaxGroup {
  id: number;
  name: string;
  ratePct: number;
  /** Applied to any menu item with no group of its own. At most one per cafe — setting a
   * new default demotes the previous one server-side. */
  isDefault: boolean;
}

export interface CreateTaxGroupRequest {
  name: string;
  ratePct: number;
  isDefault?: boolean;
}

export interface UpdateTaxGroupRequest {
  name?: string;
  ratePct?: number;
  isDefault?: boolean;
}

export const taxGroupsApi = {
  list: () => apiClient.get<TaxGroup[]>('/tax-groups').then((r) => r.data),
  create: (req: CreateTaxGroupRequest) => apiClient.post<TaxGroup>('/tax-groups', req).then((r) => r.data),
  update: (id: number, req: UpdateTaxGroupRequest) => apiClient.patch<TaxGroup>(`/tax-groups/${id}`, req).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/tax-groups/${id}`).then((r) => r.data),
};
