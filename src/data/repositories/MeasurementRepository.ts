import type { MeasurementDto } from '@/api/dto';
import { TerminalError } from '@/domain/errors';
import { pickEffectiveReading } from '@/domain/measurement/effectiveValue';
import {
  DAY_MS,
  dayIndexToMs,
  localDayIndex,
  type SeriesWindow,
} from '@/domain/measurement/range';
import {
  MANUAL_SOURCE,
  METRIC_TYPES,
  type Measurement,
  type MetricType,
  type SeriesPoint,
  type Source,
} from '@/domain/measurement/types';
import { resolveConflict } from '@/domain/sync/conflictResolver';
import type { HlcClock } from '@/domain/sync/hlc';
import type { Clock } from '@/shared/services/Clock';
import type { IdGenerator } from '@/shared/services/IdGenerator';
import {
  placeholders,
  type SqlDriver,
  type SqlExecutor,
} from '../db/SqlDriver';
import {
  dtoToMeasurement,
  measurementToDto,
  rowToMeasurement,
} from '../mappers';
import type { OutboxRepository } from './OutboxRepository';

export interface NewMeasurement {
  metric: MetricType;
  value: number;
  measuredAt: number;
}

export interface MeasurementPatch {
  value: number;
  measuredAt: number;
}

export interface ImportedReading extends NewMeasurement {
  source: Source;
  externalId: string;
}

export type ImportOutcome = 'imported' | 'updated' | 'skipped';

export interface HistoryCursor {
  measuredAt: number;
  id: string;
}

export interface HistoryPage {
  items: Measurement[];
  /** Pass to the next call; null when there are no more rows. */
  nextCursor: HistoryCursor | null;
}

/**
 * How several readings on one day collapse into the day's value.
 * - effective: manual beats device, then latest (see effectiveValue.ts).
 * - max: providers report running daily totals, so the largest is the total
 *   and two providers counting the same steps are not added together.
 */
type DailyRule = 'effective' | 'max';

const DAILY_RULE: Record<MetricType, DailyRule> = {
  weight: 'effective',
  steps: 'max',
  sleep: 'max',
  calories: 'max',
  water: 'max',
  workout: 'max',
};

// Bound numbers can arrive as floats; the casts keep the division integral.
const DAY_EXPR = `CAST((measured_at + CAST(? AS INTEGER)) / ${DAY_MS} AS INTEGER)`;

export interface MeasurementRepositoryDeps {
  db: SqlDriver;
  outbox: OutboxRepository;
  hlc: HlcClock;
  ids: IdGenerator;
  clock: Clock;
  userId: string;
}

export class MeasurementRepository {
  private readonly db: SqlDriver;
  private readonly outbox: OutboxRepository;
  private readonly hlc: HlcClock;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;
  private readonly userId: string;

  constructor(deps: MeasurementRepositoryDeps) {
    this.db = deps.db;
    this.outbox = deps.outbox;
    this.hlc = deps.hlc;
    this.ids = deps.ids;
    this.clock = deps.clock;
    this.userId = deps.userId;
  }

  // --- Local writes: row + outbox op in one transaction -------------------

  create(input: NewMeasurement): Promise<Measurement> {
    return this.db.transaction(tx =>
      this.insertLocal(tx, {
        ...input,
        id: this.ids.newId(),
        source: MANUAL_SOURCE,
        externalId: null,
      }),
    );
  }

  update(id: string, patch: MeasurementPatch): Promise<Measurement> {
    return this.db.transaction(async tx => {
      const existing = await this.getById(id, tx);
      if (!existing || existing.deletedAt !== null) {
        throw new TerminalError(`Measurement ${id} no longer exists`);
      }
      return this.updateLocal(tx, existing, patch);
    });
  }

  /** Soft delete: the tombstone has to sync like any other change. */
  remove(id: string): Promise<void> {
    return this.db.transaction(async tx => {
      const existing = await this.getById(id, tx);
      if (!existing || existing.deletedAt !== null) {
        return;
      }
      const deleted: Measurement = {
        ...existing,
        deletedAt: this.clock.now(),
        hlc: this.hlc.next(),
        syncStatus: 'pending',
      };
      await this.writeRow(deleted, tx);
      await this.outbox.enqueue('delete', measurementToDto(deleted), tx);
    });
  }

