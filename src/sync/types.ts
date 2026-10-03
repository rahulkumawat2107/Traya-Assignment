export type SyncPhase = 'idle' | 'syncing' | 'error';

/** What the UI needs to explain the sync state to the user. */
export interface SyncStatus {
  phase: SyncPhase;
  online: boolean;
  /** Records with changes not yet confirmed by the server. */
  pendingCount: number;
  /** Records the server rejected; they need the user's attention. */
  failedCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  /** When the next automatic retry is scheduled, if any. */
  nextRetryAt: number | null;
}

export const INITIAL_SYNC_STATUS: SyncStatus = {
  phase: 'idle',
  online: true,
  pendingCount: 0,
  failedCount: 0,
  lastSyncedAt: null,
  lastError: null,
  nextRetryAt: null,
};

export interface SyncRunResult {
  /** False when the run was skipped. */
  ran: boolean;
  skippedReason?: 'offline';
  /** Records confirmed by the server in this run. */
  pushed: number;
  /** Records the server rejected in this run. */
  rejected: number;
  /** Remote changes applied locally in this run. */
  pulled: number;
  error: string | null;
}

export interface SyncRunOptions {
  /** Ignore backoff timers, e.g. the user tapped "Sync now". */
  force?: boolean;
}
