export interface Clock {
  /** Milliseconds since epoch. */
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};