  /**
   * Stores a reading from a health provider.
   *
   * The id is derived from the provider's own record id, so importing the
   * same reading twice - or on two devices - converges on one record instead
   * of creating duplicates.
   */
  upsertImported(reading: ImportedReading): Promise<ImportOutcome> {
    const id = `${reading.source}:${reading.externalId}`;
    return this.db.transaction(async tx => {
      const existing = await this.getById(id, tx);
      if (!existing) {
        await this.insertLocal(tx, { ...reading, id });
        return 'imported';
      }
      if (existing.deletedAt !== null) {
        // The user removed this reading; a re-import must not bring it back.
        return 'skipped';
      }
      if (
        existing.value === reading.value &&
        existing.measuredAt === reading.measuredAt
      ) {
        return 'skipped';
      }
      await this.updateLocal(tx, existing, reading);
      return 'updated';
    });
  }

  // --- Sync-side writes: no outbox op ------------------------------------

  /**
   * Applies a version received from the server if it is newer than what we
   * hold. Returns whether the local row changed.
   */
  async applyRemote(remote: MeasurementDto, ex: SqlExecutor): Promise<boolean> {
    this.hlc.observe(remote.hlc);
    const local = await this.getById(remote.id, ex);
    if (resolveConflict(local, remote) === 'keep_existing') {
      return false;
    }
    await this.writeRow(dtoToMeasurement(remote, 'synced'), ex);
    return true;
  }

  /**
   * Marks a row synced only if it still carries the version that was pushed.
   * If the user edited it again mid-request, it stays pending.
   */
  async markSynced(id: string, hlc: string, ex: SqlExecutor): Promise<void> {
    await ex.execute(
      `UPDATE measurements SET sync_status = 'synced' WHERE id = ? AND hlc = ?`,
      [id, hlc],
    );
  }

  async setSyncStatus(
    id: string,
    status: 'pending' | 'failed',
    ex: SqlExecutor = this.db,
  ): Promise<void> {
    await ex.execute(
      `UPDATE measurements SET sync_status = ? WHERE id = ? AND sync_status != 'synced'`,
      [status, id],
    );
  }

  // --- Reads --------------------------------------------------------------

  async getById(
    id: string,
    ex: SqlExecutor = this.db,
  ): Promise<Measurement | null> {
    const result = await ex.execute('SELECT * FROM measurements WHERE id = ?', [
      id,
    ]);
    const row = result.rows[0];
    return row ? rowToMeasurement(row) : null;
  }

  /**
   * Keyset pagination, newest first. Unlike OFFSET, the cost of a page does
   * not grow with how far the user has scrolled, and rows inserted while
   * scrolling cannot shift or duplicate items.
   */
  async getHistoryPage(
    metric: MetricType,
    limit: number,
    cursor: HistoryCursor | null = null,
  ): Promise<HistoryPage> {
    const params: (string | number)[] = [this.userId, metric];
    let cursorClause = '';
    if (cursor) {
      cursorClause = 'AND (measured_at < ? OR (measured_at = ? AND id < ?))';
      params.push(cursor.measuredAt, cursor.measuredAt, cursor.id);
    }
    params.push(limit + 1);

    const result = await this.db.execute(
      `SELECT * FROM measurements
       WHERE user_id = ? AND metric = ? AND deleted_at IS NULL ${cursorClause}
       ORDER BY measured_at DESC, id DESC
       LIMIT ?`,
      params,
    );
    const rows = result.rows.map(rowToMeasurement);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return {
      items,
      nextCursor:
        hasMore && last ? { measuredAt: last.measuredAt, id: last.id } : null,
    };
  }

