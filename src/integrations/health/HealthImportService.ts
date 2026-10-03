import type { MeasurementRepository } from '@/data/repositories/MeasurementRepository';
import type { SyncStateRepository } from '@/data/repositories/SyncStateRepository';
import { DAY_MS } from '@/domain/measurement/range';
import { errorMessage } from '@/domain/errors';
import type { Source } from '@/domain/measurement/types';
import type { Clock } from '@/shared/services/Clock';
import type { HealthProvider, TimeRange } from './HealthProvider';

export type ImportFailure =
  | { kind: 'unavailable'; message: string }
  | { kind: 'permission_denied'; message: string }
  | { kind: 'failed'; message: string };

export interface ImportReport {
  providerId: string;
  /** New readings stored. */
  imported: number;
  /** Existing readings the provider had corrected. */
  updated: number;
  /** Readings already present and unchanged. */
  skipped: number;
  /** Provider records that could not be understood. */
  rejected: number;
  failure: ImportFailure | null;
}

export interface HealthImportDeps {
  providers: HealthProvider[];
  measurements: MeasurementRepository;
  syncState: SyncStateRepository;
  clock: Clock;
  /** Called after an import stored something, to trigger a sync. */
  onImported?: () => void;
}

const DEFAULT_LOOKBACK_DAYS = 30;

/**
 * Provider -> normalized readings -> local database.
 *
 * Imported readings go through the same repository write path as manual
 * entries, so they are persisted offline and synced like anything else.
 */
export class HealthImportService {
  constructor(private readonly deps: HealthImportDeps) {}

  listProviders(): HealthProvider[] {
    return this.deps.providers;
  }

  async getLastImportAt(providerId: string): Promise<number | null> {
    const value = await this.deps.syncState.get(`import_at:${providerId}`);
    return value === null ? null : Number(value);
  }

  /**
   * Imports from every provider, one after another. A provider that is
   * unavailable or declines does not stop the others; each gets its own
   * report.
   */
  async importAll(range?: TimeRange): Promise<ImportReport[]> {
    const reports: ImportReport[] = [];
    for (const provider of this.deps.providers) {
      reports.push(await this.importFrom(provider.id, range));
    }
    return reports;
  }

  async importFrom(
    providerId: string,
    range?: TimeRange,
  ): Promise<ImportReport> {
    const report: ImportReport = {
      providerId,
      imported: 0,
      updated: 0,
      skipped: 0,
      rejected: 0,
      failure: null,
    };
    const provider = this.deps.providers.find(p => p.id === providerId);
    if (!provider) {
      return fail(report, 'failed', `Unknown provider: ${providerId}`);
    }

    try {
      const availability = await provider.isAvailable();
      if (!availability.available) {
        return fail(report, 'unavailable', availability.reason);
      }
      if (!(await provider.requestPermission())) {
        return fail(
          report,
          'permission_denied',
          `${provider.name} did not grant access to health data.`,
        );
      }

      const now = this.deps.clock.now();
      const window = range ?? {
        from: now - DEFAULT_LOOKBACK_DAYS * DAY_MS,
        to: now,
      };
      const result = await provider.read(window);
      report.rejected = result.rejected;

      const source: Source = `provider:${provider.id}`;
      for (const reading of result.readings) {
        const outcome = await this.deps.measurements.upsertImported({
          ...reading,
          source,
        });
        report[outcome] += 1;
      }

      await this.deps.syncState.set(`import_at:${provider.id}`, String(now));
      if (report.imported > 0 || report.updated > 0) {
        this.deps.onImported?.();
      }
      return report;
    } catch (error) {
      // Readings stored before the failure stay stored; a retry skips them.
      return fail(report, 'failed', errorMessage(error));
    }
  }
}

function fail(
  report: ImportReport,
  kind: ImportFailure['kind'],
  message: string,
): ImportReport {
  return { ...report, failure: { kind, message } };
}
