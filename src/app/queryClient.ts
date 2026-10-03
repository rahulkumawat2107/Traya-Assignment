import { QueryClient } from '@tanstack/react-query';

/**
 * Queries here read the local database, not the network. They are never
 * stale on their own - writes and sync runs invalidate them explicitly - and
 * must run regardless of connectivity.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'always',
        staleTime: Infinity,
        retry: false,
      },
      mutations: {
        networkMode: 'always',
        retry: false,
      },
    },
  });
}

export const queryKeys = {
  history: (metric: string) => ['measurements', 'history', metric] as const,
  series: (metric: string, range: string) =>
    ['measurements', 'series', metric, range] as const,
  latest: (metric: string) => ['measurements', 'latest', metric] as const,
  today: (dayIndex: number) => ['measurements', 'today', dayIndex] as const,
  count: () => ['measurements', 'count'] as const,
  detail: (id: string) => ['measurements', 'detail', id] as const,
  goal: (metric: string) => ['goals', metric] as const,
  goals: () => ['goals'] as const,
  outbox: () => ['outbox'] as const,
};

/** Everything derived from measurement rows. */
export const MEASUREMENTS_KEY = ['measurements'] as const;