  /**
   * One value per bucket for a time window, computed in SQL so the JS thread
   * only ever receives a handful of points however large the table is.
   *
   * Each day is first reduced to a single value (see DAILY_RULE), then days
   * are averaged into buckets of `bucketDays`. Empty buckets are omitted.
   */
  async getSeries(
    metric: MetricType,
    window: SeriesWindow,
  ): Promise<SeriesPoint[]> {
    const firstDay = localDayIndex(window.from, window.tzOffsetMs);
    const filter = `user_id = ? AND metric = ? AND deleted_at IS NULL
      AND measured_at >= ? AND measured_at < ?`;
    const filterParams = [this.userId, metric, window.from, window.to];

    const daily =
      DAILY_RULE[metric] === 'effective'
        ? {
            sql: `SELECT day, value FROM (
                SELECT value, ${DAY_EXPR} AS day,
                  ROW_NUMBER() OVER (
                    PARTITION BY ${DAY_EXPR}
                    ORDER BY (source = '${MANUAL_SOURCE}') DESC, measured_at DESC, hlc DESC
                  ) AS rn
                FROM measurements WHERE ${filter}
              ) WHERE rn = 1`,
            params: [window.tzOffsetMs, window.tzOffsetMs, ...filterParams],
          }
        : {
            sql: `SELECT ${DAY_EXPR} AS day, MAX(value) AS value
              FROM measurements WHERE ${filter} GROUP BY day`,
            params: [window.tzOffsetMs, ...filterParams],
          };

    const result = await this.db.execute(
      `WITH daily AS (${daily.sql})
       SELECT (day - CAST(? AS INTEGER)) / CAST(? AS INTEGER) AS bucket,
              AVG(value) AS value
       FROM daily GROUP BY bucket ORDER BY bucket`,
      [...daily.params, firstDay, window.bucketDays],
    );

    return result.rows.map(row => ({
      t: dayIndexToMs(
        firstDay + Number(row.bucket) * window.bucketDays,
        window.tzOffsetMs,
      ),
      value: Number(row.value),
    }));
  }

  /**
   * The reading that represents the most recent day with data. Two indexed
   * lookups: find the newest row, then apply the daily rule to that day only.
   */
  async getLatestEffective(
    metric: MetricType,
    tzOffsetMs: number,
  ): Promise<Measurement | null> {
    const newest = await this.db.execute(
      `SELECT measured_at FROM measurements
       WHERE user_id = ? AND metric = ? AND deleted_at IS NULL
       ORDER BY measured_at DESC LIMIT 1`,
      [this.userId, metric],
    );
    const newestAt = newest.rows[0]?.measured_at;
    if (newestAt === undefined || newestAt === null) {
      return null;
    }
    const day = localDayIndex(Number(newestAt), tzOffsetMs);
    const result = await this.db.execute(
      `SELECT * FROM measurements
       WHERE user_id = ? AND metric = ? AND deleted_at IS NULL
         AND measured_at >= ? AND measured_at < ?`,
      [
        this.userId,
        metric,
        dayIndexToMs(day, tzOffsetMs),
        dayIndexToMs(day + 1, tzOffsetMs),
      ],
    );
    return pickDailyReading(metric, result.rows.map(rowToMeasurement));
  }

  /**
   * Today's value for every metric in one query. A metric with no reading
   * today is simply absent from the result.
   */
  async getToday(
    now: number,
    tzOffsetMs: number,
  ): Promise<Partial<Record<MetricType, Measurement>>> {
    const day = localDayIndex(now, tzOffsetMs);
    // `metric IN (...)` keeps the (user_id, metric, measured_at) index usable.
    const result = await this.db.execute(
      `SELECT * FROM measurements
       WHERE user_id = ? AND metric IN (${placeholders(METRIC_TYPES.length)})
         AND deleted_at IS NULL AND measured_at >= ? AND measured_at < ?`,
      [
        this.userId,
        ...METRIC_TYPES,
        dayIndexToMs(day, tzOffsetMs),
        dayIndexToMs(day + 1, tzOffsetMs),
      ],
    );
    const byMetric = new Map<MetricType, Measurement[]>();
    for (const reading of result.rows.map(rowToMeasurement)) {
      const list = byMetric.get(reading.metric);
      if (list) {
        list.push(reading);
      } else {
        byMetric.set(reading.metric, [reading]);
      }
    }
    const today: Partial<Record<MetricType, Measurement>> = {};
    for (const [metric, readings] of byMetric) {
      const picked = pickDailyReading(metric, readings);
      if (picked) {
        today[metric] = picked;
      }
    }
    return today;
  }

