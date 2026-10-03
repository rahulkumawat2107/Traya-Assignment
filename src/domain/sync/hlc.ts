import type { Clock } from '@/shared/services/Clock';

/**
 * Hybrid logical clock.
 *
 * Ordering by wall-clock time alone breaks when a device clock is wrong or
 * jumps backwards. An HLC keeps the physical time when it is usable and
 * falls back to a logical counter when it is not, so timestamps produced on
 * one device are strictly increasing and causally ordered across devices.
 */
export interface Hlc {
  physical: number;
  counter: number;
  nodeId: string;
}

const PHYSICAL_WIDTH = 15;
const COUNTER_WIDTH = 5;

/**
 * Fixed-width encoding, so plain string comparison orders by
 * (physical, counter, nodeId). nodeId is the deterministic tie-break.
 */
export function serializeHlc(hlc: Hlc): string {
  const physical = String(hlc.physical).padStart(PHYSICAL_WIDTH, '0');
  const counter = hlc.counter.toString(36).padStart(COUNTER_WIDTH, '0');
  return `${physical}:${counter}:${hlc.nodeId}`;
}

export function parseHlc(serialized: string): Hlc {
  const [physical, counter, ...node] = serialized.split(':');
  const parsed: Hlc = {
    physical: Number(physical),
    counter: parseInt(counter ?? '', 36),
    nodeId: node.join(':'),
  };
  if (
    !Number.isFinite(parsed.physical) ||
    !Number.isFinite(parsed.counter) ||
    parsed.nodeId.length === 0
  ) {
    throw new Error(`Invalid HLC: ${serialized}`);
  }
  return parsed;
}

export function isValidHlc(serialized: unknown): serialized is string {
  if (typeof serialized !== 'string') {
    return false;
  }
  try {
    parseHlc(serialized);
    return true;
  } catch {
    return false;
  }
}

export function compareHlc(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** Timestamp for a local event. */
export function tickHlc(last: Hlc, wallClock: number): Hlc {
  if (wallClock > last.physical) {
    return { physical: wallClock, counter: 0, nodeId: last.nodeId };
  }
  // Wall clock stalled or went backwards: stay on the last physical time.
  return { ...last, counter: last.counter + 1 };
}

/** Advance the local clock past a timestamp observed from another node. */
export function receiveHlc(local: Hlc, remote: Hlc, wallClock: number): Hlc {
  const physical = Math.max(local.physical, remote.physical, wallClock);
  let counter = 0;
  if (physical === local.physical && physical === remote.physical) {
    counter = Math.max(local.counter, remote.counter) + 1;
  } else if (physical === local.physical) {
    counter = local.counter + 1;
  } else if (physical === remote.physical) {
    counter = remote.counter + 1;
  }
  return { physical, counter, nodeId: local.nodeId };
}

/** Stateful wrapper used by the write path and the sync engine. */
export class HlcClock {
  private state: Hlc;

  constructor(private readonly clock: Clock, nodeId: string) {
    this.state = { physical: 0, counter: 0, nodeId };
  }

  /** New timestamp for a local write. Strictly greater than any before it. */
  next(): string {
    this.state = tickHlc(this.state, this.clock.now());
    return serializeHlc(this.state);
  }

  /** Call for every timestamp seen from the server or restored from disk. */
  observe(remote: string): void {
    this.state = receiveHlc(this.state, parseHlc(remote), this.clock.now());
  }

  peek(): string {
    return serializeHlc(this.state);
  }
}
