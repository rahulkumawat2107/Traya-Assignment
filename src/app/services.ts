import type { QueryClient } from '@tanstack/react-query';
import type { MockServer } from '@/api/mock/MockServer';
import type { NetworkConditionsController } from '@/api/mock/networkConditions';
import type { GoalRepository } from '@/data/repositories/GoalRepository';
import type { MeasurementRepository } from '@/data/repositories/MeasurementRepository';
import type { OutboxRepository } from '@/data/repositories/OutboxRepository';
import type { HealthImportService } from '@/integrations/health/HealthImportService';
import type { HealthRegistry } from '@/integrations/health/registry';
import type { Clock } from '@/shared/services/Clock';
import type { SyncEngine } from '@/sync/SyncEngine';

/**
 * Everything the UI is allowed to reach. Built once by `bootstrap` and
 * handed down through context, so screens never construct or import a
 * concrete database, API client or provider.
 */
export interface AppServices {
  measurements: MeasurementRepository;
  goals: GoalRepository;
  outbox: OutboxRepository;
  engine: SyncEngine;
  healthImport: HealthImportService;
  queryClient: QueryClient;
  clock: Clock;
  /** Call after a local write; schedules a debounced sync. */
  nudgeSync: () => void;
  /** Development tooling: only the debug screen uses these. */
  debug: {
    conditions: NetworkConditionsController;
    server: MockServer;
    healthSimulation: HealthRegistry['simulation'];
  };
}
