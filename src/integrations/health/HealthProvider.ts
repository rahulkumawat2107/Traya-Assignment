import type { MetricType } from '@/domain/measurement/types';

/**
 * A reading in the app's own vocabulary: canonical metric name, canonical
 * unit, epoch milliseconds. Nothing beyond this file's types leaves the
 * integration layer, so the rest of the app cannot tell which provider a
 * reading came from, or whether that provider is real or mocked.
 */
export interface NormalizedReading {
  metric: MetricType;
  value: number;
  measuredAt: number;
  /** The provider's stable id for this reading; makes re-imports idempotent. */
  externalId: string;
}

export type ProviderAvailability =
  | { available: true }
  | { available: false; reason: string };

export interface TimeRange {
  from: number;
  to: number;
}

export interface ProviderReadResult {
  readings: NormalizedReading[];
  /** Records the provider returned that could not be understood. */
  rejected: number;
}

/**
 * What every health data source must offer. A real adapter for HealthKit or
 * Health Connect implements this same interface; see registry.ts.
 */
export interface HealthProvider {
  /** Stable identifier, used in `source` as `provider:<id>`. */
  readonly id: string;
  /** Name shown to the user. */
  readonly name: string;
  readonly description: string;
  /** Whether the source exists on this device at all. */
  isAvailable(): Promise<ProviderAvailability>;
  /** Asks the user for read access. Resolves false if they decline. */
  requestPermission(): Promise<boolean>;
  read(range: TimeRange): Promise<ProviderReadResult>;
}

/** Turns one raw provider record into a reading, or null if it is unusable. */
export type Normalizer = (raw: unknown) => NormalizedReading | null;

/** Applies a normalizer to a raw payload, counting what had to be dropped. */
export function normalizeAll(
  rawRecords: readonly unknown[],
  normalize: Normalizer,
): ProviderReadResult {
  const readings: NormalizedReading[] = [];
  let rejected = 0;
  for (const raw of rawRecords) {
    const reading = normalize(raw);
    if (reading) {
      readings.push(reading);
    } else {
      rejected += 1;
    }
  }
  return { readings, rejected };
}
