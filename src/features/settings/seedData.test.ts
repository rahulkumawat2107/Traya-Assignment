import { createTestRepos } from '@/test/createTestRepos';
import { generateSeedReadings } from './seedData';

const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);

describe('seed data', () => {
  it('generates three metrics per day for three years', () => {
    const readings = generateSeedReadings(NOW);
    expect(readings).toHaveLength(1095 * 3);
    expect(new Set(readings.map(r => r.externalId)).size).toBe(readings.length);
    expect(readings.every(r => r.measuredAt < NOW)).toBe(true);
  });

  it('inserts as synced rows without flooding the outbox, and only once', async () => {
    const repos = await createTestRepos();
    const readings = generateSeedReadings(NOW, 0.1);

    await repos.measurements.insertSeed(readings);
    await repos.measurements.insertSeed(readings);

    expect(await repos.measurements.count()).toBe(readings.length);
    expect(await repos.outbox.list()).toEqual([]);
  });
});
