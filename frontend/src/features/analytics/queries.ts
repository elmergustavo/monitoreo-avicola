import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AnalyticsCompare,
  AnalyticsHeatmap,
  AnalyticsIrrigation,
  AnalyticsRanges,
  AnalyticsSeries,
  AnalyticsSummary,
} from './types';

export interface AnalyticsParams {
  deviceId: string;
  from: string;
  to: string;
}

interface Endpoints {
  summary: AnalyticsSummary;
  series: AnalyticsSeries;
  heatmap: AnalyticsHeatmap;
  ranges: AnalyticsRanges;
  irrigation: AnalyticsIrrigation;
  compare: AnalyticsCompare;
}

/**
 * One query per chart. While new filters load, the previous data stays on
 * screen (dimmed by the caller) instead of flashing skeletons.
 */
export function useAnalytics<K extends keyof Endpoints>(endpoint: K, params: AnalyticsParams | null) {
  return useQuery({
    queryKey: ['analytics', endpoint, params],
    queryFn: () => api<Endpoints[K]>(`/analytics/${endpoint}`, { query: { ...params! } }),
    enabled: params !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
