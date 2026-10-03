import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useServices } from '@/app/providers/ServicesProvider';
import { queryKeys } from '@/app/queryClient';
import type { HistoryCursor } from '@/data/repositories/MeasurementRepository';
import type { Measurement, MetricType } from '@/domain/measurement/types';

export const HISTORY_PAGE_SIZE = 30;

/**
 * History, newest first, loaded a page at a time as the user scrolls.
 * Only the pages scrolled to are ever in memory.
 */
export function useMeasurementHistory(metric: MetricType) {
  const { measurements } = useServices();

  const query = useInfiniteQuery({
    queryKey: queryKeys.history(metric),
    queryFn: ({ pageParam }) =>
      measurements.getHistoryPage(metric, HISTORY_PAGE_SIZE, pageParam),
    initialPageParam: null as HistoryCursor | null,
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
  });

  const items = useMemo<Measurement[]>(
    () => query.data?.pages.flatMap(page => page.items) ?? [],
    [query.data],
  );

  return { ...query, items };
}
