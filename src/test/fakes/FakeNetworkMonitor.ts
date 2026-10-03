import type { NetworkMonitor } from '@/shared/services/NetworkMonitor';

export class FakeNetworkMonitor implements NetworkMonitor {
  private listeners = new Set<(online: boolean) => void>();

  constructor(private online: boolean = true) {}

  isOnline(): boolean {
    return this.online;
  }

  setOnline(online: boolean): void {
    if (online === this.online) {
      return;
    }
    this.online = online;
    this.listeners.forEach(listener => listener(online));
  }

  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
