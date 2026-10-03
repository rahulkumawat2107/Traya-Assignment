import type { MetricType } from '@/domain/measurement/types';
import type { Normalizer } from '../HealthProvider';
import { isNonEmptyString, isNonNegativeNumber, isObject } from './guards';

/**
 * Provider A ("FitBand"): one flat record per reading, already metric,
 * ISO-8601 timestamps.
 *
 *   { uid: "fb-1", type: "weight_kg", value: 72.57, timestamp: "2026-09-21T07:30:00.000Z" }
 */
const TYPE_TO_METRIC: Record<string, MetricType> = {
  weight_kg: 'weight',
  step_count: 'steps',
  sleep_minutes: 'sleep',
  water_ml: 'water',
  workout_minutes: 'workout',
};

export const normalizeProviderA: Normalizer = raw => {
  if (
    !isObject(raw) ||
    !isNonEmptyString(raw.uid) ||
    !isNonEmptyString(raw.type) ||
    !isNonNegativeNumber(raw.value) ||
    !isNonEmptyString(raw.timestamp)
  ) {
    return null;
  }
  const metric = TYPE_TO_METRIC[raw.type];
  const measuredAt = Date.parse(raw.timestamp);
  if (!metric || Number.isNaN(measuredAt)) {
    return null;
  }
  if (metric === 'weight' && raw.value === 0) {
    return null;
  }
  return { metric, value: raw.value, measuredAt, externalId: raw.uid };
};
