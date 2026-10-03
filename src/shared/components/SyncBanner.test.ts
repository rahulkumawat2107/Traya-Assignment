import { INITIAL_SYNC_STATUS, type SyncStatus } from '@/sync/types';
import { describeSyncStatus } from './SyncBanner';

const status = (patch: Partial<SyncStatus>): SyncStatus => ({
  ...INITIAL_SYNC_STATUS,
  ...patch,
});

describe('describeSyncStatus', () => {
  it('shows nothing when everything is synced', () => {
    expect(describeSyncStatus(status({}))).toBeNull();
  });

  it('explains that offline changes are kept', () => {
    expect(describeSyncStatus(status({ online: false }))?.text).toBe(
      'Offline. Changes are saved on this device.',
    );
    expect(
      describeSyncStatus(status({ online: false, pendingCount: 2 }))?.text,
    ).toBe(
      'Offline. 2 changes saved on this device will sync when you reconnect.',
    );
  });

  it('puts offline ahead of an earlier sync error', () => {
    const content = describeSyncStatus(
      status({ online: false, phase: 'error', lastError: 'timeout' }),
    );
    expect(content?.tone).toBe('warning');
  });

  it('offers a retry for rejected changes', () => {
    expect(describeSyncStatus(status({ failedCount: 1 }))).toEqual({
      tone: 'danger',
      text: '1 change could not be synced.',
      action: 'retry_failed',
    });
  });

  it('reports a failed sync with what is waiting', () => {
    const content = describeSyncStatus(
      status({
        phase: 'error',
        lastError: 'Request timed out',
        pendingCount: 3,
      }),
    );
    expect(content?.text).toContain('Sync failed: Request timed out.');
    expect(content?.text).toContain('3 changes waiting.');
    expect(content?.action).toBe('sync_now');
  });

  it('shows progress while syncing', () => {
    expect(
      describeSyncStatus(status({ phase: 'syncing', pendingCount: 2 }))?.text,
    ).toBe('Syncing…');
  });

  it('shows what is waiting when idle', () => {
    expect(describeSyncStatus(status({ pendingCount: 1 }))?.text).toBe(
      '1 change waiting to sync.',
    );
  });
});
