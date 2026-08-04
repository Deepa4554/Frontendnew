import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { dashboardApi, AnalyticsRange } from '../dashboardApi';
import { queryKeys } from './queryKeys';

export const useDashboardAnalytics = (range: AnalyticsRange = { days: 7 }) =>
  useQuery({
    queryKey: queryKeys.dashboard(range),
    queryFn: () => dashboardApi.analytics(range),
    // Switching the date range changes the query key; without this the screen
    // drops back to the skeleton loader (wiping scroll/carousel position) on
    // every range change instead of just updating the numbers in place.
    placeholderData: keepPreviousData,
  });

export const useSalesForecast = (forecastDays = 7) =>
  useQuery({ queryKey: queryKeys.salesForecast(forecastDays), queryFn: () => dashboardApi.forecast(forecastDays) });
