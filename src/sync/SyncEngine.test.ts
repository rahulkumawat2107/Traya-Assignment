import type { MeasurementDto } from '@/api/dto';
import { RetryableError, TerminalError } from '@/domain/errors';
import { serializeHlc } from '@/domain/sync/hlc';
import {
  createTestRepos,
  TEST_USER,
  type TestRepos,
} from '@/test/createTestRepos';
import { FakeApiClient } from '@/test/fakes/FakeApiClient';
import { FakeNetworkMonitor } from '@/test/fakes/FakeNetworkMonitor';
import { SyncEngine } from './SyncEngine';
import { createSyncNudge, startSyncTriggers } from './syncTriggers';
import { INITIAL_SYNC_STATUS, type SyncStatus } from './types';

const NOON = Date.UTC(2026, 8, 21, 12, 0, 0);
const BACKOFF = { baseMs: 1000, maxMs: 60_000, jitter: 0 };

let repos: TestRepos;
let api: FakeApiClient;
let network: FakeNetworkMonitor;
let engine: SyncEngine;
let status: SyncStatus;
let dataChanged: number;

function buildEngine(
  overrides: { batchSize?: number; pullPageSize?: number } = {},
) {
  return new SyncEngine({
    db: repos.db,
    outbox: repos.outbox,
    measurements: repos.measurements,
    syncState: repos.syncState,
    api,
    network,
    clock: repos.clock,
    backoff: BACKOFF,
    onStatus: patch => {
      status = { ...status, ...patch };
    },
    onDataChanged: () => {
      dataChanged += 1;
    },
    ...overrides,
  });
}

const addWeight = (value: number, measuredAt = NOON) =>
  repos.measurements.create({ metric: 'weight', value, measuredAt });

function remoteRecord(
  id: string,
  value: number,
  physical: number,
  deletedAt: number | null = null,
): MeasurementDto {
  return {
    id,
    userId: TEST_USER,
    metric: 'weight',
    value,
    measuredAt: NOON,
    source: 'manual',
    externalId: null,
    hlc: serializeHlc({ physical, counter: 0, nodeId: 'device-b' }),
    deletedAt,
  };
}

beforeEach(async () => {
  repos = await createTestRepos();
  repos.clock.set(NOON);
  api = new FakeApiClient();
  network = new FakeNetworkMonitor(true);
  status = INITIAL_SYNC_STATUS;
  dataChanged = 0;
  engine = buildEngine();
});

afterEach(() => {
  engine.dispose();
  jest.useRealTimers();
});

describe('push', () => {
  it('sends pending changes and marks the rows synced', async () => {
    const a = await addWeight(72.5);

    const result = await engine.run();

    expect(result).toMatchObject({ ran: true, pushed: 1, error: null });
    expect(api.server.getRecord(a.id)?.value).toBe(72.5);
    expect((await repos.measurements.getById(a.id))?.syncStatus).toBe('synced');
    expect(await repos.outbox.list()).toEqual([]);
    expect(status).toMatchObject({
      phase: 'idle',
      pendingCount: 0,
      lastSyncedAt: NOON,
      lastError: null,
    });
    expect(dataChanged).toBe(1);
  });

  it('sends one coalesced op per record after an offline session', async () => {
    const a = await addWeight(72.8);
    await repos.measurements.update(a.id, { value: 72.6, measuredAt: NOON });
    const b = await addWeight(70);
    await repos.measurements.remove(b.id);

    await engine.run();

    expect(api.pushCalls).toHaveLength(1);
    expect(api.pushCalls[0]).toHaveLength(1);
    expect(api.pushCalls[0]?.[0]).toMatchObject({ opType: 'create' });
    expect(api.server.getRecord(a.id)?.value).toBe(72.6);
    // Created and deleted offline: the server never hears about it.
    expect(api.server.getRecord(b.id)).toBeUndefined();
    expect(await repos.outbox.list()).toEqual([]);
  });

  it('splits a large backlog into batches', async () => {
    engine = buildEngine({ batchSize: 2 });
    for (let i = 0; i < 5; i++) {
      await addWeight(70 + i);
    }

    const result = await engine.run();

    expect(api.pushCalls.map(call => call.length)).toEqual([2, 2, 1]);
    expect(result.pushed).toBe(5);
    expect(api.server.recordCount()).toBe(5);
  });

  it('does nothing while offline and leaves the changes pending', async () => {
    network.setOnline(false);
    await addWeight(72.5);

    const result = await engine.run();

    expect(result).toMatchObject({ ran: false, skippedReason: 'offline' });
    expect(api.pushCalls).toHaveLength(0);
    expect(api.pullCalls).toHaveLength(0);
    expect(await repos.outbox.getPending(10)).toHaveLength(1);
    expect(status).toMatchObject({ online: false, pendingCount: 1 });
  });
});

