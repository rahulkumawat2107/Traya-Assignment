import { DAY_MS, seriesWindow } from '@/domain/measurement/range';
import { serializeHlc } from '@/domain/sync/hlc';
import {
  createTestRepos,
  TEST_USER,
  type TestRepos,
} from '@/test/createTestRepos';

const NOON = Date.UTC(2026, 8, 21, 12, 0, 0);
const UTC = 0;

let repos: TestRepos;

beforeEach(async () => {
  repos = await createTestRepos();
  repos.clock.set(NOON);
});

describe('local writes', () => {
  it('writes the row and its outbox op together', async () => {
    const created = await repos.measurements.create({
      metric: 'weight',
      value: 72.5,
      measuredAt: NOON,
    });

    expect(await repos.measurements.getById(created.id)).toMatchObject({
      value: 72.5,
      source: 'manual',
      syncStatus: 'pending',
      userId: TEST_USER,
    });
    const ops = await repos.outbox.getPending(10);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      entityId: created.id,
      opType: 'create',
      hlc: created.hlc,
      attempts: 0,
    });
    expect(ops[0]?.payload.value).toBe(72.5);
  });

  it('writes neither the row nor the op when the transaction fails', async () => {
    jest
      .spyOn(repos.outbox, 'enqueue')
      .mockRejectedValueOnce(new Error('disk full'));

    await expect(
      repos.measurements.create({
        metric: 'weight',
        value: 72.5,
        measuredAt: NOON,
      }),
    ).rejects.toThrow('disk full');

    expect(await repos.measurements.count()).toBe(0);
    expect(await repos.outbox.getPending(10)).toHaveLength(0);
  });

  it('gives an edit a newer HLC and queues an update', async () => {
    const created = await repos.measurements.create({
      metric: 'weight',
      value: 72.8,
      measuredAt: NOON,
    });
    const updated = await repos.measurements.update(created.id, {
      value: 72.6,
      measuredAt: NOON,
    });

    expect(updated.hlc > created.hlc).toBe(true);
    expect((await repos.outbox.getPending(10)).map(op => op.opType)).toEqual([
      'create',
      'update',
    ]);
  });

  it('soft-deletes, hiding the row from reads but keeping a tombstone', async () => {
    const created = await repos.measurements.create({
      metric: 'weight',
      value: 72.8,
      measuredAt: NOON,
    });
    await repos.measurements.remove(created.id);

    expect(await repos.measurements.count()).toBe(0);
    expect(
      (await repos.measurements.getHistoryPage('weight', 10)).items,
    ).toEqual([]);
    expect((await repos.measurements.getById(created.id))?.deletedAt).toBe(
      NOON,
    );
    expect((await repos.outbox.getPending(10)).map(op => op.opType)).toEqual([
      'create',
      'delete',
    ]);
  });

  it('refuses to edit a deleted measurement', async () => {
    const created = await repos.measurements.create({
      metric: 'weight',
      value: 72.8,
      measuredAt: NOON,
    });
    await repos.measurements.remove(created.id);

    await expect(
      repos.measurements.update(created.id, { value: 70, measuredAt: NOON }),
    ).rejects.toThrow('no longer exists');
  });
});

