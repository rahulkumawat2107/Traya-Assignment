import type { MeasurementDto } from '@/api/dto';
import type { OutboxOpType } from '@/domain/sync/outboxCoalesce';
import type { Clock } from '@/shared/services/Clock';
import type { IdGenerator } from '@/shared/services/IdGenerator';
import {
  placeholders,
  type SqlDriver,
  type SqlExecutor,
} from '../db/SqlDriver';
import { rowToOutboxEntry, type OutboxEntry } from '../mappers';

export interface OutboxCounts {
  pending: number;
  failed: number;
}

/**
 * Durable queue of local changes waiting to reach the server.
 *
 * Rows are only ever inserted by MeasurementRepository inside the same
 * transaction as the change they describe, which is what makes the queue
 * trustworthy after a crash.
 */
export class OutboxRepository {
  constructor(
    private readonly db: SqlDriver,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async enqueue(
    opType: OutboxOpType,
    record: MeasurementDto,
    ex: SqlExecutor,
  ): Promise<string> {
    const opId = this.ids.newId();
    await ex.execute(
      `INSERT INTO outbox
        (op_id, entity_id, op_type, payload, hlc, status, attempts, next_attempt_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, 0, ?)`,
      [
        opId,
        record.id,
        opType,
        JSON.stringify(record),
        record.hlc,
        this.clock.now(),
      ],
    );
    return opId;
  }

  /** Pending ops, oldest first. Insertion order (rowid) is the queue order. */
  async getPending(limit: number): Promise<OutboxEntry[]> {
    const result = await this.db.execute(
      `SELECT * FROM outbox WHERE status = 'pending' ORDER BY rowid LIMIT ?`,
      [limit],
    );
    return result.rows.map(rowToOutboxEntry);
  }

  /** Every op, oldest first. Used by the debug screen. */
  async list(limit = 200): Promise<OutboxEntry[]> {
    const result = await this.db.execute(
      'SELECT * FROM outbox ORDER BY rowid LIMIT ?',
      [limit],
    );
    return result.rows.map(rowToOutboxEntry);
  }

  /**
   * Marks ops as handed to the network. `attempts` is bumped here, before
   * the request, so an op that was in flight when the app died is known to
   * have possibly reached the server.
   */
  async markInFlight(
    opIds: string[],
    ex: SqlExecutor = this.db,
  ): Promise<void> {
    if (opIds.length === 0) {
      return;
    }
    await ex.execute(
      `UPDATE outbox SET status = 'in_flight', attempts = attempts + 1
       WHERE op_id IN (${placeholders(opIds.length)})`,
      opIds,
    );
  }

  async markForRetry(
    opIds: string[],
    nextAttemptAt: number,
    error: string,
    ex: SqlExecutor = this.db,
  ): Promise<void> {
    if (opIds.length === 0) {
      return;
    }
    await ex.execute(
      `UPDATE outbox SET status = 'pending', next_attempt_at = ?, last_error = ?
       WHERE op_id IN (${placeholders(opIds.length)})`,
      [nextAttemptAt, error, ...opIds],
    );
  }

  async markFailed(
    opIds: string[],
    error: string,
    ex: SqlExecutor = this.db,
  ): Promise<void> {
    if (opIds.length === 0) {
      return;
    }
    await ex.execute(
      `UPDATE outbox SET status = 'failed', last_error = ?
       WHERE op_id IN (${placeholders(opIds.length)})`,
      [error, ...opIds],
    );
  }

  async remove(opIds: string[], ex: SqlExecutor = this.db): Promise<void> {
    if (opIds.length === 0) {
      return;
    }
    await ex.execute(
      `DELETE FROM outbox WHERE op_id IN (${placeholders(opIds.length)})`,
      opIds,
    );
  }

  /**
   * Crash recovery. Anything still `in_flight` at startup belongs to a
   * request whose outcome we never learned; put it back in the queue. The
   * replay is safe because the server deduplicates by op id.
   */
  async resetInFlight(): Promise<number> {
    const result = await this.db.execute(
      `UPDATE outbox SET status = 'pending', next_attempt_at = 0
       WHERE status = 'in_flight'`,
    );
    return result.rowsAffected;
  }

  /** Gives terminally failed ops another chance. Returns affected entity ids. */
  async retryFailed(): Promise<string[]> {
    return this.db.transaction(async tx => {
      const failed = await tx.execute(
        `SELECT DISTINCT entity_id FROM outbox WHERE status = 'failed'`,
      );
      await tx.execute(
        `UPDATE outbox SET status = 'pending', attempts = 0, next_attempt_at = 0
         WHERE status = 'failed'`,
      );
      return failed.rows.map(row => String(row.entity_id));
    });
  }

  /** Makes every pending op due now, e.g. when connectivity returns. */
  async clearBackoff(): Promise<void> {
    await this.db.execute(
      `UPDATE outbox SET next_attempt_at = 0 WHERE status = 'pending'`,
    );
  }

  async counts(): Promise<OutboxCounts> {
    const result = await this.db.execute(
      `SELECT
         COUNT(DISTINCT CASE WHEN status != 'failed' THEN entity_id END) AS pending,
         COUNT(DISTINCT CASE WHEN status = 'failed' THEN entity_id END) AS failed
       FROM outbox`,
    );
    const row = result.rows[0];
    return {
      pending: Number(row?.pending ?? 0),
      failed: Number(row?.failed ?? 0),
    };
  }

  /** Earliest scheduled retry among pending ops, or null if none are waiting. */
  async nextAttemptAt(): Promise<number | null> {
    const result = await this.db.execute(
      `SELECT MIN(next_attempt_at) AS next FROM outbox WHERE status = 'pending'`,
    );
    const next = result.rows[0]?.next;
    return next === null || next === undefined ? null : Number(next);
  }
}
