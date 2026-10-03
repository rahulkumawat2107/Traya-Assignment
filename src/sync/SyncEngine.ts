import type { ApiClient } from '@/api/ApiClient';
import type { MeasurementDto, PushOpDto, PushResponseDto } from '@/api/dto';
import type { SqlDriver } from '@/data/db/SqlDriver';
import type { OutboxEntry } from '@/data/mappers';
import type { MeasurementRepository } from '@/data/repositories/MeasurementRepository';
import type { OutboxRepository } from '@/data/repositories/OutboxRepository';
import type { SyncStateRepository } from '@/data/repositories/SyncStateRepository';
import { errorMessage, isRetryable } from '@/domain/errors';
import {
  computeBackoffMs,
  DEFAULT_BACKOFF,
  type BackoffOptions,
} from '@/domain/sync/backoff';
import { coalesceOutbox, type CoalescedOp } from '@/domain/sync/outboxCoalesce';
import type { Clock } from '@/shared/services/Clock';
import type { NetworkMonitor } from '@/shared/services/NetworkMonitor';
import type { SyncRunOptions, SyncRunResult, SyncStatus } from './types';

export interface SyncEngineDeps {
  db: SqlDriver;
  outbox: OutboxRepository;
  measurements: MeasurementRepository;
  syncState: SyncStateRepository;
  api: ApiClient;
  network: NetworkMonitor;
  clock: Clock;
  /** Receives status changes; the app forwards them to the UI store. */
  onStatus?: (patch: Partial<SyncStatus>) => void;
  /** Called when a run changed local data, so screens can refresh. */
  onDataChanged?: () => void;
  backoff?: BackoffOptions;
  random?: () => number;
  /** Records per push request. */
  batchSize?: number;
  pullPageSize?: number;
}

/** Upper bound on queued ops read per loop, to keep memory flat. */
const OUTBOX_READ_LIMIT = 500;

/**
 * Moves local changes to the server and remote changes to the device.
 *
 * Push then pull, never concurrently with itself. The engine holds no state
 * of its own that matters: everything it needs to resume is in the outbox
 * and sync_state tables, so being killed at any point is safe.
 */
export class SyncEngine {
  private readonly deps: SyncEngineDeps;
  private readonly backoff: BackoffOptions;
  private readonly random: () => number;
  private readonly batchSize: number;
  private readonly pullPageSize: number;

  private current: Promise<SyncRunResult> | null = null;
  private rerunRequested = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(deps: SyncEngineDeps) {
    this.deps = deps;
    this.backoff = deps.backoff ?? DEFAULT_BACKOFF;
    this.random = deps.random ?? Math.random;
    this.batchSize = deps.batchSize ?? 50;
    this.pullPageSize = deps.pullPageSize ?? 200;
  }

  /**
   * Runs a sync, or joins the one already in progress. Several triggers
   * firing at once (foreground + reconnect + a write) share a single run.
   */
  run(options: SyncRunOptions = {}): Promise<SyncRunResult> {
    if (this.current) {
      return this.current;
    }
    this.current = this.execute(options).finally(() => {
      this.current = null;
      if (this.rerunRequested && !this.disposed) {
        this.rerunRequested = false;
        this.run().catch(() => undefined);
      }
    });
    return this.current;
  }

  /**
   * For local writes. If a run is in progress the change may have missed its
   * push phase, so ask for one more run after it instead of joining it.
   */
  requestSync(): void {
    this.refreshCounts().catch(() => undefined);
    if (this.current) {
      this.rerunRequested = true;
      return;
    }
    this.run().catch(() => undefined);
  }

  /** Puts terminally failed changes back in the queue and syncs. */
  async retryFailed(): Promise<SyncRunResult> {
    const entityIds = await this.deps.outbox.retryFailed();
    for (const id of entityIds) {
      await this.deps.measurements.setSyncStatus(id, 'pending');
    }
    return this.run({ force: true });
  }

  async refreshCounts(): Promise<void> {
    const counts = await this.deps.outbox.counts();
    this.report({ pendingCount: counts.pending, failedCount: counts.failed });
  }

  dispose(): void {
    this.disposed = true;
    this.clearRetryTimer();
  }

  // ------------------------------------------------------------------------

  private async execute(options: SyncRunOptions): Promise<SyncRunResult> {
    const result: SyncRunResult = {
      ran: false,
      pushed: 0,
      rejected: 0,
      pulled: 0,
      error: null,
    };

    if (!this.deps.network.isOnline()) {
      this.report({ online: false, phase: 'idle' });
      await this.refreshCounts();
      return { ...result, skippedReason: 'offline' };
    }

    result.ran = true;
    this.clearRetryTimer();
    this.report({ phase: 'syncing', online: true, nextRetryAt: null });

    try {
      if (options.force) {
        await this.deps.outbox.clearBackoff();
      }
      await this.push(result);
      await this.pull(result);

      const now = this.deps.clock.now();
      await this.deps.syncState.set('last_synced_at', String(now));
      this.report({ phase: 'idle', lastSyncedAt: now, lastError: null });
    } catch (error) {
      result.error = errorMessage(error);
      this.report({ phase: 'error', lastError: result.error });
    }

    await this.refreshCounts();
    await this.scheduleRetry();
    if (result.pushed > 0 || result.pulled > 0 || result.rejected > 0) {
      this.deps.onDataChanged?.();
    }
    return result;
  }

