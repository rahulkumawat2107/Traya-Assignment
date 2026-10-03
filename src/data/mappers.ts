import type { MeasurementDto } from '@/api/dto';
import type {
  Measurement,
  MetricType,
  Source,
  SyncStatus,
} from '@/domain/measurement/types';
import type { OutboxOp, OutboxOpType } from '@/domain/sync/outboxCoalesce';
import type { MeasurementRow, OutboxRow } from './db/schema';
import type { SqlRow } from './db/SqlDriver';

export function rowToMeasurement(row: SqlRow): Measurement {
  const r = row as unknown as MeasurementRow;
  return {
    id: r.id,
    userId: r.user_id,
    metric: r.metric as MetricType,
    value: r.value,
    measuredAt: r.measured_at,
    source: r.source as Source,
    externalId: r.external_id,
    hlc: r.hlc,
    deletedAt: r.deleted_at,
    syncStatus: r.sync_status as SyncStatus,
  };
}

export function measurementToDto(m: Measurement): MeasurementDto {
  return {
    id: m.id,
    userId: m.userId,
    metric: m.metric,
    value: m.value,
    measuredAt: m.measuredAt,
    source: m.source,
    externalId: m.externalId,
    hlc: m.hlc,
    deletedAt: m.deletedAt,
  };
}

export function dtoToMeasurement(
  dto: MeasurementDto,
  syncStatus: SyncStatus,
): Measurement {
  return { ...dto, source: dto.source as Source, syncStatus };
}

export type OutboxStatus = 'pending' | 'in_flight' | 'failed';

export interface OutboxEntry extends OutboxOp<MeasurementDto> {
  status: OutboxStatus;
  nextAttemptAt: number;
  lastError: string | null;
}

export function rowToOutboxEntry(row: SqlRow): OutboxEntry {
  const r = row as unknown as OutboxRow;
  return {
    opId: r.op_id,
    entityId: r.entity_id,
    opType: r.op_type as OutboxOpType,
    payload: JSON.parse(r.payload) as MeasurementDto,
    hlc: r.hlc,
    status: r.status as OutboxStatus,
    attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at,
    lastError: r.last_error,
    createdAt: r.created_at,
  };
}
