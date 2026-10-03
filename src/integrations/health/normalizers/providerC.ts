import { gramsToKg, secondsToMinutes } from '@/domain/measurement/units';
import type { Normalizer } from '../HealthProvider';
import {
  isNonEmptyString,
  isNonNegativeNumber,
  isObject,
  isPositiveNumber,
} from './guards';

/**
 * Provider C ("ScaleCo"): the metric is implied by which field is present.
 * Weight in grams, sleep in seconds, timestamps in epoch milliseconds.
 *
 *   { record_id: "sc-1", body_weight: 72570, measured_ms: 1790148600000 }
 *   { record_id: "sc-2", sleep_seconds: 27000, measured_ms: 1790148600000 }
 */
export const normalizeProviderC: Normalizer = raw => {
  if (
    !isObject(raw) ||
    !isNonEmptyString(raw.record_id) ||
    !isPositiveNumber(raw.measured_ms)
  ) {
    return null;
  }
  const base = { measuredAt: raw.measured_ms, externalId: raw.record_id };

  if (isPositiveNumber(raw.body_weight)) {
    return { ...base, metric: 'weight', value: gramsToKg(raw.body_weight) };
  }
  if (isNonNegativeNumber(raw.sleep_seconds)) {
    return {
      ...base,
      metric: 'sleep',
      value: secondsToMinutes(raw.sleep_seconds),
    };
  }
  if (isNonNegativeNumber(raw.steps_total)) {
    return { ...base, metric: 'steps', value: Math.round(raw.steps_total) };
  }
  return null;
};
