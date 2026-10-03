import { QueryClient } from '@tanstack/react-query';
import { NetworkConditionsController } from '@/api/mock/networkConditions';
import type { AppServices } from '@/app/services';
import { HealthImportService } from '@/integrations/health/HealthImportService';
import { createHealthRegistry } from '@/integrations/health/registry';
import { SyncEngine } from '@/sync/SyncEngine';
import { createTestRepos } from './createTestRepos';
import { FakeApiClient } from './fakes/FakeApiClient';
import { FakeNetworkMonitor } from './fakes/FakeNetworkMonitor';

/** The same services the app uses, on an in-memory database and fake network. */
export async function createTestServices() {
  const repos = await createTestRepos();
  const api = new FakeApiClient();
  const network = new FakeNetworkMonitor(true);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'always',
        staleTime: Infinity,
        retry: false,
        gcTime: Infinity,
      },
      mutations: { networkMode: 'always', retry: false, gcTime: Infinity },
    },
  });
  const engine = new SyncEngine({
    db: repos.db,
    outbox: repos.outbox,
    measurements: repos.measurements,
    syncState: repos.syncState,
    api,
    network,
    clock: repos.clock,
  });
  const registry = createHealthRegistry();
  const nudgeSync = jest.fn();
  const services: AppServices = {
    measurements: repos.measurements,
    goals: repos.goals,
    outbox: repos.outbox,
    engine,
    healthImport: new HealthImportService({
      providers: registry.providers,
      measurements: repos.measurements,
      syncState: repos.syncState,
      clock: repos.clock,
    }),
    queryClient,
    clock: repos.clock,
    nudgeSync,
    debug: {
      conditions: new NetworkConditionsController(),
      server: api.server,
      healthSimulation: registry.simulation,
    },
  };
  return { services, repos, api, network, nudgeSync };
}