describe('retry behaviour', () => {
  it('backs off after a retryable failure and succeeds later', async () => {
    const a = await addWeight(72.5);
    api.failNextPush(new RetryableError('timeout'));

    const failed = await engine.run();

    expect(failed.error).toBe('timeout');
    expect(status).toMatchObject({
      phase: 'error',
      lastError: 'timeout',
      pendingCount: 1,
      nextRetryAt: NOON + 1000,
    });
    const [op] = await repos.outbox.getPending(10);
    expect(op).toMatchObject({
      attempts: 1,
      nextAttemptAt: NOON + 1000,
      lastError: 'timeout',
    });
    // The pull is skipped when the connection is evidently down.
    expect(api.pullCalls).toHaveLength(0);

    // Too early: the op is not due, so nothing is sent.
    await engine.run();
    expect(api.pushCalls).toHaveLength(1);

    repos.clock.advance(1000);
    await engine.run();
    expect(api.pushCalls).toHaveLength(2);
    expect((await repos.measurements.getById(a.id))?.syncStatus).toBe('synced');
    expect(status).toMatchObject({
      phase: 'idle',
      lastError: null,
      nextRetryAt: null,
    });
  });

  it('grows the delay with each consecutive failure', async () => {
    await addWeight(72.5);
    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      api.failNextPush(new RetryableError('timeout'));
      await engine.run({ force: true });
      const [op] = await repos.outbox.getPending(10);
      delays.push(op!.nextAttemptAt - repos.clock.now());
    }
    expect(delays).toEqual([1000, 2000, 4000]);
  });

  it('retries by itself when the backoff timer fires', async () => {
    jest.useFakeTimers();
    await addWeight(72.5);
    api.failNextPush(new RetryableError('timeout'));
    await engine.run();
    expect(api.pushCalls).toHaveLength(1);

    repos.clock.advance(1000);
    await jest.advanceTimersByTimeAsync(1000);
    // Let the timer-triggered run finish.
    await engine.run();

    expect(api.pushCalls).toHaveLength(2);
    expect(await repos.outbox.list()).toEqual([]);
  });

  it('ignores backoff when forced', async () => {
    await addWeight(72.5);
    api.failNextPush(new RetryableError('timeout'));
    await engine.run();

    const result = await engine.run({ force: true });

    expect(result.pushed).toBe(1);
  });

  it('parks a change the server rejects and does not retry it', async () => {
    const bad = await addWeight(9000); // outside the server's allowed range
    const good = await addWeight(72.5);

    const result = await engine.run();

    expect(result).toMatchObject({ pushed: 1, rejected: 1, error: null });
    expect((await repos.measurements.getById(bad.id))?.syncStatus).toBe(
      'failed',
    );
    expect((await repos.measurements.getById(good.id))?.syncStatus).toBe(
      'synced',
    );
    expect(status).toMatchObject({ pendingCount: 0, failedCount: 1 });
    const [parked] = await repos.outbox.list();
    expect(parked).toMatchObject({ status: 'failed', entityId: bad.id });
    expect(parked?.lastError).toContain('weight must be between');

    await engine.run({ force: true });
    expect(api.pushCalls).toHaveLength(1);
  });

  it('parks the whole batch on a terminal request error', async () => {
    const a = await addWeight(72.5);
    api.failNextPush(new TerminalError('401 Unauthorized'));

    const result = await engine.run();

    expect(result.rejected).toBe(1);
    expect((await repos.measurements.getById(a.id))?.syncStatus).toBe('failed');
    expect(await repos.outbox.getPending(10)).toHaveLength(0);
  });

  it('sends a failed change again after the user asks for a retry', async () => {
    const a = await addWeight(72.5);
    api.failNextPush(new TerminalError('500 that was misclassified'));
    await engine.run();

    const result = await engine.retryFailed();

    expect(result.pushed).toBe(1);
    expect((await repos.measurements.getById(a.id))?.syncStatus).toBe('synced');
    expect(status.failedCount).toBe(0);
  });
});

