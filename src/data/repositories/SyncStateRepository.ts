import type { IdGenerator } from '@/shared/services/IdGenerator';
import type { SqlDriver, SqlExecutor } from '../db/SqlDriver';

export type SyncStateKey =
  | 'pull_cursor'
  | 'device_id'
  | 'last_synced_at'
  | `import_at:${string}`;

/** Small key/value store for sync bookkeeping. */
export class SyncStateRepository {
  constructor(private readonly db: SqlDriver) {}

  async get(
    key: SyncStateKey,
    ex: SqlExecutor = this.db,
  ): Promise<string | null> {
    const result = await ex.execute(
      'SELECT value FROM sync_state WHERE key = ?',
      [key],
    );
    const value = result.rows[0]?.value;
    return typeof value === 'string' ? value : null;
  }

  async set(
    key: SyncStateKey,
    value: string,
    ex: SqlExecutor = this.db,
  ): Promise<void> {
    await ex.execute(
      `INSERT INTO sync_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  /** Stable per-install id; the node id inside every HLC this device issues. */
  async getOrCreateDeviceId(ids: IdGenerator): Promise<string> {
    return this.db.transaction(async tx => {
      const existing = await this.get('device_id', tx);
      if (existing) {
        return existing;
      }
      const deviceId = ids.newId();
      await this.set('device_id', deviceId, tx);
      return deviceId;
    });
  }

  async getLastSyncedAt(): Promise<number | null> {
    const value = await this.get('last_synced_at');
    return value === null ? null : Number(value);
  }
}
