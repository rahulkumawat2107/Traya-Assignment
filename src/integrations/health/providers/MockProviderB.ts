import {
  normalizeAll,
  type HealthProvider,
  type ProviderAvailability,
  type ProviderReadResult,
  type TimeRange,
} from '../HealthProvider';
import { normalizeProviderB } from '../normalizers/providerB';
import { mockDays } from './mockData';

const KG_PER_LB = 0.45359237;
const ML_PER_FL_OZ = 29.5735;

/** Raw payload in Provider B's wire format. Exported for normalizer tests. */
export function providerBPayload(range: TimeRange): unknown[] {
  const records: unknown[] = [];
  for (const day of mockDays(range)) {
    records.push(
      {
        identifier: `ph-w-${day.key}`,
        dataType: 'weight',
        quantity: day.weightKg / KG_PER_LB,
        unit: 'lb',
        startDate: Math.floor(day.morning / 1000),
      },
      {
        identifier: `ph-s-${day.key}`,
        dataType: 'steps',
        quantity: day.steps,
        unit: 'count',
        startDate: Math.floor(day.evening / 1000),
      },
      {
        identifier: `ph-h-${day.key}`,
        dataType: 'water',
        quantity: day.waterMl / ML_PER_FL_OZ,
        unit: 'fl_oz',
        startDate: Math.floor(day.evening / 1000),
      },
    );
  }
  // A unit this app does not understand must be rejected, not guessed.
  records.push({
    identifier: 'ph-stone',
    dataType: 'weight',
    quantity: 11.4,
    unit: 'st',
    startDate: Math.floor(range.to / 1000) - 60,
  });
  return records;
}

/**
 * Simulates a permission prompt the user declines the first time and accepts
 * on a later attempt, so the "permission denied" state can be seen and
 * recovered from.
 */
export class MockProviderB implements HealthProvider {
  readonly id = 'pulse';
  readonly name = 'Pulse Health';
  readonly description =
    'Phone health store: weight (lb), steps, water (fl oz)';

  private permissionRequests = 0;

  async isAvailable(): Promise<ProviderAvailability> {
    return { available: true };
  }

  async requestPermission(): Promise<boolean> {
    this.permissionRequests += 1;
    return this.permissionRequests > 1;
  }

  async read(range: TimeRange): Promise<ProviderReadResult> {
    return normalizeAll(providerBPayload(range), normalizeProviderB);
  }
}
