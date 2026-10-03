import type { NetworkMonitor } from '@/shared/services/NetworkMonitor';
import type { SyncEngine } from './SyncEngine';
import type { SyncStatus } from './types';

export interface SyncTriggerDeps {
  engine: SyncEngine;
  network: NetworkMonitor;
  /** Calls back whenever the app returns to the foreground. */
  subscribeForeground: (listener: () => void) => () => void;
  onStatus?: (patch: Partial<SyncStatus>) => void;
}

/**
 * Wires the moments a sync is worth attempting:
 * - connectivity comes back: pending changes can finally leave the device;
 * - the app returns to the foreground: it may have been hours, and timers
 *   do not fire while the app is suspended.
 *
 * Both ignore backoff: the conditions that caused earlier failures have
 * probably changed. Returns a function that removes the listeners.
 */
export function startSyncTriggers(deps: SyncTriggerDeps): () => void {
  const { engine, network, subscribeForeground, onStatus } = deps;

  const unsubscribeNetwork = network.subscribe(online => {
    onStatus?.({ online });
    if (online) {
      engine.run({ force: true }).catch(() => undefined);
    }
  });

  const unsubscribeForeground = subscribeForeground(() => {
    engine.run({ force: true }).catch(() => undefined);
  });

  return () => {
    unsubscribeNetwork();
    unsubscribeForeground();
  };
}

/**
 * Coalesces a burst of local writes (e.g. an import of 50 readings) into a
 * single sync request shortly after the last one.
 */
export function createSyncNudge(engine: SyncEngine, delayMs = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      engine.requestSync();
    }, delayMs);
  };
}
