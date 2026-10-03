import type { NetworkConditionsController } from '@/api/mock/networkConditions';
import type { NetworkMonitor } from './NetworkMonitor';

/**
 * Combines real connectivity with the debug screen's "offline" switch, so
 * simulating offline behaves exactly like losing the network: the banner
 * changes and going back online triggers a sync.
 */
export class SimulatedNetworkMonitor implements NetworkMonitor {
  private listeners = new Set<(online: boolean) => void>();
  private last: boolean;

  constructor(
    private readonly real: NetworkMonitor,
    private readonly conditions: NetworkConditionsController,
  ) {
    this.last = this.isOnline();
    real.subscribe(this.emitIfChanged);
    conditions.subscribe(this.emitIfChanged);
  }

  isOnline(): boolean {
    return this.real.isOnline() && !this.conditions.get().offline;
  }

  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitIfChanged = (): void => {
    const online = this.isOnline();
    if (online !== this.last) {
      this.last = online;
      this.listeners.forEach(listener => listener(online));
    }
  };
}
