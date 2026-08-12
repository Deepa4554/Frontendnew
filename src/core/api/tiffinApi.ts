import { apiClient } from '../network/api';

/** Daily = plate goes out by default, customer speaks up only to skip (opt-out).
 *  Occasional = nothing by default, plate sent only when asked (opt-in). The two differ
 *  purely in what an untouched day defaults to — see the roster toggle. */
export type TiffinType = 'Daily' | 'Occasional';
export type TiffinMealType = 'Veg' | 'NonVeg' | 'Custom';
export type TiffinMarkStatus = 'Delivered' | 'Skipped';
export type TiffinInvoiceStatus = 'Unpaid' | 'PartiallyPaid' | 'Paid';
/** Real tenders a tiffin bill can be settled with — "Due" isn't one, the bill IS the credit. */
export type TiffinSettleMethod = 'Cash' | 'Card' | 'UPI';
/** Postpaid (default) settles by monthly invoice, same as always. Prepaid settles from a running
 * wallet balance — each delivered day's cost comes out of it as the day is recorded, instead of
 * accumulating into a bill. See TiffinSubscriber.walletBalance. */
export type TiffinPaymentMode = 'Postpaid' | 'Prepaid';
export type TiffinWalletTxnType = 'Recharge' | 'Deduction';

export interface TiffinSubscriber {
  id: number;
  customerId: number;
  name: string;
  phone: string | null;
  profilePhotoUrl: string | null;
  type: TiffinType;
  planName: string;
  mealType: TiffinMealType;
  rate: number;
  defaultQty: number;
  deliveryAddress: string | null;
  /** yyyy-MM-dd (cafe-local IST date). */
  startDate: string;
  isActive: boolean;
  notes: string | null;
  paymentMode: TiffinPaymentMode;
  /** Null unless paymentMode is Prepaid. Negative once deliveries have outrun top-ups — that's
   * allowed, not blocked (see TiffinRosterEntry.walletBalance for the roster-side warning). */
  walletBalance: number | null;
}

export interface TiffinRosterEntry {
  subscriberId: number;
  customerId: number;
  name: string;
  phone: string | null;
  type: TiffinType;
  planName: string;
  mealType: TiffinMealType;
  deliveryAddress: string | null;
  defaultQty: number;
  /** Effective answer for the day after the mark is applied to the type's default. */
  delivering: boolean;
  qty: number;
  /** The stored override for the day, if any — null on an untouched default day. */
  markStatus: TiffinMarkStatus | null;
  paymentMode: TiffinPaymentMode;
  /** Null unless paymentMode is Prepaid — the balance after this date's deduction is synced.
   * Negative means the roster should flag it (still delivers, just needs a top-up). */
  walletBalance: number | null;
}

export interface TiffinRosterSummary {
  totalDelivering: number;
  totalPlates: number;
  vegPlates: number;
  nonVegPlates: number;
  customPlates: number;
  skippedCount: number;
}

export interface TiffinRoster {
  date: string;
  summary: TiffinRosterSummary;
  entries: TiffinRosterEntry[];
}

export interface TiffinBillingLine {
  subscriberId: number;
  customerId: number;
  name: string;
  phone: string | null;
  type: TiffinType;
  planName: string;
  rate: number;
  deliveredDays: number;
  totalQty: number;
  amount: number;
  /** Set when an invoice has already been raised for this exact period. */
  invoiceId: number | null;
  invoiceStatus: TiffinInvoiceStatus | null;
  invoiceAmountPaid: number;
}

export interface TiffinBillingSummary {
  subscriberCount: number;
  totalPlates: number;
  totalAmount: number;
  alreadyInvoiced: number;
  collected: number;
  outstanding: number;
}

export interface TiffinBilling {
  periodStart: string;
  periodEnd: string;
  summary: TiffinBillingSummary;
  lines: TiffinBillingLine[];
}

export interface TiffinInvoice {
  id: number;
  subscriberId: number;
  customerId: number;
  name: string;
  phone: string | null;
  planName: string;
  periodStart: string;
  periodEnd: string;
  deliveredDays: number;
  totalQty: number;
  rate: number;
  totalAmount: number;
  amountPaid: number;
  outstanding: number;
  status: TiffinInvoiceStatus;
  generatedByName: string;
  createdAt: string;
}

export interface TiffinPayment {
  id: number;
  amount: number;
  method: string;
  note: string | null;
  recordedByName: string;
  createdAt: string;
}

