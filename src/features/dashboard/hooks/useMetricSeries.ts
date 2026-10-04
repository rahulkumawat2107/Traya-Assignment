import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/app/providers/ServicesProvider';
import { queryKeys } from '@/app/queryClient';
import { deviceTzOffsetMs, seriesWindow } from '@/domain/measurement/range';
import type { HistoryRange, MetricType } from '@/domain/measurement/types';

/**
 * Bucketed values for a metric over a range, plus the window they belong to
 * (the chart needs it to place buckets that have no data). Aggregated in
 * SQL; at most ~30 points reach JS.
 */
export function useMetricSeries(metric: MetricType, range: HistoryRange) {
  const { measurements, clock } = useServices();
  return useQuery({
    queryKey: queryKeys.series(metric, range),
    queryFn: async () => {
      const window = seriesWindow(range, clock.now(), deviceTzOffsetMs());
      return { window, points: await measurements.getSeries(metric, window) };
    },
  });
}
