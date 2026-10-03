import type { PullResponseDto, PushOpDto, PushResponseDto } from './dto';

/**
 * The backend as the app sees it. The sync engine depends on this interface
 * only; swapping the mock for a real HTTP client is a one-line change in the
 * composition root.
 *
 * Both calls reject with a RetryableError for transient failures (the
 * outcome may be unknown) and a TerminalError when retrying cannot help.
 */
export interface ApiClient {
  /** Each op carries its own idempotency key and gets its own result. */
  pushOps(ops: PushOpDto[]): Promise<PushResponseDto>;
  /** Changes after `cursor`; pass null for the first pull. */
  pullChanges(cursor: string | null, limit: number): Promise<PullResponseDto>;
}