export interface TiffinInvoiceDetail {
  invoice: TiffinInvoice;
  payments: TiffinPayment[];
}

export interface TiffinInvoiceListSummary {
  totalOutstanding: number;
  invoicesWithDue: number;
  collectedThisMonth: number;
}

export interface TiffinInvoiceList {
  summary: TiffinInvoiceListSummary;
  invoices: TiffinInvoice[];
}

export interface CreateTiffinSubscriberRequest {
  name: string;
  phone?: string | null;
  type: TiffinType;
  planName: string;
  mealType: TiffinMealType;
  rate: number;
  defaultQty: number;
  deliveryAddress?: string | null;
  startDate?: string | null;
  notes?: string | null;
  paymentMode?: TiffinPaymentMode;
}

export interface UpdateTiffinSubscriberRequest {
  type: TiffinType;
  planName: string;
  mealType: TiffinMealType;
  rate: number;
  defaultQty: number;
  deliveryAddress?: string | null;
  isActive: boolean;
  notes?: string | null;
  paymentMode: TiffinPaymentMode;
}

export interface MarkTiffinRequest {
  subscriberId: number;
  date: string;
  deliver: boolean;
  qty?: number | null;
}

export interface GenerateTiffinInvoicesRequest {
  /** yyyy-MM; omit for the current month. */
  month: string;
  subscriberId?: number | null;
}

export interface SettleTiffinInvoiceRequest {
  amount: number;
  method: TiffinSettleMethod;
  note?: string;
}

export interface TiffinWalletTransaction {
  id: number;
  type: TiffinWalletTxnType;
  amount: number;
  /** Deduction only — the roster date this row charges for. */
  forDate: string | null;
  /** Recharge only. */
  method: TiffinSettleMethod | null;
  note: string | null;
  recordedByName: string;
  createdAt: string;
}

export interface TiffinWallet {
  balance: number;
  transactions: TiffinWalletTransaction[];
}

export interface RechargeTiffinWalletRequest {
  amount: number;
  method: TiffinSettleMethod;
  note?: string;
}

export const tiffinApi = {
  listSubscribers: (params?: { search?: string; includeInactive?: boolean }) =>
    apiClient.get<TiffinSubscriber[]>('/tiffin/subscribers', { params }).then((r) => r.data),
  createSubscriber: (req: CreateTiffinSubscriberRequest) =>
    apiClient.post<TiffinSubscriber>('/tiffin/subscribers', req).then((r) => r.data),
  updateSubscriber: (id: number, req: UpdateTiffinSubscriberRequest) =>
    apiClient.put<TiffinSubscriber>(`/tiffin/subscribers/${id}`, req).then((r) => r.data),

  roster: (date?: string) =>
    apiClient.get<TiffinRoster>('/tiffin/roster', { params: date ? { date } : undefined }).then((r) => r.data),
  mark: (req: MarkTiffinRequest) =>
    apiClient.post<TiffinRosterEntry>('/tiffin/roster/mark', req).then((r) => r.data),

  billing: (month?: string) =>
    apiClient.get<TiffinBilling>('/tiffin/billing', { params: month ? { month } : undefined }).then((r) => r.data),
  generate: (req: GenerateTiffinInvoicesRequest) =>
    apiClient.post<TiffinBilling>('/tiffin/billing/generate', req).then((r) => r.data),
  listInvoices: (status?: TiffinInvoiceStatus) =>
    apiClient.get<TiffinInvoiceList>('/tiffin/invoices', { params: status ? { status } : undefined }).then((r) => r.data),
  getInvoice: (id: number) =>
    apiClient.get<TiffinInvoiceDetail>(`/tiffin/invoices/${id}`).then((r) => r.data),
  settleInvoice: (id: number, req: SettleTiffinInvoiceRequest) =>
    apiClient.post<TiffinInvoiceDetail>(`/tiffin/invoices/${id}/settle`, req).then((r) => r.data),

  getWallet: (subscriberId: number) =>
    apiClient.get<TiffinWallet>(`/tiffin/subscribers/${subscriberId}/wallet`).then((r) => r.data),
  recharge: (subscriberId: number, req: RechargeTiffinWalletRequest) =>
    apiClient.post<TiffinSubscriber>(`/tiffin/subscribers/${subscriberId}/recharge`, req).then((r) => r.data),
};
