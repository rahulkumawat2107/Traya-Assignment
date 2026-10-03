import {
  normalizeAll,
  type HealthProvider,
  type ProviderAvailability,
  type ProviderReadResult,
  type TimeRange,
} from '../HealthProvider';
import { normalizeProviderC } from '../normalizers/providerC';
import { mockDays } from './mockData';

/** Raw payload in Provider C's wire format. Exported for normalizer tests. */
export function providerCPayload(range: TimeRange): unknown[] {
  const records: unknown[] = [];
  for (const day of mockDays(range)) {
    records.push(
      {
        record_id: `sc-w-${day.key}`,
        body_weight: Math.round(day.weightKg * 1000),
        measured_ms: day.morning,
      },
      {
        record_id: `sc-z-${day.key}`,
        sleep_seconds: day.sleepMinutes * 60,
        measured_ms: day.morning,
      },
    );
  }
  return records;
}

/**
 * Simulates a source that is not present on the device (companion app not
 * installed) until `setInstalled(true)` is called from the debug screen.
 */
export class MockProviderC implements HealthProvider {
  readonly id = 'scaleco';
  readonly name = 'ScaleCo';
  readonly description = 'Smart scale: weight (g) and sleep';

  private installed = false;

  setInstalled(installed: boolean): void {
    this.installed = installed;
  }

  isInstalled(): boolean {
    return this.installed;
  }

  async isAvailable(): Promise<ProviderAvailability> {
    return this.installed
      ? { available: true }
      : {
          available: false,
          reason: 'The ScaleCo app is not installed on this device.',
        };
  }

  async requestPermission(): Promise<boolean> {
    return true;
  }

  async read(range: TimeRange): Promise<ProviderReadResult> {
    if (!this.installed) {
      throw new Error('ScaleCo is unavailable');
    }
    return normalizeAll(providerCPayload(range), normalizeProviderC);
  }
}
