import {
  coalesceOutbox,
  type OutboxOp,
  type OutboxOpType,
} from './outboxCoalesce';

let seq = 0;
function op(
  entityId: string,
  opType: OutboxOpType,
  payload: number,
  attempts = 0,
): OutboxOp<number> {
  seq += 1;
  return {
    opId: `op-${seq}`,
    entityId,
    opType,
    payload,
    hlc: `hlc-${seq}`,
    attempts,
    createdAt: seq,
  };
}

beforeEach(() => {
  seq = 0;
});

describe('coalesceOutbox', () => {
  it('folds create + update into one create with the latest payload', () => {
    const result = coalesceOutbox([
      op('a', 'create', 72.8),
      op('a', 'update', 72.6),
    ]);

    expect(result.droppedOpIds).toEqual([]);
    expect(result.ops).toEqual([
      {
        opId: 'op-2',
        entityId: 'a',
        opType: 'create',
        payload: 72.6,
        hlc: 'hlc-2',
        sourceOpIds: ['op-1', 'op-2'],
      },
    ]);
  });

  it('drops create + delete entirely when the create was never sent', () => {
    const result = coalesceOutbox([
      op('a', 'create', 1),
      op('a', 'update', 2),
      op('a', 'delete', 2),
    ]);

    expect(result.ops).toEqual([]);
    expect(result.droppedOpIds).toEqual(['op-1', 'op-2', 'op-3']);
  });

  it('still sends the delete when the create may already have reached the server', () => {
    const result = coalesceOutbox([
      op('a', 'create', 1, 1),
      op('a', 'delete', 1),
    ]);

    expect(result.droppedOpIds).toEqual([]);
    expect(result.ops).toHaveLength(1);
    expect(result.ops[0]).toMatchObject({
      opType: 'delete',
      opId: 'op-2',
      sourceOpIds: ['op-1', 'op-2'],
    });
  });

  it('folds update + delete into a delete', () => {
    const result = coalesceOutbox([op('a', 'update', 1), op('a', 'delete', 1)]);

    expect(result.ops).toHaveLength(1);
    expect(result.ops[0]).toMatchObject({ opType: 'delete', opId: 'op-2' });
  });

  it('folds repeated updates into the last one', () => {
    const result = coalesceOutbox([
      op('a', 'update', 1),
      op('a', 'update', 2),
      op('a', 'update', 3),
    ]);

    expect(result.ops).toHaveLength(1);
    expect(result.ops[0]).toMatchObject({ opType: 'update', payload: 3 });
  });

  it('leaves unrelated entities untouched and keeps first-touched order', () => {
    const result = coalesceOutbox([
      op('a', 'create', 1),
      op('b', 'update', 10),
      op('a', 'update', 2),
      op('c', 'delete', 0),
    ]);

    expect(result.ops.map(o => [o.entityId, o.opType, o.payload])).toEqual([
      ['a', 'create', 2],
      ['b', 'update', 10],
      ['c', 'delete', 0],
    ]);
  });

  it('keeps the same idempotency key when the same backlog is retried', () => {
    const backlog = [op('a', 'create', 1), op('a', 'update', 2)];
    expect(coalesceOutbox(backlog).ops[0]?.opId).toBe(
      coalesceOutbox(backlog).ops[0]?.opId,
    );
  });

  it('returns nothing for an empty queue', () => {
    expect(coalesceOutbox([])).toEqual({ ops: [], droppedOpIds: [] });
  });
});
