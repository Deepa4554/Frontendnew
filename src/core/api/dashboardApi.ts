import { apiClient } from '../network/api';

export interface DailyRevenue {
  day: string;
  revenue: number;
}

export interface HourlyLoad {
  time: string;
  orderCount: number;
  pctOfPeak: number;
}

export interface TopItem {
  name: string;
  qty: number;
}

export interface DashboardAnalytics {
  revenue: number;
  previousPeriodRevenue: number;
  salesCount: number;
  avgOrderValue: number;
  inventoryValue: number;
  gstCollected: number;
  refundsTotal: number;
  weekly: DailyRevenue[];
  peakHours: HourlyLoad[];
  topItems: TopItem[];
  /** Calendar-day total (resets at midnight), independent of whatever `days` window was requested. */
  todayRevenue: number;
  todaySalesCount: number;
}

export interface ForecastPoint {
  date: string;
  predictedRevenue: number;
}

export interface SalesForecast {
  forecast: ForecastPoint[];
  /** e.g. "Linear trend (last 14 days)" or "Flat average (not enough order history yet)" — surfaced in the UI so it's honest about how the number was derived. */
  method: string;
}

/** Either a rolling window (`days`) or an explicit calendar range (`from`/`to`,
 * "yyyy-MM-dd") — the backend prefers from/to when either is present. */
export interface AnalyticsRange {
  days?: number;
  from?: string;
  to?: string;
  branchId?: number | null;
}

export const dashboardApi = {
  analytics: (range: AnalyticsRange = { days: 7 }) =>
    apiClient.get<DashboardAnalytics>('/dashboard/analytics', { params: range }).then((r) => r.data),
  forecast: (forecastDays = 7) => apiClient.get<SalesForecast>('/dashboard/forecast', { params: { forecastDays } }).then((r) => r.data),
};
