import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useServices } from '@/app/providers/ServicesProvider';
import { MEASUREMENTS_KEY } from '@/app/queryClient';

interface WeightInput {
  value: number;
  measuredAt: number;
}

/**
 * Add / edit / delete a weight. Each resolves as soon as the local
 * transaction commits; the network is never awaited, so these behave the
 * same online and offline.
 */
export function useMeasurementMutations() {
  const { measurements, queryClient, engine, nudgeSync } = useServices();

  const afterWrite = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: MEASUREMENTS_KEY });
    engine.refreshCounts().catch(() => undefined);
    nudgeSync();
  }, [queryClient, engine, nudgeSync]);

  const add = useMutation({
    mutationFn: (input: WeightInput) =>
      measurements.create({ metric: 'weight', ...input }),
    onSuccess: afterWrite,
  });

  const edit = useMutation({
    mutationFn: ({ id, ...patch }: WeightInput & { id: string }) =>
      measurements.update(id, patch),
    onSuccess: afterWrite,
  });

  const remove = useMutation({
    mutationFn: (id: string) => measurements.remove(id),
    onSuccess: afterWrite,
  });

  return { add, edit, remove };
}
