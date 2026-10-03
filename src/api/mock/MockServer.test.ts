import { RetryableError } from '@/domain/errors';
import { serializeHlc } from '@/domain/sync/hlc';
import type { MeasurementDto, PushOpDto } from '../dto';
import { MockApiClient } from './MockApiClient';
import { MockServer, type MockServerStorage } from './MockServer';
import {
  DEFAULT_CONDITIONS,
  type NetworkConditions,
} from './networkConditions';

function record(id: string, value: number, physical: number): MeasurementDto {
  return {
    id,
    userId: 'user-1',
    metric: 'weight',
    value,
    measuredAt: 1000,
    source: 'manual',
    externalId: null,
    hlc: serializeHlc({ physical, counter: 0, nodeId: 'device-a' }),
    deletedAt: null,
  };
}

const op = (opId: string, rec: MeasurementDto): PushOpDto => ({
  opId,
  opType: 'update',
  record: rec,
});

describe('MockServer', () => {
  it('applies an op once and replays the original result for a duplicate', async () => {
    const server = new MockServer();
    const first = await server.push([op('op-1', record('a', 72.5, 10))]);
    const replay = await server.push([op('op-1', record('a', 72.5, 10))]);

    expect(first.results[0]?.status).toBe('applied');
    expect(replay).toEqual(first);
    // The change feed has one entry: the duplicate did not write again.
    expect((await server.pull(null, 10)).cursor).toBe('1');
  });

  it('does not let an older write overwrite a newer one', async () => {
    const server = new MockServer();
    await server.push([op('op-2', record('a', 72.6, 20))]);
    const late = await server.push([op('op-1', record('a', 72.8, 10))]);

    expect(late.results[0]).toMatchObject({ status: 'stale' });
    expect(late.results[0]?.record?.value).toBe(72.6);
    expect(server.getRecord('a')?.value).toBe(72.6);
  });

  it('rejects values outside the allowed range', async () => {
    const server = new MockServer();
    const response = await server.push([op('op-1', record('a', 9000, 10))]);

    expect(response.results[0]?.status).toBe('rejected');
    expect(server.recordCount()).toBe(0);
  });

  it('accepts a delete for a record it has never seen', async () => {
    const server = new MockServer();
    const tombstone = { ...record('ghost', 70, 10), deletedAt: 10 };
    const response = await server.push([
      { opId: 'op-1', opType: 'delete', record: tombstone },
    ]);
    expect(response.results[0]?.status).toBe('applied');
    expect(server.getRecord('ghost')?.deletedAt).toBe(10);
  });

  it('returns only changes after the cursor', async () => {
    const server = new MockServer();
    await server.push([
      op('op-1', record('a', 1, 10)),
      op('op-2', record('b', 2, 11)),
    ]);
    const first = await server.pull(null, 10);
    await server.push([op('op-3', record('a', 3, 12))]);
    const second = await server.pull(first.cursor, 10);

    expect(first.changes.map(c => c.id)).toEqual(['a', 'b']);
    expect(second.changes.map(c => [c.id, c.value])).toEqual([['a', 3]]);
    expect((await server.pull(second.cursor, 10)).changes).toEqual([]);
  });

  it('pages the change feed', async () => {
    const server = new MockServer();
    await server.push(
      ['a', 'b', 'c'].map((id, i) => op(`op-${i}`, record(id, i + 1, 10 + i))),
    );
    const first = await server.pull(null, 2);
    const second = await server.pull(first.cursor, 2);

    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
    expect([...first.changes, ...second.changes].map(c => c.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('restores its state from storage', async () => {
    let saved: string | null = null;
    const storage: MockServerStorage = {
      load: async () => saved,
      save: async serialized => {
        saved = serialized;
      },
    };
    const before = new MockServer(storage);
    await before.push([op('op-1', record('a', 72.5, 10))]);

    const after = new MockServer(storage);
    await after.load();

    expect(after.getRecord('a')?.value).toBe(72.5);
    // Idempotency also survives the restart.
    expect(
      (await after.push([op('op-1', record('a', 72.5, 10))])).results[0]
        ?.status,
    ).toBe('applied');
    expect((await after.pull(null, 10)).cursor).toBe('1');
  });
});

describe('MockApiClient', () => {
  const noSleep = async () => {};

  function client(
    conditions: Partial<NetworkConditions>,
    randoms: number[] = [],
  ) {
    const server = new MockServer();
    const queue = [...randoms];
    const api = new MockApiClient({
      server,
      conditions: () => ({ ...DEFAULT_CONDITIONS, ...conditions }),
      random: () => queue.shift() ?? 0.99,
      sleep: noSleep,
    });
    return { server, api };
  }

  it('fails fast with a retryable error when offline', async () => {
    const { api, server } = client({ offline: true });
    await expect(
      api.pushOps([op('op-1', record('a', 1, 10))]),
    ).rejects.toBeInstanceOf(RetryableError);
    expect(server.recordCount()).toBe(0);
  });

  it('can lose the response after the server applied the request', async () => {
    // randoms: latency, failure roll (< rate), before/after roll (>= 0.5)
    const { api, server } = client({ failureRate: 1 }, [0, 0, 0.9]);
    await expect(
      api.pushOps([op('op-1', record('a', 1, 10))]),
    ).rejects.toBeInstanceOf(RetryableError);
    expect(server.recordCount()).toBe(1);
  });

  it('can lose the request before it reaches the server', async () => {
    const { api, server } = client({ failureRate: 1 }, [0, 0, 0.1]);
    await expect(
      api.pushOps([op('op-1', record('a', 1, 10))]),
    ).rejects.toBeInstanceOf(RetryableError);
    expect(server.recordCount()).toBe(0);
  });

  it('delivers duplicates without changing the outcome', async () => {
    const { api, server } = client({ duplicateRate: 1 }, [0, 0.99, 0]);
    const response = await api.pushOps([op('op-1', record('a', 1, 10))]);

    expect(response.results[0]?.status).toBe('applied');
    expect((await server.pull(null, 10)).changes).toHaveLength(1);
  });

  it('reflects condition changes made at runtime', async () => {
    const server = new MockServer();
    let offline = true;
    const api = new MockApiClient({
      server,
      conditions: () => ({ ...DEFAULT_CONDITIONS, offline }),
      sleep: noSleep,
    });

    await expect(api.pullChanges(null, 10)).rejects.toBeInstanceOf(
      RetryableError,
    );
    offline = false;
    await expect(api.pullChanges(null, 10)).resolves.toMatchObject({
      changes: [],
    });
  });
});
