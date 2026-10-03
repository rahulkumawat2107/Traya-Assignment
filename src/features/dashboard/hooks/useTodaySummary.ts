import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/app/providers/ServicesProvider';
import { queryKeys } from '@/app/queryClient';
import {
  computeGoalProgress,
  type Goal,
  type GoalProgress,
} from '@/domain/goals/goalProgress';
import { deviceTzOffsetMs, localDayIndex } from '@/domain/measurement/range';
import {
  METRIC_TYPES,
  type Measurement,
  type MetricType,
} from '@/domain/measurement/types';

export interface TodayMetric {
  metric: MetricType;
  /** 0 until something is recorded today. */
  value: number;
  /** Today's reading behind the value; null when there is none. */
  reading: Measurement | null;
  goal: Goal | null;
  /** Null until there is a reading: no data is not "0% of the way there". */
  progress: GoalProgress | null;
}

/**
 * Today's value for every metric, for the dashboard grid.
 *
 * Every card, weight included, is zero until something is recorded today
 * and resets when the date changes. Earlier readings are on the metric's
 * detail screen.
 */
export function useTodaySummary() {
  const { measurements, goals, clock } = useServices();
  const tzOffsetMs = deviceTzOffsetMs();
  // Part of the key, so the grid resets when the date changes.
  const dayIndex = localDayIndex(clock.now(), tzOffsetMs);

  const today = useQuery({
    queryKey: queryKeys.today(dayIndex),
    queryFn: () => measurements.getToday(clock.now(), tzOffsetMs),
  });
  const goalList = useQuery({
    queryKey: queryKeys.goals(),
    queryFn: () => goals.getAll(),
  });

  const metrics = useMemo<TodayMetric[]>(() => {
    const readings = today.data ?? {};
    return METRIC_TYPES.map(metric => {
      const reading = readings[metric] ?? null;
      const goal = goalList.data?.find(g => g.metric === metric) ?? null;
      return {
        metric,
        value: reading?.value ?? 0,
        reading,
        goal,
        progress:
          goal && reading ? computeGoalProgress(goal, reading.value) : null,
      };
    });
  }, [today.data, goalList.data]);

  return {
    metrics,
    /** True only before the first read; zeros are shown, not a spinner. */
    isPending: today.isPending,
    error: today.error,
    hasAnyData: metrics.some(m => m.reading !== null),
    refetch: today.refetch,
  };
}
