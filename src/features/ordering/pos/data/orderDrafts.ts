import { getItem, setItem } from '../../../../core/storage/mmkv';

/**
 * Local-only parked carts ("Save Draft" on the POS) — unlike Hold Order, a draft
 * never touches the server: no order number, no table occupied, no validation.
 * It's for "cashier got interrupted mid-punching", not "order confirmed, cook later".
 * Stored per device (MMKV on native, localStorage on web).
 */
export interface OrderDraft<TLine> {
  id: string;
  savedAt: number;
  orderType: string;
  guestName: string;
  guestPhone: string;
  discountPct: number;
  cart: TLine[];
}

const STORAGE_KEY = 'posOrderDrafts';

export const loadDrafts = <TLine>(): OrderDraft<TLine>[] => {
  try {
    const raw = getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const persistDrafts = <TLine>(drafts: OrderDraft<TLine>[]): void => {
  setItem(STORAGE_KEY, JSON.stringify(drafts));
};

export const newDraftId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
