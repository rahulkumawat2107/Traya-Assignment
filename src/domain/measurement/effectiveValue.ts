import { compareHlc } from '@/domain/sync/hlc';
import { isManual, type Measurement } from './types';

type Reading = Pick<
  Measurement,
  'value' | 'measuredAt' | 'source' | 'hlc' | 'deletedAt'
>;

/**
 * Decides which reading represents a day when several exist.
 *
 * This is a display rule, deliberately separate from sync conflict
 * resolution: a manual entry and a device reading are different records, so
 * they never conflict at the record level. Both are kept; this only chooses
 * which one the dashboard shows.
 *
 *   1. Deleted readings never count.
 *   2. A manual reading beats any device reading: typing a value is a
 *      deliberate statement by the user, a sensor reading is passive.
 *   3. Within the same kind, the most recently measured wins; the HLC breaks
 *      exact ties so the answer is the same on every device.
 *
 * The same rule is implemented in SQL by MeasurementRepository.getSeries.
 */
export function pickEffectiveReading<T extends Reading>(
  readings: readonly T[],
): T | undefined {
  let best: T | undefined;
  for (const reading of readings) {
    if (reading.deletedAt !== null) {
      continue;
    }
    if (!best || outranks(reading, best)) {
      best = reading;
    }
  }
  return best;
}

function outranks(candidate: Reading, current: Reading): boolean {
  const candidateManual = isManual(candidate.source);
  const currentManual = isManual(current.source);
  if (candidateManual !== currentManual) {
    return candidateManual;
  }
  if (candidate.measuredAt !== current.measuredAt) {
    return candidate.measuredAt > current.measuredAt;
  }
  return compareHlc(candidate.hlc, current.hlc) > 0;
}
