import { useMutation } from '@tanstack/react-query';
import { useServices } from '@/app/providers/ServicesProvider';
import { MEASUREMENTS_KEY } from '@/app/queryClient';
import { ML_PER_GLASS } from '@/domain/measurement/format';
import { deviceTzOffsetMs } from '@/domain/measurement/range';

/** Upper bound on a day's water, to catch a stuck button rather than a thirst. */
export const MAX_GLASSES_PER_DAY = 40;

/**
 * Adds or removes glasses from today's water. Like every other write it
 * commits locally and syncs later, so it works offline.
 */
export function useWaterIntake() {
  const { measurements, queryClient, engine, nudgeSync, clock } = useServices();

  return useMutation({
    mutationFn: (glasses: number) =>
      measurements.adjustDailyTotal(
        'water',
        glasses * ML_PER_GLASS,
        clock.now(),
        deviceTzOffsetMs(),
        MAX_GLASSES_PER_DAY * ML_PER_GLASS,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MEASUREMENTS_KEY });
      engine.refreshCounts().catch(() => undefined);
      nudgeSync();
    },
  });
}
