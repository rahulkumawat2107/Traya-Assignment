import type { ImportedReading } from '@/data/repositories/MeasurementRepository';
import { DAY_MS } from '@/domain/measurement/range';

export const SEED_SOURCE = 'provider:seed';

function noise(day: number, salt: number): number {
  const x = Math.sin(day * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Several years of daily weight, steps and sleep, for checking that lists
 * and summaries stay responsive on a realistic data volume. Deterministic,
 * so running it twice inserts nothing new.
 */
export function generateSeedReadings(
  now: number,
  years = 3,
): ImportedReading[] {
  const days = Math.round(years * 365);
  const readings: ImportedReading[] = [];

  for (let daysAgo = days; daysAgo >= 1; daysAgo--) {
    const dayStart = now - daysAgo * DAY_MS;
    const dayNumber = Math.floor(dayStart / DAY_MS);
    const key = String(dayNumber);
    // From ~82 kg three years ago down to ~73 kg, with daily wobble.
    const weight =
      73 + (daysAgo / days) * 9 + (noise(dayNumber, 1) - 0.5) * 0.8;

    readings.push(
      {
        metric: 'weight',
        value: Math.round(weight * 10) / 10,
        measuredAt: dayStart,
        source: SEED_SOURCE,
        externalId: `w-${key}`,
      },
      {
        metric: 'steps',
        value: 3000 + Math.round(noise(dayNumber, 2) * 9000),
        measuredAt: dayStart + 12 * 3_600_000,
        source: SEED_SOURCE,
        externalId: `s-${key}`,
      },
      {
        metric: 'sleep',
        value: 330 + Math.round(noise(dayNumber, 3) * 180),
        measuredAt: dayStart,
        source: SEED_SOURCE,
        externalId: `z-${key}`,
      },
    );
  }
  return readings;
}
