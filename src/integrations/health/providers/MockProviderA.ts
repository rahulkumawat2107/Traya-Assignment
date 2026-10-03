import {
  normalizeAll,
  type HealthProvider,
  type ProviderAvailability,
  type ProviderReadResult,
  type TimeRange,
} from '../HealthProvider';
import { normalizeProviderA } from '../normalizers/providerA';
import { mockDays } from './mockData';

/** Raw payload in Provider A's wire format. Exported for normalizer tests. */
export function providerAPayload(range: TimeRange): unknown[] {
  const records: unknown[] = [];
  for (const day of mockDays(range)) {
    records.push(
      {
        uid: `fb-w-${day.key}`,
        type: 'weight_kg',
        value: day.weightKg,
        timestamp: new Date(day.morning).toISOString(),
      },
      {
        uid: `fb-s-${day.key}`,
        type: 'step_count',
        value: day.steps,
        timestamp: new Date(day.evening).toISOString(),
      },
      {
        uid: `fb-z-${day.key}`,
        type: 'sleep_minutes',
        value: day.sleepMinutes,
        timestamp: new Date(day.morning).toISOString(),
      },
    );
  }
  // Real feeds contain junk; one unusable record shows it is tolerated.
  records.push({
    uid: 'fb-broken',
    type: 'weight_kg',
    value: null,
    timestamp: 'n/a',
  });
  return records;
}

export class MockProviderA implements HealthProvider {
  readonly id = 'fitband';
  readonly name = 'FitBand';
  readonly description = 'Wearable: weight, steps and sleep';

  async isAvailable(): Promise<ProviderAvailability> {
    return { available: true };
  }

  async requestPermission(): Promise<boolean> {
    return true;
  }

  async read(range: TimeRange): Promise<ProviderReadResult> {
    return normalizeAll(providerAPayload(range), normalizeProviderA);
  }
}
