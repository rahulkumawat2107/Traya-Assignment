import { AppState } from 'react-native';
import { MockApiClient } from '@/api/mock/MockApiClient';
import { MockServer, type MockServerStorage } from '@/api/mock/MockServer';
import { NetworkConditionsController } from '@/api/mock/networkConditions';
import { openDatabase } from '@/data/db/client';
import { migrate } from '@/data/db/migrate';
import type { SqlDriver } from '@/data/db/SqlDriver';
import { GoalRepository } from '@/data/repositories/GoalRepository';
import { MeasurementRepository } from '@/data/repositories/MeasurementRepository';
import { OutboxRepository } from '@/data/repositories/OutboxRepository';
import { SyncStateRepository } from '@/data/repositories/SyncStateRepository';
import { HlcClock } from '@/domain/sync/hlc';
import { HealthImportService } from '@/integrations/health/HealthImportService';
import { createHealthRegistry } from '@/integrations/health/registry';
import { systemClock } from '@/shared/services/Clock';
import { uuidGenerator } from '@/shared/services/IdGenerator';
import { NetInfoNetworkMonitor } from '@/shared/services/NetInfoNetworkMonitor';
import { SimulatedNetworkMonitor } from '@/shared/services/SimulatedNetworkMonitor';
import { reportSyncStatus } from '@/shared/state/syncStatusStore';
import { SyncEngine } from '@/sync/SyncEngine';
import { createSyncNudge, startSyncTriggers } from '@/sync/syncTriggers';
import { createQueryClient, MEASUREMENTS_KEY, queryKeys } from './queryClient';
import type { AppServices } from './services';

/** No authentication in this build: a single local user. */
const USER_ID = 'local-user';

/** The mock backend keeps its state in its own database file. */
async function createMockServerStorage(): Promise<MockServerStorage> {
  const db: SqlDriver = openDatabase('mock-server.db');
  await db.execute(
    'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
  );
  return {
    load: async () => {
      const result = await db.execute(
        "SELECT value FROM kv WHERE key = 'state'",
      );
      const value = result.rows[0]?.value;
      return typeof value === 'string' ? value : null;
    },
    save: async serialized => {
      await db.execute(
        `INSERT INTO kv (key, value) VALUES ('state', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [serialized],
      );
    },
  };
}

/**
 * Composition root. The only place that knows which concrete database, API
 * client and health providers the app runs on.
 */
export async function bootstrap(): Promise<AppServices> {
  const clock = systemClock;
  const ids = uuidGenerator;

  const db = openDatabase('health.db');
  await migrate(db);

  const syncState = new SyncStateRepository(db);
  const deviceId = await syncState.getOrCreateDeviceId(ids);
  const hlc = new HlcClock(clock, deviceId);
  const outbox = new OutboxRepository(db, ids, clock);
  const measurements = new MeasurementRepository({
    db,
    outbox,
    hlc,
    ids,
    clock,
    userId: USER_ID,
  });
  const goals = new GoalRepository(db, USER_ID);

  // Restore the logical clock so new writes order after everything stored,
  // even if the device clock was moved back while the app was closed.
  const maxHlc = await measurements.maxHlc();
  if (maxHlc) {
    hlc.observe(maxHlc);
  }
  await goals.ensureDefaults();

  // Crash recovery: requests that were in flight when the app died.
  await outbox.resetInFlight();

  const server = new MockServer(await createMockServerStorage());
  await server.load();
  const conditions = new NetworkConditionsController();
  const api = new MockApiClient({ server, conditions: conditions.get });

  const netInfo = new NetInfoNetworkMonitor();
  netInfo.start();
  const network = new SimulatedNetworkMonitor(netInfo, conditions);

  const queryClient = createQueryClient();
  const engine = new SyncEngine({
    db,
    outbox,
    measurements,
    syncState,
    api,
    network,
    clock,
    onStatus: patch => {
      reportSyncStatus(patch);
      queryClient.invalidateQueries({ queryKey: queryKeys.outbox() });
    },
    onDataChanged: () => {
      queryClient.invalidateQueries({ queryKey: MEASUREMENTS_KEY });
    },
  });
  const nudgeSync = createSyncNudge(engine);

  const registry = createHealthRegistry();
  const healthImport = new HealthImportService({
    providers: registry.providers,
    measurements,
    syncState,
    clock,
    onImported: nudgeSync,
  });

  startSyncTriggers({
    engine,
    network,
    onStatus: reportSyncStatus,
    subscribeForeground: listener => {
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'active') {
          listener();
        }
      });
      return () => subscription.remove();
    },
  });

  reportSyncStatus({
    online: network.isOnline(),
    lastSyncedAt: await syncState.getLastSyncedAt(),
  });
  await engine.refreshCounts();
  // Not awaited: the UI is usable from local data while this runs.
  engine.run().catch(() => undefined);

  return {
    measurements,
    goals,
    outbox,
    engine,
    healthImport,
    queryClient,
    clock,
    nudgeSync,
    debug: { conditions, server, healthSimulation: registry.simulation },
  };
}
