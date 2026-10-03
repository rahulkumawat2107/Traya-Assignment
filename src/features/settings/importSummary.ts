import type { ImportReport } from '@/integrations/health/HealthImportService';
import type { HealthProvider } from '@/integrations/health/HealthProvider';

function outcome(report: ImportReport): string {
  if (report.failure) {
    switch (report.failure.kind) {
      case 'unavailable':
        return 'not available';
      case 'permission_denied':
        return 'access not granted';
      case 'failed':
        return `failed (${report.failure.message})`;
    }
  }
  const stored = report.imported + report.updated;
  const rejected = report.rejected > 0 ? `, ${report.rejected} unreadable` : '';
  return stored > 0 ? `${stored} new${rejected}` : `nothing new${rejected}`;
}

/**
 * What an import across all providers did, one clause per provider, e.g.
 * "Imported 150 readings. FitBand: 150 new, 1 unreadable · ScaleCo: not available".
 */
export function describeImportReports(
  reports: ImportReport[],
  providers: Pick<HealthProvider, 'id' | 'name'>[],
): string {
  const total = reports.reduce((sum, r) => sum + r.imported + r.updated, 0);
  const details = reports
    .map(report => {
      const name =
        providers.find(p => p.id === report.providerId)?.name ??
        report.providerId;
      return `${name}: ${outcome(report)}`;
    })
    .join(' · ');
  const headline =
    total > 0
      ? `Imported ${total} ${total === 1 ? 'reading' : 'readings'}.`
      : 'Nothing new to import.';
  return `${headline} ${details}`;
}
