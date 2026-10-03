import { create } from 'zustand';
import { INITIAL_SYNC_STATUS, type SyncStatus } from '@/sync/types';

/**
 * Mirror of the sync engine's status for the UI. Components subscribe with
 * selectors, so a change to `pendingCount` does not re-render a component
 * that only reads `online`.
 */
export const useSyncStatusStore = create<SyncStatus>(() => INITIAL_SYNC_STATUS);

export function reportSyncStatus(patch: Partial<SyncStatus>): void {
  useSyncStatusStore.setState(patch);
}
