import { apiClient } from '../network/api';

export interface Vendor {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface VendorRequest {
  name: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
}

export const vendorsApi = {
  list: (includeInactive = false) =>
    apiClient.get<Vendor[]>('/vendors', { params: { includeInactive } }).then((r) => r.data),
  get: (id: number) => apiClient.get<Vendor>(`/vendors/${id}`).then((r) => r.data),
  create: (req: VendorRequest) => apiClient.post<Vendor>('/vendors', req).then((r) => r.data),
  update: (id: number, req: VendorRequest & { isActive: boolean }) =>
    apiClient.put<Vendor>(`/vendors/${id}`, req).then((r) => r.data),
  /** Deactivates (soft-disable) — past purchase orders keep pointing at this vendor. */
  deactivate: (id: number) => apiClient.delete(`/vendors/${id}`).then(() => undefined),
};
