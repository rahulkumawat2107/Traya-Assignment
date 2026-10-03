import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/app/providers/ServicesProvider';
import { queryKeys } from '@/app/queryClient';
import { deviceTzOffsetMs, seriesWindow } from '@/domain/measurement/range';
import type { HistoryRange, MetricType } from '@/domain/measurement/types';

/**
 * Bucketed values for a metric over a range. Aggregated in SQL; at most ~30
 * points reach JS. This is also the data source for the phase-2 chart.
 */
export function useMetricSeries(metric: MetricType, range: HistoryRange) {
  const { measurements, clock } = useServices();
  return useQuery({
    queryKey: queryKeys.series(metric, range),
    queryFn: () =>
      measurements.getSeries(
        metric,
        seriesWindow(range, clock.now(), deviceTzOffsetMs()),
      ),
  });
}
