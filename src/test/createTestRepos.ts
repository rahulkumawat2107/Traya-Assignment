import { GoalRepository } from '@/data/repositories/GoalRepository';
import { MeasurementRepository } from '@/data/repositories/MeasurementRepository';
import { OutboxRepository } from '@/data/repositories/OutboxRepository';
import { SyncStateRepository } from '@/data/repositories/SyncStateRepository';
import { HlcClock } from '@/domain/sync/hlc';
import { createTestDb } from './createTestDb';
import { FakeClock } from './fakes/FakeClock';
import { FakeIdGenerator } from './fakes/FakeIdGenerator';

export const TEST_USER = 'user-1';

/** A full data layer on an in-memory database, with deterministic time and ids. */
export async function createTestRepos(deviceId = 'device-a') {
  const db = await createTestDb();
  const clock = new FakeClock();
  const ids = new FakeIdGenerator(deviceId);
  const hlc = new HlcClock(clock, deviceId);
  const outbox = new OutboxRepository(db, ids, clock);
  const measurements = new MeasurementRepository({
    db,
    outbox,
    hlc,
    ids,
    clock,
    userId: TEST_USER,
  });
  const syncState = new SyncStateRepository(db);
  const goals = new GoalRepository(db, TEST_USER);
  return { db, clock, ids, hlc, outbox, measurements, syncState, goals };
}

export type TestRepos = Awaited<ReturnType<typeof createTestRepos>>;
