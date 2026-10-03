export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  /** Fraction of the delay that may be randomly removed, 0..1. */
  jitter: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = {
  baseMs: 2_000,
  maxMs: 5 * 60_000,
  jitter: 0.3,
};

/**
 * Exponential backoff with jitter. `attempts` is the number of attempts
 * already made (1 after the first failure). Jitter only ever shortens the
 * delay, so the cap is a hard upper bound, and spreads retries from many
 * devices so they do not hit a recovering server at the same instant.
 */
export function computeBackoffMs(
  attempts: number,
  options: BackoffOptions = DEFAULT_BACKOFF,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, attempts - 1);
  // Cap the exponent too, so huge attempt counts cannot overflow.
  const raw = options.baseMs * 2 ** Math.min(exponent, 30);
  const capped = Math.min(options.maxMs, raw);
  return Math.round(capped * (1 - options.jitter * random()));
}
