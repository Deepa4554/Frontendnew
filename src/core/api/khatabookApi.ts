import { apiClient } from '../network/api';

/** The real tenders a khata repayment can arrive as — "Due" is deliberately not one of
 *  them (paying off credit with more credit is just no payment at all). */
export type KhataSettleMethod = 'Cash' | 'Card' | 'UPI';

export interface KhataCustomer {
  customerId: number;
  name: string;
  phone: string | null;
  profilePhotoUrl: string | null;
  /** What's still owed — lifetime due minus lifetime paid back. */
  outstanding: number;
  /** Lifetime figures across the whole ledger, not just the unsettled part: an outstanding
   *  ₹500 reads very differently against ₹9,000 repaid than against nothing repaid. */
  totalDue: number;
  totalPaid: number;
  entryCount: number;
  /** Last movement of any kind — credit taken or money paid back. */
  lastActivityAt: string;
  /** When credit was last extended. */
  lastDueAt: string | null;
}

export interface KhataEntry {
  id: number;
  /** DUE = credit taken (from a bill settled on Due), PAYMENT = money paid back. */
  type: 'Due' | 'Payment';
  /** Always positive; `type` carries the direction. */
  amount: number;
  /** The bill the credit came from — set on Due rows, null on repayments (a repayment
   *  settles the balance as a whole, not one specific old bill). */
  orderId: number | null;
  orderNumber: string | null;
  /** How a repayment actually came in. Null on Due rows, which moved no money. */
  method: string | null;
  note: string | null;
  recordedByName: string;
  createdAt: string;
  /** What was still owed immediately after this row — computed server-side, since it
   *  depends on the ledger as a whole rather than the rows being shown. */
  runningOutstanding: number;
}

export interface KhataDetail {
  customer: KhataCustomer;
  /** Newest first. Unpaged — a khata is a handful of rows per customer. */
  entries: KhataEntry[];
}

export interface KhataSummary {
  totalOutstanding: number;
  customersWithDue: number;
  collectedThisMonth: number;
}

export interface Khatabook {
  /** The cafe's whole position — deliberately NOT affected by the list's search filter. */
  summary: KhataSummary;
  customers: KhataCustomer[];
}

export interface SettleKhataRequest {
  amount: number;
  method: KhataSettleMethod;
  note?: string;
}

export const khatabookApi = {
  /** `includeSettled` brings back customers whose khata is square — off by default, since
   *  the list's job is "who do I need to chase". */
  list: (params?: { search?: string; includeSettled?: boolean }) =>
    apiClient.get<Khatabook>('/khatabook', { params }).then((r) => r.data),
  get: (customerId: number) => apiClient.get<KhataDetail>(`/khatabook/${customerId}`).then((r) => r.data),
  /** Records money collected — the whole balance or any part of it, as many times as the
   *  customer comes back. Returns the customer's refreshed ledger. */
  settle: (customerId: number, req: SettleKhataRequest) =>
    apiClient.post<KhataDetail>(`/khatabook/${customerId}/settle`, req).then((r) => r.data),
};
