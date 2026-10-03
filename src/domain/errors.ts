export type AppErrorKind = 'retryable' | 'terminal' | 'conflict';

/**
 * Errors crossing the API boundary are classified so the sync engine can
 * decide between backing off and giving up. `kind` is used instead of
 * `instanceof` so the check survives transpilation and serialization.
 */
export class AppError extends Error {
  readonly kind: AppErrorKind;

  constructor(kind: AppErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'AppError';
  }
}

/** Timeouts, dropped connections, 5xx, 429: safe to try again later. */
export class RetryableError extends AppError {
  constructor(message: string) {
    super('retryable', message);
    this.name = 'RetryableError';
  }
}

/** Validation / 4xx: retrying the same request can never succeed. */
export class TerminalError extends AppError {
  constructor(message: string) {
    super('terminal', message);
    this.name = 'TerminalError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('conflict', message);
    this.name = 'ConflictError';
  }
}

export function isRetryable(error: unknown): boolean {
  // Unknown failures (e.g. a thrown TypeError from fetch) are treated as
  // retryable: the outcome is unknown and replays are idempotent.
  return (
    !(error instanceof Object && 'kind' in error) ||
    (error as AppError).kind === 'retryable'
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