  async count(metric?: MetricType): Promise<number> {
    const result = await this.db.execute(
      `SELECT COUNT(*) AS n FROM measurements
       WHERE user_id = ? AND deleted_at IS NULL ${
         metric ? 'AND metric = ?' : ''
       }`,
      metric ? [this.userId, metric] : [this.userId],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  /** Highest HLC stored locally; used to restore the clock after a restart. */
  async maxHlc(): Promise<string | null> {
    const result = await this.db.execute(
      'SELECT MAX(hlc) AS hlc FROM measurements',
    );
    const hlc = result.rows[0]?.hlc;
    return typeof hlc === 'string' ? hlc : null;
  }

  /**
   * Bulk insert for the performance seed. Rows go in as already synced with
   * no outbox ops, so seeding years of data does not flood the sync queue.
   */
  async insertSeed(readings: ImportedReading[]): Promise<void> {
    await this.db.transaction(async tx => {
      for (const reading of readings) {
        await this.writeRow(
          {
            ...reading,
            id: `${reading.source}:${reading.externalId}`,
            userId: this.userId,
            hlc: this.hlc.next(),
            deletedAt: null,
            syncStatus: 'synced',
          },
          tx,
          'IGNORE',
        );
      }
    });
  }

  // --- Internals ----------------------------------------------------------

  private async insertLocal(
    tx: SqlExecutor,
    input: NewMeasurement & {
      id: string;
      source: Source;
      externalId: string | null;
    },
  ): Promise<Measurement> {
    const measurement: Measurement = {
      id: input.id,
      userId: this.userId,
      metric: input.metric,
      value: input.value,
      measuredAt: input.measuredAt,
      source: input.source,
      externalId: input.externalId,
      hlc: this.hlc.next(),
      deletedAt: null,
      syncStatus: 'pending',
    };
    await this.writeRow(measurement, tx);
    await this.outbox.enqueue('create', measurementToDto(measurement), tx);
    return measurement;
  }

  private async updateLocal(
    tx: SqlExecutor,
    existing: Measurement,
    patch: MeasurementPatch,
  ): Promise<Measurement> {
    const updated: Measurement = {
      ...existing,
      value: patch.value,
      measuredAt: patch.measuredAt,
      hlc: this.hlc.next(),
      syncStatus: 'pending',
    };
    await this.writeRow(updated, tx);
    await this.outbox.enqueue('update', measurementToDto(updated), tx);
    return updated;
  }

  private async writeRow(
    m: Measurement,
    ex: SqlExecutor,
    onConflict: 'UPDATE' | 'IGNORE' = 'UPDATE',
  ): Promise<void> {
    const conflict =
      onConflict === 'IGNORE'
        ? 'ON CONFLICT DO NOTHING'
        : `ON CONFLICT(id) DO UPDATE SET
            metric = excluded.metric,
            value = excluded.value,
            measured_at = excluded.measured_at,
            source = excluded.source,
            external_id = excluded.external_id,
            hlc = excluded.hlc,
            deleted_at = excluded.deleted_at,
            sync_status = excluded.sync_status`;
    await ex.execute(
      `INSERT INTO measurements
        (id, user_id, metric, value, measured_at, source, external_id, hlc, deleted_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ${conflict}`,
      [
        m.id,
        m.userId,
        m.metric,
        m.value,
        m.measuredAt,
        m.source,
        m.externalId,
        m.hlc,
        m.deletedAt,
        m.syncStatus,
      ],
    );
  }
}

/** Reduces one day's readings for a metric to the one that represents it. */
function pickDailyReading(
  metric: MetricType,
  readings: Measurement[],
): Measurement | null {
  if (DAILY_RULE[metric] === 'effective') {
    return pickEffectiveReading(readings) ?? null;
  }
  return readings.reduce<Measurement | null>(
    (best, reading) => (!best || reading.value > best.value ? reading : best),
    null,
  );
}
