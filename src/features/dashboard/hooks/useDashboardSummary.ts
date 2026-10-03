import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/app/providers/ServicesProvider';
import { queryKeys } from '@/app/queryClient';
import { computeGoalProgress } from '@/domain/goals/goalProgress';
import { deviceTzOffsetMs } from '@/domain/measurement/range';
import { summarize } from '@/domain/measurement/stats';
import type { HistoryRange, MetricType } from '@/domain/measurement/types';
import { useMetricSeries } from './useMetricSeries';

/** Everything one dashboard card shows for a metric. */
export function useDashboardSummary(metric: MetricType, range: HistoryRange) {
  const { measurements, goals } = useServices();

  const series = useMetricSeries(metric, range);
  const latest = useQuery({
    queryKey: queryKeys.latest(metric),
    queryFn: () => measurements.getLatestEffective(metric, deviceTzOffsetMs()),
  });
  const goal = useQuery({
    queryKey: queryKeys.goal(metric),
    queryFn: () => goals.get(metric),
  });

  const summary = useMemo(() => summarize(series.data ?? []), [series.data]);
  const progress = useMemo(
    () =>
      goal.data && latest.data
        ? computeGoalProgress(goal.data, latest.data.value)
        : null,
    [goal.data, latest.data],
  );

  return {
    isPending: series.isPending || latest.isPending,
    error: series.error ?? latest.error ?? null,
    refetch: () => {
      series.refetch();
      latest.refetch();
    },
    /** The reading that represents the most recent day with data. */
    latest: latest.data ?? null,
    /** Null when the selected range has no data. */
    summary,
    goal: goal.data ?? null,
    progress,
  };
}
