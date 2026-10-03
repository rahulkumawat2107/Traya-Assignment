import { DAY_MS } from '@/domain/measurement/range';
import { createTestRepos, type TestRepos } from '@/test/createTestRepos';
import { HealthImportService } from './HealthImportService';
import type { HealthProvider, NormalizedReading } from './HealthProvider';
import { createHealthRegistry } from './registry';

const NOON = new Date(2026, 8, 21, 12, 0, 0).getTime();

let repos: TestRepos;
let onImported: jest.Mock;

function service(providers: HealthProvider[]) {
  return new HealthImportService({
    providers,
    measurements: repos.measurements,
    syncState: repos.syncState,
    clock: repos.clock,
    onImported,
  });
}

function stubProvider(
  readings: NormalizedReading[],
  overrides: Partial<HealthProvider> = {},
): HealthProvider {
  return {
    id: 'stub',
    name: 'Stub',
    description: '',
    isAvailable: async () => ({ available: true }),
    requestPermission: async () => true,
    read: async () => ({ readings, rejected: 0 }),
    ...overrides,
  };
}

const reading = (externalId: string, value: number): NormalizedReading => ({
  metric: 'weight',
  value,
  measuredAt: NOON,
  externalId,
});

beforeEach(async () => {
  repos = await createTestRepos();
  repos.clock.set(NOON);
  onImported = jest.fn();
});

describe('HealthImportService', () => {
  it('stores readings tagged with their source and queues them for sync', async () => {
    const report = await service([
      stubProvider([reading('w1', 72.5)]),
    ]).importFrom('stub');

    expect(report).toMatchObject({ imported: 1, skipped: 0, failure: null });
    const page = await repos.measurements.getHistoryPage('weight', 10);
    expect(page.items[0]).toMatchObject({
      value: 72.5,
      source: 'provider:stub',
      externalId: 'w1',
      syncStatus: 'pending',
    });
    expect(await repos.outbox.getPending(10)).toHaveLength(1);
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('creates no duplicates when the same import runs twice', async () => {
    const imports = service([
      stubProvider([reading('w1', 72.5), reading('w2', 72.4)]),
    ]);

    await imports.importFrom('stub');
    const second = await imports.importFrom('stub');

    expect(second).toMatchObject({ imported: 0, skipped: 2 });
    expect(await repos.measurements.count()).toBe(2);
    expect(await repos.outbox.getPending(10)).toHaveLength(2);
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('reports rejected provider records alongside the ones it stored', async () => {
    const provider = stubProvider([reading('w1', 72.5)], {
      read: async () => ({ readings: [reading('w1', 72.5)], rejected: 3 }),
    });
    const report = await service([provider]).importFrom('stub');
    expect(report).toMatchObject({ imported: 1, rejected: 3, failure: null });
  });

  it('reports an unavailable provider without reading from it', async () => {
    const read = jest.fn();
    const provider = stubProvider([], {
      isAvailable: async () => ({ available: false, reason: 'Not installed' }),
      read,
    });
    const report = await service([provider]).importFrom('stub');

    expect(report.failure).toEqual({
      kind: 'unavailable',
      message: 'Not installed',
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('reports a declined permission', async () => {
    const provider = stubProvider([], { requestPermission: async () => false });
    const report = await service([provider]).importFrom('stub');
    expect(report.failure?.kind).toBe('permission_denied');
  });

  it('keeps what was stored when the provider fails part-way', async () => {
    const provider = stubProvider([], {
      read: async () => {
        throw new Error('Provider timed out');
      },
    });
    const report = await service([provider]).importFrom('stub');
    expect(report.failure).toEqual({
      kind: 'failed',
      message: 'Provider timed out',
    });
    expect(await service([provider]).getLastImportAt('stub')).toBeNull();
  });

  it('remembers when each provider was last imported', async () => {
    const imports = service([stubProvider([reading('w1', 72.5)])]);
    expect(await imports.getLastImportAt('stub')).toBeNull();
    await imports.importFrom('stub');
    expect(await imports.getLastImportAt('stub')).toBe(NOON);
  });
});

describe('mock providers end to end', () => {
  it('imports 30 days from FitBand, skipping its one broken record', async () => {
    const registry = createHealthRegistry();
    const report = await service(registry.providers).importFrom('fitband');

    expect(report.failure).toBeNull();
    expect(report.rejected).toBe(1);
    expect(report.imported).toBe(90);
    expect(await repos.measurements.count('weight')).toBe(30);
    expect(await repos.measurements.count('steps')).toBe(30);
    expect(await repos.measurements.count('sleep')).toBe(30);
  });

  it('is denied by Pulse Health once, then allowed', async () => {
    const imports = service(createHealthRegistry().providers);

    expect((await imports.importFrom('pulse')).failure?.kind).toBe(
      'permission_denied',
    );
    const retry = await imports.importFrom('pulse', {
      from: NOON - 2 * DAY_MS,
      to: NOON,
    });
    expect(retry.failure).toBeNull();
    expect(retry.imported).toBeGreaterThan(0);
    // The record in stone was refused.
    expect(retry.rejected).toBe(1);
  });

  it('finds ScaleCo unavailable until it is installed', async () => {
    const registry = createHealthRegistry();
    const imports = service(registry.providers);

    expect((await imports.importFrom('scaleco')).failure?.kind).toBe(
      'unavailable',
    );
    registry.simulation.setScaleInstalled(true);
    expect((await imports.importFrom('scaleco')).failure).toBeNull();
  });
});
