import { useMutation, useQuery } from '@tanstack/react-query';
import { useServices } from '@/app/providers/ServicesProvider';
import { MEASUREMENTS_KEY, queryKeys } from '@/app/queryClient';

/** Import state for one provider: last import time plus the import action. */
export function useProviderImport(providerId: string) {
  const { healthImport, queryClient, engine } = useServices();

  const lastImportAt = useQuery({
    queryKey: queryKeys.lastImport(providerId),
    queryFn: () => healthImport.getLastImportAt(providerId),
  });

  const importNow = useMutation({
    mutationFn: () => healthImport.importFrom(providerId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MEASUREMENTS_KEY }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.lastImport(providerId),
        }),
      ]);
      engine.refreshCounts().catch(() => undefined);
    },
  });

  return { lastImportAt: lastImportAt.data ?? null, importNow };
}