  /**
   * Drains the outbox in batches. Loops until nothing is due, so changes
   * made while a batch was in flight are picked up by the same run.
   */
  private async push(result: SyncRunResult): Promise<void> {
    const { outbox, clock } = this.deps;

    for (;;) {
      const pending = await outbox.getPending(OUTBOX_READ_LIMIT);
      if (pending.length === 0) {
        return;
      }
      const entries = new Map(pending.map(entry => [entry.opId, entry]));
      const { ops, droppedOpIds } = coalesceOutbox(pending);
      await outbox.remove(droppedOpIds);

      const now = clock.now();
      const due = ops.filter(op =>
        op.sourceOpIds.every(
          id => (entries.get(id)?.nextAttemptAt ?? 0) <= now,
        ),
      );
      if (due.length === 0) {
        return;
      }

      const batch = due.slice(0, this.batchSize);
      const sourceOpIds = batch.flatMap(op => op.sourceOpIds);
      // Recorded before the request leaves: if the app dies now, these ops
      // are known to have possibly reached the server.
      await outbox.markInFlight(sourceOpIds);

      let response: PushResponseDto;
      try {
        response = await this.deps.api.pushOps(batch.map(toPushOp));
      } catch (error) {
        const message = errorMessage(error);
        if (isRetryable(error)) {
          const attempts = maxAttempts(batch, entries) + 1;
          const delay = computeBackoffMs(attempts, this.backoff, this.random);
          await outbox.markForRetry(sourceOpIds, clock.now() + delay, message);
          // The connection is the problem; the rest of the run would fail too.
          throw error;
        }
        await this.rejectBatch(batch, message);
        result.rejected += batch.length;
        continue;
      }

      await this.applyPushResults(batch, response, entries, result);
    }
  }

  private async applyPushResults(
    batch: CoalescedOp<MeasurementDto>[],
    response: PushResponseDto,
    entries: Map<string, OutboxEntry>,
    result: SyncRunResult,
  ): Promise<void> {
    const { db, outbox, measurements, clock } = this.deps;
    const byOpId = new Map(response.results.map(r => [r.opId, r]));

    await db.transaction(async tx => {
      for (const op of batch) {
        const opResult = byOpId.get(op.opId);

        if (!opResult) {
          // The server did not account for this op; treat it as not sent.
          const delay = computeBackoffMs(
            maxAttempts([op], entries) + 1,
            this.backoff,
            this.random,
          );
          await outbox.markForRetry(
            op.sourceOpIds,
            clock.now() + delay,
            'No result returned for this change',
            tx,
          );
          continue;
        }

        if (opResult.status === 'rejected') {
          const reason = opResult.error ?? 'Rejected by the server';
          await outbox.markFailed(op.sourceOpIds, reason, tx);
          await measurements.setSyncStatus(op.entityId, 'failed', tx);
          result.rejected += 1;
          continue;
        }

        await outbox.remove(op.sourceOpIds, tx);
        if (opResult.status === 'stale' && opResult.record) {
          // The server holds a newer version (another device won). Take it,
          // through the same resolver as any pulled change.
          await measurements.applyRemote(opResult.record, tx);
        }
        // No-op if the row was edited again while the request was in flight;
        // that edit has its own op and keeps the row pending.
        await measurements.markSynced(op.entityId, op.hlc, tx);
        result.pushed += 1;
      }
    });
  }

  private async rejectBatch(
    batch: CoalescedOp<MeasurementDto>[],
    message: string,
  ): Promise<void> {
    const { db, outbox, measurements } = this.deps;
    await db.transaction(async tx => {
      for (const op of batch) {
        await outbox.markFailed(op.sourceOpIds, message, tx);
        await measurements.setSyncStatus(op.entityId, 'failed', tx);
      }
    });
  }

  /**
   * Fetches changes since the stored cursor. Each page and its cursor are
   * committed together, so a crash mid-pull resumes exactly where it stopped
   * and re-applying a page is harmless.
   */
  private async pull(result: SyncRunResult): Promise<void> {
    const { db, api, measurements, syncState } = this.deps;
    let cursor = await syncState.get('pull_cursor');

    for (;;) {
      const page = await api.pullChanges(cursor, this.pullPageSize);
      const applied = await db.transaction(async tx => {
        let count = 0;
        for (const change of page.changes) {
          if (await measurements.applyRemote(change, tx)) {
            count += 1;
          }
        }
        await syncState.set('pull_cursor', page.cursor, tx);
        return count;
      });
      result.pulled += applied;
      cursor = page.cursor;
      if (!page.hasMore) {
        return;
      }
    }
  }

  private async scheduleRetry(): Promise<void> {
    this.clearRetryTimer();
    if (this.disposed) {
      return;
    }
    const nextAttemptAt = await this.deps.outbox.nextAttemptAt();
    const now = this.deps.clock.now();
    if (nextAttemptAt === null || nextAttemptAt <= now) {
      this.report({ nextRetryAt: null });
      return;
    }
    this.report({ nextRetryAt: nextAttemptAt });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.run().catch(() => undefined);
    }, nextAttemptAt - now);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private report(patch: Partial<SyncStatus>): void {
    this.deps.onStatus?.(patch);
  }
}

function toPushOp(op: CoalescedOp<MeasurementDto>): PushOpDto {
  return { opId: op.opId, opType: op.opType, record: op.payload };
}

function maxAttempts(
  batch: CoalescedOp<MeasurementDto>[],
  entries: Map<string, OutboxEntry>,
): number {
  let max = 0;
  for (const op of batch) {
    for (const id of op.sourceOpIds) {
      max = Math.max(max, entries.get(id)?.attempts ?? 0);
    }
  }
  return max;
}
