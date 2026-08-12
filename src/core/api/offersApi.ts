import { apiClient } from '../network/api';

/** Mirrors backend OfferType. */
export type OfferType = 'Percentage' | 'Flat' | 'BuyXGetY' | 'Combo';
/** Mirrors backend OfferScope. */
export type OfferScope = 'EntireBill' | 'Category' | 'SpecificItems';

export interface Offer {
  id: number;
  title: string;
  type: OfferType;
  scope: OfferScope;
  categoryName?: string | null;
  menuItemIds: number[];
  value: number;
  maxDiscountAmount: number;
  buyQty: number;
  getQty: number;
  /** Fixed total for a Combo's item set (one each of menuItemIds). */
  comboPrice: number;
  minOrderValue: number;
  maxApplicationsPerBill: number;
  stackable: boolean;
  startsAtUtc?: string | null;
  endsAtUtc?: string | null;
  /** System.DayOfWeek numbers, 0 = Sunday. Empty = every day. */
  daysOfWeek: number[];
  /** "HH:mm:ss" wall-clock (IST) or null for all-day. */
  startTime?: string | null;
  endTime?: string | null;
  autoApply: boolean;
  isActive: boolean;
}

export interface CreateOfferRequest {
  title: string;
  type: OfferType;
  scope?: OfferScope;
  categoryName?: string | null;
  menuItemIds?: number[];
  value?: number;
  maxDiscountAmount?: number;
  buyQty?: number;
  getQty?: number;
  comboPrice?: number;
  minOrderValue?: number;
  maxApplicationsPerBill?: number;
  daysOfWeek?: number[];
  startsAtUtc?: string | null;
  endsAtUtc?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  stackable?: boolean;
  autoApply?: boolean;
}

export type UpdateOfferRequest = Partial<CreateOfferRequest> & {
  isActive?: boolean;
  /** PATCH treats a null as "leave alone" so a one-field call can't wipe the rest of the offer.
   * Removing an optional window therefore needs to be said outright — see the backend's
   * UpdateOfferRequest. Only the full editor sends these; the active toggle must not. */
  clearTimeWindow?: boolean;
  clearRunDates?: boolean;
};

/** One cart line to price a draft against, for the wizard's live preview. */
export interface OfferPreviewLine {
  lineKey: number;
  menuItemId: number;
  categoryName?: string | null;
  name: string;
  unitPrice: number;
  qty: number;
}

export interface OfferPreviewRequest {
  lines: OfferPreviewLine[];
  /** Supply to price an UNSAVED draft (validity window ignored) — the setup preview. */
  draft?: CreateOfferRequest;
}

export interface AppliedOfferDto {
  offerId: number;
  title: string;
  discountAmount: number;
  detail: string;
}

export interface OfferNearMissDto {
  offerId: number;
  title: string;
  nudge: string;
}

export interface OfferPreviewResult {
  applied: AppliedOfferDto[];
  totalDiscount: number;
  nearMisses: OfferNearMissDto[];
}

export const offersApi = {
  list: (includeInactive = false) =>
    apiClient.get<Offer[]>('/offers', { params: { includeInactive } }).then((r) => r.data),
  get: (id: number) => apiClient.get<Offer>(`/offers/${id}`).then((r) => r.data),
  create: (req: CreateOfferRequest) => apiClient.post<Offer>('/offers', req).then((r) => r.data),
  update: (id: number, req: UpdateOfferRequest) =>
    apiClient.patch<Offer>(`/offers/${id}`, req).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/offers/${id}`).then((r) => r.data),
  preview: (req: OfferPreviewRequest) =>
    apiClient.post<OfferPreviewResult>('/offers/preview', req).then((r) => r.data),
};
