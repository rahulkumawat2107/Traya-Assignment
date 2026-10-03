export interface NetworkMonitor {
  isOnline(): boolean;
  /** Listener fires on every change. Returns an unsubscribe function. */
  subscribe(listener: (online: boolean) => void): () => void;
}
