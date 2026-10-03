export interface NetworkConditions {
  /** Every request fails immediately, as if the device had no connection. */
  offline: boolean;
  minLatencyMs: number;
  maxLatencyMs: number;
  /**
   * Probability (0..1) that a request fails with a retryable error. Half of
   * these fail before reaching the server and half after the server has
   * already applied the request, which is the case idempotency exists for.
   */
  failureRate: number;
  /** Probability (0..1) that a request is delivered to the server twice. */
  duplicateRate: number;
  /** Deliver the ops / changes of a request in shuffled order. */
  reorder: boolean;
}

export const DEFAULT_CONDITIONS: NetworkConditions = {
  offline: false,
  minLatencyMs: 150,
  maxLatencyMs: 600,
  failureRate: 0,
  duplicateRate: 0,
  reorder: false,
};

/** Mutable, observable holder so the debug screen can change behaviour live. */
export class NetworkConditionsController {
  private current: NetworkConditions;
  private listeners = new Set<() => void>();

  constructor(initial: NetworkConditions = DEFAULT_CONDITIONS) {
    this.current = initial;
  }

  get = (): NetworkConditions => this.current;

  set(patch: Partial<NetworkConditions>): void {
    this.current = { ...this.current, ...patch };
    this.listeners.forEach(listener => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}
