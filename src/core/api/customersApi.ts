import { apiClient } from '../network/api';
import { PagedResult } from './types';

export type MembershipTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface CustomerSummary {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  profilePhotoUrl: string | null;
  visitCount: number;
  /** Real count of orders in the last 30 days — not the lifetime visitCount. */
  visitsLast30Days: number;
  totalPoints: number;
  availablePoints: number;
  tier: MembershipTier;
  totalSpent: number;
  lastVisitAt: string;
  joinedAt: string;
}

export interface Visit {
  orderId: number;
  orderNumber: string;
  date: string;
  orderTotal: number;
  pointsEarned: number;
  items: string[];
}

export interface Coupon {
  id: number;
  code: string;
  title: string;
  description: string;
  type: 'PERCENT' | 'FLAT' | 'BOGO' | 'BIRTHDAY' | 'REFERRAL';
  value: number;
  minOrderValue: number;
  expiresAt: string;
  isUsed: boolean;
}

export interface GiftCard {
  id: number;
  code: string;
  balance: number;
  originalBalance: number;
  status: 'ACTIVE' | 'USED' | 'EXPIRED';
  purchasedAt: string;
  expiresAt: string;
}

export interface FavoriteItem {
  menuItemId: number;
  name: string;
  price: number;
  orderCount: number;
}

export interface CustomerDetail {
  summary: CustomerSummary;
  addressLine1: string | null;
  addressCity: string | null;
  addressPincode: string | null;
  dateOfBirth: string | null;
  notes: string | null;
  referralCode: string;
  totalReferrals: number;
  successfulReferrals: number;
  referralEarned: number;
  recentVisits: Visit[];
  coupons: Coupon[];
  giftCards: GiftCard[];
  favoriteItems: FavoriteItem[];
}

export interface CreateCustomerRequest {
  name: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
}

export interface UpdateCustomerRequest {
  name?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressCity?: string;
  addressPincode?: string;
  notes?: string;
}

export interface IssueCouponRequest {
  title: string;
  description: string;
  type: 'Percent' | 'Flat' | 'Bogo' | 'Birthday' | 'Referral';
  value: number;
  minOrderValue: number;
  expiresAt: string;
  customerId?: number;
}

export interface IssueGiftCardRequest {
  amount: number;
  customerId?: number;
  purchasedBy?: string;
  validDays?: number;
}

export interface CrmGrowthPoint {
  day: string;
  newCustomers: number;
  returningCustomers: number;
}

export interface CrmRedemption {
  title: string;
  issued: number;
  redeemed: number;
  pct: number;
}

export interface CrmSegment {
  name: string;
  description: string;
  customerCount: number;
  avgSpent: number;
  tags: string[];
}

export interface CrmInsights {
  retentionRatePct: number;
  avgLifetimeValue: number;
  growth: CrmGrowthPoint[];
  redemption: CrmRedemption[];
  segments: CrmSegment[];
  /** Up to 2 rule-matched tips against the real segment data above — no AI involved. Empty if there's no customer data yet. */
  suggestions: string[];
}

export const customersApi = {
  list: (params?: { search?: string; page?: number; pageSize?: number }) =>
    apiClient.get<PagedResult<CustomerSummary>>('/customers', { params }).then((r) => r.data),
  get: (id: number) => apiClient.get<CustomerDetail>(`/customers/${id}`).then((r) => r.data),
  create: (req: CreateCustomerRequest) => apiClient.post<CustomerSummary>('/customers', req).then((r) => r.data),
  update: (id: number, req: UpdateCustomerRequest) => apiClient.patch<CustomerSummary>(`/customers/${id}`, req).then((r) => r.data),
  redeemPoints: (id: number, points: number, reason?: string) =>
    apiClient.post<CustomerSummary>(`/customers/${id}/points/redeem`, { points, reason }).then((r) => r.data),
  addPoints: (id: number, points: number, reason?: string) =>
    apiClient.post<CustomerSummary>(`/customers/${id}/points/add`, { points, reason }).then((r) => r.data),
  issueCoupon: (id: number, req: IssueCouponRequest) => apiClient.post<Coupon>(`/customers/${id}/coupons`, req).then((r) => r.data),
  applyCoupon: (code: string, orderSubtotal: number) =>
    apiClient
      .post<{ valid: boolean; error: string | null; discountAmount: number }>('/customers/coupons/apply', { code, orderSubtotal })
      .then((r) => r.data),
  redeemCoupon: (couponId: number) => apiClient.post<void>(`/customers/coupons/${couponId}/redeem`).then((r) => r.data),
  issueGiftCard: (req: IssueGiftCardRequest) => apiClient.post<GiftCard>('/customers/gift-cards', req).then((r) => r.data),
  redeemGiftCard: (code: string, amount: number) =>
    apiClient.post<GiftCard>('/customers/gift-cards/redeem', { code, amount }).then((r) => r.data),
  /** Validate-only — used by POS checkout to preview a gift card before the order is
   * placed. The actual balance debit happens server-side at order creation. */
  checkGiftCard: (code: string) =>
    apiClient.post<{ valid: boolean; error: string | null; balance: number }>('/customers/gift-cards/check', { code }).then((r) => r.data),
  insights: () => apiClient.get<CrmInsights>('/customers/insights').then((r) => r.data),
};
