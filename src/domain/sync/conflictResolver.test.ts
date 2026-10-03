import { resolveConflict } from './conflictResolver';
import { serializeHlc } from './hlc';

const at = (physical: number, nodeId = 'a', counter = 0) =>
  serializeHlc({ physical, counter, nodeId });

describe('resolveConflict', () => {
  it('applies the incoming version when nothing exists yet', () => {
    expect(resolveConflict(undefined, { hlc: at(1), deletedAt: null })).toBe(
      'apply_incoming',
    );
  });

  it('applies a newer incoming version', () => {
    expect(
      resolveConflict(
        { hlc: at(1), deletedAt: null },
        { hlc: at(2), deletedAt: null },
      ),
    ).toBe('apply_incoming');
  });

  it('ignores a stale incoming version (out-of-order delivery)', () => {
    expect(
      resolveConflict(
        { hlc: at(2), deletedAt: null },
        { hlc: at(1), deletedAt: null },
      ),
    ).toBe('keep_existing');
  });

  it('ignores the same version seen twice (duplicate delivery)', () => {
    const version = { hlc: at(2), deletedAt: null };
    expect(resolveConflict(version, { ...version })).toBe('keep_existing');
  });

  it('breaks a same-millisecond tie deterministically by node id', () => {
    const fromA = { hlc: at(5, 'device-a'), deletedAt: null };
    const fromB = { hlc: at(5, 'device-b'), deletedAt: null };
    // Whichever order they arrive in, device-b's write ends up winning.
    expect(resolveConflict(fromA, fromB)).toBe('apply_incoming');
    expect(resolveConflict(fromB, fromA)).toBe('keep_existing');
  });

  it('lets a newer delete win over an older edit', () => {
    expect(
      resolveConflict(
        { hlc: at(1), deletedAt: null },
        { hlc: at(2), deletedAt: 2 },
      ),
    ).toBe('apply_incoming');
  });

  it('never resurrects a tombstone with an older edit', () => {
    expect(
      resolveConflict(
        { hlc: at(5), deletedAt: 5 },
        { hlc: at(3), deletedAt: null },
      ),
    ).toBe('keep_existing');
  });

  it('lets an edit made after the delete win', () => {
    expect(
      resolveConflict(
        { hlc: at(5), deletedAt: 5 },
        { hlc: at(6), deletedAt: null },
      ),
    ).toBe('apply_incoming');
  });
});
