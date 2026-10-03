import { isValidHlc } from '@/domain/sync/hlc';
import { isMetricType, type MetricType } from '@/domain/measurement/types';
import type { OutboxOpType } from '@/domain/sync/outboxCoalesce';

/** Wire format of a measurement. Also the payload stored in the outbox. */
export interface MeasurementDto {
  id: string;
  userId: string;
  metric: MetricType;
  value: number;
  measuredAt: number;
  source: string;
  externalId: string | null;
  hlc: string;
  deletedAt: number | null;
}

export interface PushOpDto {
  /** Idempotency key. */
  opId: string;
  opType: OutboxOpType;
  record: MeasurementDto;
}

export type PushOpStatus = 'applied' | 'stale' | 'rejected';

export interface PushOpResultDto {
  opId: string;
  status: PushOpStatus;
  /** Server's current version; present for `applied` and `stale`. */
  record?: MeasurementDto;
  /** Reason, present for `rejected`. */
  error?: string;
}

export interface PushResponseDto {
  results: PushOpResultDto[];
}

export interface PullResponseDto {
  changes: MeasurementDto[];
  /** Opaque position to pass to the next pull. */
  cursor: string;
  hasMore: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Data from the network is untrusted: validate before it reaches the DB. */
export function isMeasurementDto(value: unknown): value is MeasurementDto {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.userId === 'string' &&
    isMetricType(value.metric) &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value) &&
    typeof value.measuredAt === 'number' &&
    Number.isFinite(value.measuredAt) &&
    typeof value.source === 'string' &&
    (value.externalId === null || typeof value.externalId === 'string') &&
    isValidHlc(value.hlc) &&
    (value.deletedAt === null || typeof value.deletedAt === 'number')
  );
}

export function parsePullResponse(value: unknown): PullResponseDto {
  if (
    !isRecord(value) ||
    !Array.isArray(value.changes) ||
    typeof value.cursor !== 'string' ||
    typeof value.hasMore !== 'boolean'
  ) {
    throw new Error('Malformed pull response');
  }
  // One bad record must not block the rest of the page.
  return {
    changes: value.changes.filter(isMeasurementDto),
    cursor: value.cursor,
    hasMore: value.hasMore,
  };
}

const PUSH_STATUSES: readonly string[] = ['applied', 'stale', 'rejected'];

export function parsePushResponse(value: unknown): PushResponseDto {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    throw new Error('Malformed push response');
  }
  const results: PushOpResultDto[] = [];
  for (const item of value.results) {
    if (
      !isRecord(item) ||
      typeof item.opId !== 'string' ||
      typeof item.status !== 'string' ||
      !PUSH_STATUSES.includes(item.status)
    ) {
      throw new Error('Malformed push result');
    }
    results.push({
      opId: item.opId,
      status: item.status as PushOpStatus,
      record: isMeasurementDto(item.record) ? item.record : undefined,
      error: typeof item.error === 'string' ? item.error : undefined,
    });
  }
  return { results };
}
