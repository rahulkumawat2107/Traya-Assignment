import { compareHlc } from './hlc';

export interface Versioned {
  hlc: string;
  deletedAt: number | null;
}

export type Resolution = 'apply_incoming' | 'keep_existing';

/**
 * Record-level conflict resolution: last write wins, where "last" is decided
 * by the hybrid logical clock rather than arrival order or wall-clock time.
 *
 * - No existing version: take the incoming one.
 * - Incoming is newer: take it. This covers edits and deletes alike, because
 *   a tombstone is just a version with `deletedAt` set.
 * - Incoming is older or identical: ignore it. This is what makes duplicate
 *   and out-of-order deliveries harmless, and what stops an older edit from
 *   resurrecting a record that was deleted later.
 *
 * Two different devices can never produce equal HLCs (the node id is part of
 * the timestamp), so "equal" always means "the same write seen twice".
 *
 * The same function is used by the client (applying pulled changes) and by
 * the mock server (applying pushed ops), so both sides converge.
 */
export function resolveConflict(
  existing: Versioned | undefined | null,
  incoming: Versioned,
): Resolution {
  if (!existing) {
    return 'apply_incoming';
  }
  return compareHlc(incoming.hlc, existing.hlc) > 0
    ? 'apply_incoming'
    : 'keep_existing';
}
