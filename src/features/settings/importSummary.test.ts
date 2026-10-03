import type { ImportReport } from '@/integrations/health/HealthImportService';
import { describeImportReports } from './importSummary';

const providers = [
  { id: 'fitband', name: 'FitBand' },
  { id: 'pulse', name: 'Pulse Health' },
  { id: 'scaleco', name: 'ScaleCo' },
];

const report = (
  providerId: string,
  patch: Partial<ImportReport> = {},
): ImportReport => ({
  providerId,
  imported: 0,
  updated: 0,
  skipped: 0,
  rejected: 0,
  failure: null,
  ...patch,
});

describe('describeImportReports', () => {
  it('lists what each provider contributed, including the ones that failed', () => {
    expect(
      describeImportReports(
        [
          report('fitband', { imported: 150, rejected: 1 }),
          report('pulse', {
            failure: { kind: 'permission_denied', message: 'x' },
          }),
          report('scaleco', { failure: { kind: 'unavailable', message: 'x' } }),
        ],
        providers,
      ),
    ).toBe(
      'Imported 150 readings. FitBand: 150 new, 1 unreadable · Pulse Health: access not granted · ScaleCo: not available',
    );
  });

  it('says so when a repeat import finds nothing new', () => {
    expect(
      describeImportReports([report('fitband', { skipped: 150 })], providers),
    ).toBe('Nothing new to import. FitBand: nothing new');
  });

  it('includes the reason when a provider fails outright', () => {
    expect(
      describeImportReports(
        [
          report('pulse', {
            failure: { kind: 'failed', message: 'Provider timed out' },
          }),
        ],
        providers,
      ),
    ).toBe('Nothing new to import. Pulse Health: failed (Provider timed out)');
  });

  it('falls back to the id for an unknown provider and uses the singular', () => {
    expect(
      describeImportReports([report('other', { imported: 1 })], providers),
    ).toBe('Imported 1 reading. other: 1 new');
  });
});
