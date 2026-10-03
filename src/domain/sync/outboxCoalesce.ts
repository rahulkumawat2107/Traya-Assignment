export type OutboxOpType = 'create' | 'update' | 'delete';

export interface OutboxOp<P = unknown> {
  /** Also the idempotency key sent to the server. */
  opId: string;
  entityId: string;
  opType: OutboxOpType;
  payload: P;
  hlc: string;
  /** How many times this op has been handed to the network. */
  attempts: number;
  createdAt: number;
}

export interface CoalescedOp<P = unknown> {
  opId: string;
  entityId: string;
  opType: OutboxOpType;
  payload: P;
  hlc: string;
  /** Every queued op this one stands for; all are cleared on success. */
  sourceOpIds: string[];
}

export interface CoalesceResult<P = unknown> {
  /** One op per entity, in the order the entities were first touched. */
  ops: CoalescedOp<P>[];
  /** Ops that cancel out locally and never need to reach the server. */
  droppedOpIds: string[];
}

/**
 * Collapse the queued ops for each entity into the single op that describes
 * its final state, so a long offline session costs one request per record.
 *
 *   create + update(s)          -> create   (with the latest payload)
 *   update + update             -> update   (latest payload)
 *   update + delete             -> delete
 *   create + delete             -> nothing  (the server never saw the record)
 *
 * The last rule only holds if the create was never sent. If it has been
 * attempted (`attempts > 0`), the request may have landed before the app was
 * killed, so the delete is sent to be safe; deleting an unknown record is a
 * no-op on the server.
 *
 * The coalesced op reuses the opId of the newest source op, so retrying the
 * same backlog reuses the same idempotency key.
 *
 * `ops` must be ordered oldest first.
 */
export function coalesceOutbox<P>(ops: OutboxOp<P>[]): CoalesceResult<P> {
  const byEntity = new Map<string, OutboxOp<P>[]>();
  for (const op of ops) {
    const list = byEntity.get(op.entityId);
    if (list) {
      list.push(op);
    } else {
      byEntity.set(op.entityId, [op]);
    }
  }

  const result: CoalesceResult<P> = { ops: [], droppedOpIds: [] };

  for (const entityOps of byEntity.values()) {
    const first = entityOps[0]!;
    const last = entityOps[entityOps.length - 1]!;
    const sourceOpIds = entityOps.map(op => op.opId);
    const createOp = entityOps.find(op => op.opType === 'create');

    if (createOp && last.opType === 'delete' && createOp.attempts === 0) {
      result.droppedOpIds.push(...sourceOpIds);
      continue;
    }

    let opType: OutboxOpType = last.opType;
    if (last.opType !== 'delete' && first.opType === 'create') {
      opType = 'create';
    }

    result.ops.push({
      opId: last.opId,
      entityId: last.entityId,
      opType,
      payload: last.payload,
      hlc: last.hlc,
      sourceOpIds,
    });
  }

  return result;
}
