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
  /** 0 when there is nothing to show yet. */
  value: number;
  /** The reading behind the value; null when there is none. */
  reading: Measurement | null;
  /** False when the value is carried over from an earlier day (weight only). */
  isToday: boolean;
  goal: Goal | null;
  /** Null until there is a reading: no data is not "0% of the way there". */
  progress: GoalProgress | null;
}

/**
 * Today's value for every metric, for the dashboard grid.
 *
 * Daily totals (steps, sleep, calories, water, workout) are zero until
 * something is recorded today. Weight is a state rather than a total, so
 * when it has not been measured today the most recent reading is shown and
 * flagged as carried over.
 */
export function useTodaySummary() {
  const { measurements, goals, clock } = useServices();
  const tzOffsetMs = deviceTzOffsetMs();
  // Part of the key, so the grid resets when the date changes.
  const dayIndex = localDayIndex(clock.now(), tzOffsetMs);

  const today = useQuery({
    queryKey: queryKeys.today(dayIndex),
    queryFn: async () => {
      const readings = await measurements.getToday(clock.now(), tzOffsetMs);
      const lastWeight = readings.weight
        ? null
        : await measurements.getLatestEffective('weight', tzOffsetMs);
      return { readings, lastWeight };
    },
  });
  const goalList = useQuery({
    queryKey: queryKeys.goals(),
    queryFn: () => goals.getAll(),
  });

  const metrics = useMemo<TodayMetric[]>(() => {
    const readings = today.data?.readings ?? {};
    return METRIC_TYPES.map(metric => {
      const todays = readings[metric] ?? null;
      const carried =
        metric === 'weight' ? today.data?.lastWeight ?? null : null;
      const reading = todays ?? carried;
      const goal = goalList.data?.find(g => g.metric === metric) ?? null;
      return {
        metric,
        value: reading?.value ?? 0,
        reading,
        isToday: todays !== null,
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
