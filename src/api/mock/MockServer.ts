import { resolveConflict } from '@/domain/sync/conflictResolver';
import {
  isMeasurementDto,
  type MeasurementDto,
  type PullResponseDto,
  type PushOpDto,
  type PushOpResultDto,
  type PushResponseDto,
} from '../dto';

/** Where the mock server keeps its state between app launches. */
export interface MockServerStorage {
  load(): Promise<string | null>;
  save(serialized: string): Promise<void>;
}

interface StoredRecord {
  record: MeasurementDto;
  /** Position in the change feed of the last accepted write. */
  seq: number;
}

interface ServerState {
  seq: number;
  records: Record<string, StoredRecord>;
  processedOps: Record<string, PushOpResultDto>;
}

const VALUE_LIMITS: Record<string, [number, number]> = {
  weight: [1, 500],
  steps: [0, 200_000],
  sleep: [0, 1440],
  calories: [0, 20_000],
  water: [0, 20_000],
  workout: [0, 1440],
};

/**
 * In-process stand-in for the backend. It implements the three guarantees
 * the client relies on:
 *
 * 1. Idempotency: an op id is processed once; a replay returns the original
 *    result without touching the data.
 * 2. Ordering by HLC, not arrival: a write older than the stored version is
 *    reported as `stale` and changes nothing.
 * 3. A change feed with a monotonically increasing cursor, including
 *    tombstones, so any device can catch up from where it left off.
 */
export class MockServer {
  private state: ServerState = { seq: 0, records: {}, processedOps: {} };

  constructor(private readonly storage?: MockServerStorage) {}

  async load(): Promise<void> {
    const serialized = await this.storage?.load();
    if (serialized) {
      try {
        this.state = JSON.parse(serialized) as ServerState;
      } catch {
        // Corrupt mock state is not worth failing startup over.
      }
    }
  }

  async push(ops: PushOpDto[]): Promise<PushResponseDto> {
    const results = ops.map(op => this.applyOp(op));
    await this.persist();
    return { results };
  }

  async pull(cursor: string | null, limit: number): Promise<PullResponseDto> {
    const after = cursor === null ? 0 : Number(cursor);
    const pending = Object.values(this.state.records)
      .filter(stored => stored.seq > after)
      .sort((a, b) => a.seq - b.seq);
    const page = pending.slice(0, limit);
    const last = page[page.length - 1];
    return {
      changes: page.map(stored => stored.record),
      cursor: String(last ? last.seq : after),
      hasMore: pending.length > page.length,
    };
  }

  /**
   * Writes a record as if another device had synced it. Used by the debug
   * screen and by tests to exercise the pull path and conflict resolution.
   */
  async injectRemoteChange(record: MeasurementDto): Promise<boolean> {
    const applied = this.store(record);
    await this.persist();
    return applied;
  }

  getRecord(id: string): MeasurementDto | undefined {
    return this.state.records[id]?.record;
  }

  recordCount(): number {
    return Object.keys(this.state.records).length;
  }

  async reset(): Promise<void> {
    this.state = { seq: 0, records: {}, processedOps: {} };
    await this.persist();
  }

  private applyOp(op: PushOpDto): PushOpResultDto {
    const previous = this.state.processedOps[op.opId];
    if (previous) {
      return previous;
    }

    const result = this.evaluate(op);
    this.state.processedOps[op.opId] = result;
    return result;
  }

  private evaluate(op: PushOpDto): PushOpResultDto {
    const { record } = op;
    if (!isMeasurementDto(record)) {
      return { opId: op.opId, status: 'rejected', error: 'Malformed record' };
    }
    const limits = VALUE_LIMITS[record.metric];
    if (limits && (record.value < limits[0] || record.value > limits[1])) {
      return {
        opId: op.opId,
        status: 'rejected',
        error: `${record.metric} must be between ${limits[0]} and ${limits[1]}`,
      };
    }

    const applied = this.store(record);
    return {
      opId: op.opId,
      status: applied ? 'applied' : 'stale',
      record: this.state.records[record.id]?.record,
    };
  }

  /** Create, update and delete are all "store this version if it is newer". */
  private store(record: MeasurementDto): boolean {
    const existing = this.state.records[record.id]?.record;
    if (resolveConflict(existing, record) === 'keep_existing') {
      return false;
    }
    this.state.seq += 1;
    this.state.records[record.id] = { record, seq: this.state.seq };
    return true;
  }

  private async persist(): Promise<void> {
    await this.storage?.save(JSON.stringify(this.state));
  }
}
