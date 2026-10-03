import { useMutation } from '@tanstack/react-query';
import { useServices } from '@/app/providers/ServicesProvider';
import { IMPORTS_KEY, MEASUREMENTS_KEY } from '@/app/queryClient';
import type { ImportReport } from '@/integrations/health/HealthImportService';

/** One line telling the user what an import across all sources did. */
export function describeImportAll(reports: ImportReport[]): string {
  const stored = reports.reduce((sum, r) => sum + r.imported + r.updated, 0);
  const succeeded = reports.filter(r => r.failure === null).length;
  const skipped = reports.length - succeeded;

  if (succeeded === 0) {
    return 'No source could be read. Open Sources to see why.';
  }
  const result =
    stored > 0
      ? `Imported ${stored} ${stored === 1 ? 'reading' : 'readings'}.`
      : 'Already up to date.';
  return skipped > 0
    ? `${result} ${skipped} ${
        skipped === 1 ? 'source was' : 'sources were'
      } not available. Open Sources to see why.`
    : result;
}

/** Imports from every health source in one tap. */
export function useImportAll() {
  const { healthImport, queryClient, engine } = useServices();

  return useMutation({
    mutationFn: () => healthImport.importAll(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MEASUREMENTS_KEY }),
        queryClient.invalidateQueries({ queryKey: IMPORTS_KEY }),
      ]);
      engine.refreshCounts().catch(() => undefined);
    },
  });
}
