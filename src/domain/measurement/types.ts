export type MetricType =
  | 'weight'
  | 'steps'
  | 'sleep'
  | 'calories'
  | 'water'
  | 'workout';

/** Also the order of the cards on the dashboard. */
export const METRIC_TYPES: readonly MetricType[] = [
  'weight',
  'steps',
  'sleep',
  'calories',
  'water',
  'workout',
];

/** Canonical storage unit per metric. Providers are converted to these on import. */
export const METRIC_UNIT: Record<MetricType, string> = {
  weight: 'kg',
  steps: 'steps',
  sleep: 'min',
  calories: 'kcal',
  water: 'ml',
  workout: 'min',
};

export const MANUAL_SOURCE = 'manual';
export type Source = typeof MANUAL_SOURCE | `provider:${string}`;

export type SyncStatus = 'synced' | 'pending' | 'failed';

export interface Measurement {
  id: string;
  userId: string;
  metric: MetricType;
  /** Value in the canonical unit for the metric. */
  value: number;
  /** When the reading was taken, ms since epoch. */
  measuredAt: number;
  source: Source;
  /** Provider's own record id; null for manual entries. */
  externalId: string | null;
  /** Serialized hybrid logical clock of the last modification. */
  hlc: string;
  /** Tombstone timestamp; null while the record is live. */
  deletedAt: number | null;
  syncStatus: SyncStatus;
}

export type HistoryRange = '7d' | '30d' | '3m';

export const RANGE_DAYS: Record<HistoryRange, number> = {
  '7d': 7,
  '30d': 30,
  '3m': 90,
};

/** Days per series bucket: daily for short ranges, weekly for 3 months. */
export const RANGE_BUCKET_DAYS: Record<HistoryRange, number> = {
  '7d': 1,
  '30d': 1,
  '3m': 7,
};

export interface SeriesPoint {
  /** Start of the bucket, ms since epoch (local midnight). */
  t: number;
  value: number;
}

export function isMetricType(value: unknown): value is MetricType {
  return (
    typeof value === 'string' && (METRIC_TYPES as string[]).includes(value)
  );
}

export function isManual(source: string): boolean {
  return source === MANUAL_SOURCE;
}