describe('getHistoryPage', () => {
  it('returns stable, non-overlapping pages, newest first', async () => {
    for (let i = 0; i < 25; i++) {
      await repos.measurements.create({
        metric: 'weight',
        value: 70 + i,
        // Several rows share a timestamp to exercise the id tie-break.
        measuredAt: NOON - Math.floor(i / 3) * DAY_MS,
      });
    }

    const seen: string[] = [];
    const times: number[] = [];
    let cursor = null;
    let pages = 0;
    do {
      const page = await repos.measurements.getHistoryPage(
        'weight',
        10,
        cursor,
      );
      seen.push(...page.items.map(m => m.id));
      times.push(...page.items.map(m => m.measuredAt));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('does not shift when a newer row is inserted mid-scroll', async () => {
    for (let i = 0; i < 6; i++) {
      await repos.measurements.create({
        metric: 'weight',
        value: 70 + i,
        measuredAt: NOON - i * DAY_MS,
      });
    }
    const first = await repos.measurements.getHistoryPage('weight', 3);
    await repos.measurements.create({
      metric: 'weight',
      value: 99,
      measuredAt: NOON + DAY_MS,
    });
    const second = await repos.measurements.getHistoryPage(
      'weight',
      3,
      first.nextCursor,
    );

    const firstIds = first.items.map(m => m.id);
    expect(second.items).toHaveLength(3);
    expect(second.items.some(m => firstIds.includes(m.id))).toBe(false);
    expect(second.nextCursor).toBeNull();
  });

  it('only returns the requested metric', async () => {
    await repos.measurements.create({
      metric: 'weight',
      value: 72,
      measuredAt: NOON,
    });
    await repos.measurements.upsertImported({
      metric: 'steps',
      value: 5000,
      measuredAt: NOON,
      source: 'provider:a',
      externalId: 's1',
    });
    const page = await repos.measurements.getHistoryPage('weight', 10);
    expect(page.items.map(m => m.metric)).toEqual(['weight']);
  });
});

describe('getSeries', () => {
  const window7d = () => seriesWindow('7d', NOON, UTC);

  it('returns one value per day and skips days without data', async () => {
    await repos.measurements.create({
      metric: 'weight',
      value: 73,
      measuredAt: NOON - 2 * DAY_MS,
    });
    await repos.measurements.create({
      metric: 'weight',
      value: 72,
      measuredAt: NOON,
    });

    const series = await repos.measurements.getSeries('weight', window7d());

    expect(series).toEqual([
      { t: Date.UTC(2026, 8, 19), value: 73 },
      { t: Date.UTC(2026, 8, 21), value: 72 },
    ]);
  });

  it('applies the manual-over-device rule within a day', async () => {
    await repos.measurements.create({
      metric: 'weight',
      value: 72.6,
      measuredAt: NOON,
    });
    await repos.measurements.upsertImported({
      metric: 'weight',
      value: 72.5,
      measuredAt: NOON + 60_000,
      source: 'provider:scale',
      externalId: 'w1',
    });

    const series = await repos.measurements.getSeries('weight', window7d());
    expect(series).toEqual([{ t: Date.UTC(2026, 8, 21), value: 72.6 }]);

    const latest = await repos.measurements.getLatestEffective('weight', UTC);
    expect(latest?.value).toBe(72.6);
  });

  it('excludes tombstoned rows and rows outside the window', async () => {
    const deleted = await repos.measurements.create({
      metric: 'weight',
      value: 99,
      measuredAt: NOON,
    });
    await repos.measurements.remove(deleted.id);
    await repos.measurements.create({
      metric: 'weight',
      value: 80,
      measuredAt: NOON - 7 * DAY_MS,
    });
    await repos.measurements.create({
      metric: 'weight',
      value: 72,
      measuredAt: NOON - 6 * DAY_MS,
    });

    const series = await repos.measurements.getSeries('weight', window7d());
    expect(series.map(p => p.value)).toEqual([72]);
  });

  it('takes the largest daily total for steps instead of adding providers up', async () => {
    await repos.measurements.upsertImported({
      metric: 'steps',
      value: 6000,
      measuredAt: NOON,
      source: 'provider:a',
      externalId: 's1',
    });
    await repos.measurements.upsertImported({
      metric: 'steps',
      value: 6400,
      measuredAt: NOON + 1000,
      source: 'provider:b',
      externalId: 's1',
    });

    const series = await repos.measurements.getSeries('steps', window7d());
    expect(series.map(p => p.value)).toEqual([6400]);
    expect(
      (await repos.measurements.getLatestEffective('steps', UTC))?.value,
    ).toBe(6400);
  });

  it('averages days into weekly buckets for the 3 month range', async () => {
    const window = seriesWindow('3m', NOON, UTC);
    // Two readings in the first week of the window, one in the last.
    await repos.measurements.create({
      metric: 'weight',
      value: 80,
      measuredAt: window.from + 1000,
    });
    await repos.measurements.create({
      metric: 'weight',
      value: 78,
      measuredAt: window.from + 3 * DAY_MS,
    });
    await repos.measurements.create({
      metric: 'weight',
      value: 72,
      measuredAt: NOON,
    });

    const series = await repos.measurements.getSeries('weight', window);

    expect(series).toHaveLength(2);
    expect(series[0]).toEqual({ t: window.from, value: 79 });
    expect(series[1]?.value).toBe(72);
  });

  it('cuts days at local midnight using the timezone offset', async () => {
    const IST = 5.5 * 3_600_000;
    // 20:00 UTC on the 20th is 01:30 on the 21st in IST.
    const lateEvening = Date.UTC(2026, 8, 20, 20, 0, 0);
    await repos.measurements.create({
      metric: 'weight',
      value: 72,
      measuredAt: lateEvening,
    });

    const series = await repos.measurements.getSeries(
      'weight',
      seriesWindow('7d', NOON, IST),
    );
    expect(series).toEqual([{ t: Date.UTC(2026, 8, 21) - IST, value: 72 }]);
  });

  it('returns an empty series and null latest when there is no data', async () => {
    expect(await repos.measurements.getSeries('weight', window7d())).toEqual(
      [],
    );
    expect(
      await repos.measurements.getLatestEffective('weight', UTC),
    ).toBeNull();
  });
});

describe('getToday', () => {
  const imported = (
    metric: 'steps' | 'water',
    value: number,
    at: number,
    id: string,
  ) =>
    repos.measurements.upsertImported({
      metric,
      value,
      measuredAt: at,
      source: 'provider:a',
      externalId: id,
    });

  it('is empty when nothing was recorded today', async () => {
    await imported('steps', 4000, NOON - DAY_MS, 'yesterday');
    expect(await repos.measurements.getToday(NOON, UTC)).toEqual({});
  });

  it('returns one value per metric for today only', async () => {
    await imported('steps', 4000, NOON - DAY_MS, 's-yesterday');
    await imported('steps', 6000, NOON - 3_600_000, 's-today');
    await imported('water', 1500, NOON, 'h-today');
    await repos.measurements.create({
      metric: 'weight',
      value: 72.6,
      measuredAt: NOON,
    });

    const today = await repos.measurements.getToday(NOON, UTC);

    expect(Object.keys(today).sort()).toEqual(['steps', 'water', 'weight']);
    expect(today.steps?.value).toBe(6000);
    expect(today.water?.value).toBe(1500);
    expect(today.weight?.value).toBe(72.6);
  });

  it('applies the daily rules and ignores deleted readings', async () => {
    const manual = await repos.measurements.create({
      metric: 'weight',
      value: 72.6,
      measuredAt: NOON,
    });
    await repos.measurements.upsertImported({
      metric: 'weight',
      value: 72.5,
      measuredAt: NOON + 60_000,
      source: 'provider:scale',
      externalId: 'w1',
    });
    expect((await repos.measurements.getToday(NOON, UTC)).weight?.value).toBe(
      72.6,
    );

    await repos.measurements.remove(manual.id);
    expect((await repos.measurements.getToday(NOON, UTC)).weight?.value).toBe(
      72.5,
    );
  });
});

describe('upsertImported', () => {
  const reading = {
    metric: 'weight' as const,
    value: 72.5,
    measuredAt: NOON,
    source: 'provider:scale' as const,
    externalId: 'ext-1',
  };

  it('imports once however many times it is called', async () => {
    expect(await repos.measurements.upsertImported(reading)).toBe('imported');
    expect(await repos.measurements.upsertImported(reading)).toBe('skipped');

    expect(await repos.measurements.count()).toBe(1);
    expect(await repos.outbox.getPending(10)).toHaveLength(1);
  });

  it('records a correction when the provider changes the value', async () => {
    await repos.measurements.upsertImported(reading);
    expect(
      await repos.measurements.upsertImported({ ...reading, value: 72.9 }),
    ).toBe('updated');
    const page = await repos.measurements.getHistoryPage('weight', 10);
    expect(page.items.map(m => m.value)).toEqual([72.9]);
  });

  it('does not bring back an imported reading the user deleted', async () => {
    await repos.measurements.upsertImported(reading);
    await repos.measurements.remove('provider:scale:ext-1');

    expect(await repos.measurements.upsertImported(reading)).toBe('skipped');
    expect(await repos.measurements.count()).toBe(0);
  });
});

describe('applyRemote', () => {
  const remote = (
    value: number,
    physical: number,
    deletedAt: number | null = null,
  ) => ({
    id: 'remote-1',
    userId: TEST_USER,
    metric: 'weight' as const,
    value,
    measuredAt: NOON,
    source: 'manual',
    externalId: null,
    hlc: serializeHlc({ physical, counter: 0, nodeId: 'device-b' }),
    deletedAt,
  });

  it('inserts unknown records as synced without queuing an op', async () => {
    expect(
      await repos.measurements.applyRemote(remote(71, NOON), repos.db),
    ).toBe(true);

    expect(await repos.measurements.getById('remote-1')).toMatchObject({
      value: 71,
      syncStatus: 'synced',
    });
    expect(await repos.outbox.getPending(10)).toHaveLength(0);
  });

  it('ignores a version older than the local one', async () => {
    await repos.measurements.applyRemote(remote(71, NOON), repos.db);
    expect(
      await repos.measurements.applyRemote(remote(60, NOON - 5000), repos.db),
    ).toBe(false);
    expect((await repos.measurements.getById('remote-1'))?.value).toBe(71);
  });

  it('applies a newer remote delete', async () => {
    await repos.measurements.applyRemote(remote(71, NOON), repos.db);
    await repos.measurements.applyRemote(
      remote(71, NOON + 1000, NOON + 1000),
      repos.db,
    );
    expect(await repos.measurements.count()).toBe(0);
  });

  it('pushes the local clock past remote timestamps', async () => {
    const future = remote(71, NOON + 3_600_000);
    await repos.measurements.applyRemote(future, repos.db);
    const local = await repos.measurements.create({
      metric: 'weight',
      value: 70,
      measuredAt: NOON,
    });
    expect(local.hlc > future.hlc).toBe(true);
  });
});

describe('markSynced', () => {
  it('leaves a row pending if it was edited after the push was sent', async () => {
    const created = await repos.measurements.create({
      metric: 'weight',
      value: 72.8,
      measuredAt: NOON,
    });
    const edited = await repos.measurements.update(created.id, {
      value: 72.6,
      measuredAt: NOON,
    });

    await repos.measurements.markSynced(created.id, created.hlc, repos.db);
    expect((await repos.measurements.getById(created.id))?.syncStatus).toBe(
      'pending',
    );

    await repos.measurements.markSynced(created.id, edited.hlc, repos.db);
    expect((await repos.measurements.getById(created.id))?.syncStatus).toBe(
      'synced',
    );
  });
});
