import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import type { NetworkMonitor } from './NetworkMonitor';

function toOnline(state: NetInfoState): boolean {
  // isInternetReachable is null while still being determined; assume
  // reachable then and let a failed request correct us.
  return state.isConnected === true && state.isInternetReachable !== false;
}

export class NetInfoNetworkMonitor implements NetworkMonitor {
  private online = true;
  private listeners = new Set<(online: boolean) => void>();
  private unsubscribeNetInfo: (() => void) | null = null;

  start(): void {
    if (this.unsubscribeNetInfo) {
      return;
    }
    this.unsubscribeNetInfo = NetInfo.addEventListener(state => {
      const next = toOnline(state);
      if (next !== this.online) {
        this.online = next;
        this.listeners.forEach(listener => listener(next));
      }
    });
  }

  stop(): void {
    this.unsubscribeNetInfo?.();
    this.unsubscribeNetInfo = null;
  }

  isOnline(): boolean {
    return this.online;
  }

  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