describe('duplicates and ordering', () => {
  it('does not duplicate data when the response is lost and the request replayed', async () => {
    const a = await addWeight(72.5);
    api.loseNextPushResponse(new RetryableError('connection reset'));

    await engine.run();
    // The server has the record, the client does not know it.
    expect(api.server.getRecord(a.id)?.value).toBe(72.5);
    expect((await repos.measurements.getById(a.id))?.syncStatus).toBe(
      'pending',
    );

    await engine.run({ force: true });

    // Same idempotency key both times, one record, one change-feed entry.
    expect(api.pushCalls[1]?.[0]?.opId).toBe(api.pushCalls[0]?.[0]?.opId);
    expect(api.server.recordCount()).toBe(1);
    expect((await api.server.pull(null, 10)).cursor).toBe('1');
    expect((await repos.measurements.getById(a.id))?.syncStatus).toBe('synced');
  });

  it('recovers ops left in flight by a crash without duplicating them', async () => {
    const a = await addWeight(72.5);
    const release = api.holdPushes();
    const interrupted = engine.run();
    // Wait until the request has been handed to the network.
    while (api.pushCalls.length === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
    expect((await repos.outbox.list())[0]?.status).toBe('in_flight');

    // "Crash": the request reaches the server but this engine never
    // processes the response. A new process starts on the same database.
    await api.server.push(api.pushCalls[0]!);
    engine.dispose();
    const stuck = await repos.outbox.list();
    expect(stuck[0]).toMatchObject({ status: 'in_flight', attempts: 1 });

    expect(await repos.outbox.resetInFlight()).toBe(1);
    const restarted = buildEngine();
    const pushesBefore = api.pushCalls.length;
    release();
    await interrupted;
    await restarted.run({ force: true });
    restarted.dispose();

    expect(api.pushCalls.length).toBeGreaterThanOrEqual(pushesBefore);
    expect(api.server.recordCount()).toBe(1);
    expect((await api.server.pull(null, 10)).cursor).toBe('1');
    expect(await repos.outbox.list()).toEqual([]);
    expect((await repos.measurements.getById(a.id))?.syncStatus).toBe('synced');
  });

  it('still deletes on the server when a create may have landed before a crash', async () => {
    const a = await addWeight(72.5);
    const [createOp] = await repos.outbox.getPending(10);
    // The create was handed to the network and reached the server, then the
    // app died before the response.
    await repos.outbox.markInFlight([createOp!.opId]);
    await api.server.push([
      { opId: createOp!.opId, opType: 'create', record: createOp!.payload },
    ]);
    await repos.outbox.resetInFlight();

    await repos.measurements.remove(a.id);
    await engine.run();

    expect(api.server.getRecord(a.id)?.deletedAt).not.toBeNull();
  });

  it('accepts the newer server version when its own push is stale', async () => {
    const a = await addWeight(72.8);
    await engine.run();
    // Another device edits the same record later...
    await api.server.injectRemoteChange(
      remoteRecord(a.id, 71.9, NOON + 60_000),
    );
    // ...while this device queued an edit made earlier (clock behind).
    repos.clock.set(NOON + 1000);
    await repos.measurements.update(a.id, { value: 72.6, measuredAt: NOON });

    await engine.run();

    expect(api.server.getRecord(a.id)?.value).toBe(71.9);
    expect(await repos.measurements.getById(a.id)).toMatchObject({
      value: 71.9,
      syncStatus: 'synced',
    });
    expect(await repos.outbox.list()).toEqual([]);
  });

  it('keeps a row pending when it is edited while its push is in flight', async () => {
    const a = await addWeight(72.8);
    const release = api.holdPushes();
    const running = engine.run();
    while (api.pushCalls.length === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }

    await repos.measurements.update(a.id, { value: 72.6, measuredAt: NOON });
    release();
    await running;

    // The same run notices the new op and sends it too.
    expect(api.pushCalls).toHaveLength(2);
    expect(api.server.getRecord(a.id)?.value).toBe(72.6);
    expect((await repos.measurements.getById(a.id))?.syncStatus).toBe('synced');
  });
});

describe('pull', () => {
  it('applies remote changes and remembers the cursor', async () => {
    await api.server.injectRemoteChange(remoteRecord('r1', 71, NOON));
    await api.server.injectRemoteChange(remoteRecord('r2', 70, NOON + 1));

    const result = await engine.run();

    expect(result.pulled).toBe(2);
    expect(await repos.measurements.count()).toBe(2);
    expect(await repos.syncState.get('pull_cursor')).toBe('2');

    await engine.run();
    expect(api.pullCalls).toEqual([null, '2']);
  });

  it('follows the change feed across pages', async () => {
    engine = buildEngine({ pullPageSize: 2 });
    for (let i = 0; i < 5; i++) {
      await api.server.injectRemoteChange(
        remoteRecord(`r${i}`, 70 + i, NOON + i),
      );
    }

    const result = await engine.run();

    expect(result.pulled).toBe(5);
    expect(api.pullCalls).toEqual([null, '2', '4']);
  });

  it('ignores a remote change older than the local row', async () => {
    const a = await addWeight(72.6);
    await engine.run();
    // Delivered late: an edit from another device made before ours.
    await api.server.injectRemoteChange(remoteRecord(a.id, 60, NOON - 60_000));

    const result = await engine.run();

    expect(result.pulled).toBe(0);
    expect((await repos.measurements.getById(a.id))?.value).toBe(72.6);
  });

  it('applies a remote change newer than the local row', async () => {
    const a = await addWeight(72.6);
    await engine.run();
    await api.server.injectRemoteChange(
      remoteRecord(a.id, 71.5, NOON + 60_000),
    );

    const result = await engine.run();

    expect(result.pulled).toBe(1);
    expect((await repos.measurements.getById(a.id))?.value).toBe(71.5);
  });

  it('applies a remote delete', async () => {
    const a = await addWeight(72.6);
    await engine.run();
    await api.server.injectRemoteChange(
      remoteRecord(a.id, 72.6, NOON + 60_000, NOON + 60_000),
    );

    await engine.run();

    expect(await repos.measurements.count()).toBe(0);
  });

  it('does not count its own pushed changes as pulled', async () => {
    await addWeight(72.6);
    const result = await engine.run();
    expect(result).toMatchObject({ pushed: 1, pulled: 0 });
  });

  it('reports a pull failure without losing pushed work', async () => {
    const a = await addWeight(72.6);
    api.failNextPull(new RetryableError('timeout'));

    const result = await engine.run();

    expect(result).toMatchObject({ pushed: 1, error: 'timeout' });
    expect((await repos.measurements.getById(a.id))?.syncStatus).toBe('synced');
    expect(status.phase).toBe('error');
  });
});

describe('concurrency and triggers', () => {
  it('shares one run between triggers that fire together', async () => {
    await addWeight(72.5);

    const [first, second] = await Promise.all([engine.run(), engine.run()]);

    expect(second).toBe(first);
    expect(api.pushCalls).toHaveLength(1);
    expect(api.pullCalls).toHaveLength(1);
  });

  it('runs once more when a write is announced during a run', async () => {
    await addWeight(72.5);
    const release = api.holdPushes();
    const running = engine.run();
    while (api.pushCalls.length === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }

    engine.requestSync();
    release();
    await running;
    await engine.run();

    expect(api.pullCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('syncs when connectivity returns, ignoring backoff', async () => {
    const stop = startSyncTriggers({
      engine,
      network,
      subscribeForeground: () => () => undefined,
      onStatus: patch => {
        status = { ...status, ...patch };
      },
    });
    await addWeight(72.5);
    api.failNextPush(new RetryableError('timeout'));
    await engine.run();

    network.setOnline(false);
    expect(status.online).toBe(false);
    network.setOnline(true);
    await engine.run();

    expect(api.server.recordCount()).toBe(1);
    expect(status.online).toBe(true);
    stop();
  });

  it('syncs when the app returns to the foreground', async () => {
    let foreground: () => void = () => undefined;
    const stop = startSyncTriggers({
      engine,
      network,
      subscribeForeground: listener => {
        foreground = listener;
        return () => undefined;
      },
    });
    await addWeight(72.5);

    foreground();
    await engine.run();

    expect(api.server.recordCount()).toBe(1);
    stop();
  });

  it('turns a burst of writes into a single sync request', async () => {
    jest.useFakeTimers();
    const requestSync = jest.spyOn(engine, 'requestSync');
    const nudge = createSyncNudge(engine, 400);

    nudge();
    nudge();
    nudge();
    await jest.advanceTimersByTimeAsync(400);

    expect(requestSync).toHaveBeenCalledTimes(1);
  });
});
