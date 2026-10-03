import { createTestRepos, type TestRepos } from '@/test/createTestRepos';

let repos: TestRepos;

async function addWeight(value: number) {
  return repos.measurements.create({
    metric: 'weight',
    value,
    measuredAt: 1000,
  });
}

beforeEach(async () => {
  repos = await createTestRepos();
});

describe('OutboxRepository', () => {
  it('returns pending ops in insertion order', async () => {
    const a = await addWeight(1);
    const b = await addWeight(2);
    await repos.measurements.update(a.id, { value: 3, measuredAt: 1000 });

    const ops = await repos.outbox.getPending(10);
    expect(ops.map(op => [op.entityId, op.opType])).toEqual([
      [a.id, 'create'],
      [b.id, 'create'],
      [a.id, 'update'],
    ]);
  });

  it('counts an attempt when an op is handed to the network', async () => {
    await addWeight(1);
    const [op] = await repos.outbox.getPending(10);

    await repos.outbox.markInFlight([op!.opId]);

    expect(await repos.outbox.getPending(10)).toHaveLength(0);
    expect((await repos.outbox.list())[0]).toMatchObject({
      status: 'in_flight',
      attempts: 1,
    });
  });

  it('recovers in-flight ops after a crash', async () => {
    await addWeight(1);
    const [op] = await repos.outbox.getPending(10);
    await repos.outbox.markInFlight([op!.opId]);

    expect(await repos.outbox.resetInFlight()).toBe(1);

    const [recovered] = await repos.outbox.getPending(10);
    expect(recovered).toMatchObject({
      opId: op!.opId,
      status: 'pending',
      attempts: 1,
    });
  });

  it('schedules a retry with the error that caused it', async () => {
    await addWeight(1);
    const [op] = await repos.outbox.getPending(10);
    await repos.outbox.markInFlight([op!.opId]);
    await repos.outbox.markForRetry([op!.opId], 5000, 'timeout');

    expect((await repos.outbox.getPending(10))[0]).toMatchObject({
      nextAttemptAt: 5000,
      lastError: 'timeout',
    });
    expect(await repos.outbox.nextAttemptAt()).toBe(5000);

    await repos.outbox.clearBackoff();
    expect(await repos.outbox.nextAttemptAt()).toBe(0);
  });

  it('parks failed ops until they are retried', async () => {
    const a = await addWeight(1);
    const [op] = await repos.outbox.getPending(10);
    await repos.outbox.markFailed([op!.opId], 'rejected');

    expect(await repos.outbox.getPending(10)).toHaveLength(0);
    expect(await repos.outbox.counts()).toEqual({ pending: 0, failed: 1 });

    expect(await repos.outbox.retryFailed()).toEqual([a.id]);
    expect(await repos.outbox.counts()).toEqual({ pending: 1, failed: 0 });
  });

  it('counts records, not ops', async () => {
    const a = await addWeight(1);
    await repos.measurements.update(a.id, { value: 2, measuredAt: 1000 });
    await addWeight(3);

    expect(await repos.outbox.counts()).toEqual({ pending: 2, failed: 0 });
  });

  it('removes ops and reports no pending retry when empty', async () => {
    await addWeight(1);
    const ops = await repos.outbox.getPending(10);
    await repos.outbox.remove(ops.map(op => op.opId));

    expect(await repos.outbox.list()).toEqual([]);
    expect(await repos.outbox.nextAttemptAt()).toBeNull();
  });
});

describe('SyncStateRepository', () => {
  it('stores and overwrites values', async () => {
    expect(await repos.syncState.get('pull_cursor')).toBeNull();
    await repos.syncState.set('pull_cursor', '5');
    await repos.syncState.set('pull_cursor', '9');
    expect(await repos.syncState.get('pull_cursor')).toBe('9');
  });

  it('creates the device id once and reuses it', async () => {
    const first = await repos.syncState.getOrCreateDeviceId(repos.ids);
    const second = await repos.syncState.getOrCreateDeviceId(repos.ids);
    expect(second).toBe(first);
  });
});

describe('GoalRepository', () => {
  it('seeds defaults without overwriting an existing goal', async () => {
    await repos.goals.set({
      metric: 'weight',
      startValue: 90,
      targetValue: 80,
      direction: 'decrease',
    });
    await repos.goals.ensureDefaults();

    expect((await repos.goals.get('weight'))?.targetValue).toBe(80);
    expect((await repos.goals.get('steps'))?.targetValue).toBe(8000);
  });
});
