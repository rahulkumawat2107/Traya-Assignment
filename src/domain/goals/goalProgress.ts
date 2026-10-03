import type { MetricType } from '@/domain/measurement/types';

export type GoalDirection = 'decrease' | 'increase';

export interface Goal {
  metric: MetricType;
  startValue: number;
  targetValue: number;
  direction: GoalDirection;
}

export interface GoalProgress {
  /** 0..1, clamped. */
  fraction: number;
  /** Distance still to cover, never negative. */
  remaining: number;
  achieved: boolean;
}

/**
 * Progress from `startValue` towards `targetValue`.
 *
 * Works for "lose weight from 80 to 72" (decrease) and "walk 8000 steps a
 * day" (increase from 0). Moving away from the target reads as 0%, not as a
 * negative number.
 */
export function computeGoalProgress(goal: Goal, current: number): GoalProgress {
  const sign = goal.direction === 'decrease' ? -1 : 1;
  const total = (goal.targetValue - goal.startValue) * sign;
  const covered = (current - goal.startValue) * sign;
  const remaining = Math.max(0, (goal.targetValue - current) * sign);
  const achieved = remaining === 0;

  if (total <= 0) {
    // Degenerate goal (start already at or past the target).
    return { fraction: achieved ? 1 : 0, remaining, achieved };
  }
  const fraction = Math.min(1, Math.max(0, covered / total));
  return { fraction, remaining, achieved };
}
