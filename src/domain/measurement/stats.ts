import type { SeriesPoint } from './types';

export interface RangeSummary {
  latest: number;
  average: number;
  min: number;
  max: number;
  /** Latest minus earliest value in the range; 0 for a single point. */
  change: number;
  count: number;
}

/** `points` must be ordered oldest first. Returns null when there is no data. */
export function summarize(points: readonly SeriesPoint[]): RangeSummary | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return null;
  }
  let sum = 0;
  let min = first.value;
  let max = first.value;
  for (const point of points) {
    sum += point.value;
    min = Math.min(min, point.value);
    max = Math.max(max, point.value);
  }
  return {
    latest: last.value,
    average: sum / points.length,
    min,
    max,
    change: last.value - first.value,
    count: points.length,
  };
}

export type Trend = 'up' | 'down' | 'flat';

export function trendOf(change: number, tolerance = 0.05): Trend {
  if (Math.abs(change) <= tolerance) {
    return 'flat';
  }
  return change > 0 ? 'up' : 'down';
}
