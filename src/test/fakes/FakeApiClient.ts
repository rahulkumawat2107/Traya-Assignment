import type { ApiClient } from '@/api/ApiClient';
import type { PullResponseDto, PushOpDto, PushResponseDto } from '@/api/dto';
import { MockServer } from '@/api/mock/MockServer';

type PushFault =
  | { kind: 'fail_before'; error: Error }
  /** The server applies the request, then the response is lost. */
  | { kind: 'fail_after'; error: Error };

/**
 * Scriptable ApiClient for sync engine tests. Backed by a real MockServer so
 * idempotency and HLC ordering behave as in the app, with no latency and
 * faults injected one call at a time.
 */
export class FakeApiClient implements ApiClient {
  readonly server = new MockServer();
  readonly pushCalls: PushOpDto[][] = [];
  readonly pullCalls: (string | null)[] = [];

  private pushFaults: PushFault[] = [];
  private pullFaults: Error[] = [];
  private pushGate: Promise<void> | null = null;

  failNextPush(error: Error): void {
    this.pushFaults.push({ kind: 'fail_before', error });
  }

  loseNextPushResponse(error: Error): void {
    this.pushFaults.push({ kind: 'fail_after', error });
  }

  failNextPull(error: Error): void {
    this.pullFaults.push(error);
  }

  /** Holds every push until the returned function is called. */
  holdPushes(): () => void {
    let release!: () => void;
    this.pushGate = new Promise<void>(resolve => {
      release = resolve;
    });
    return () => {
      this.pushGate = null;
      release();
    };
  }

  async pushOps(ops: PushOpDto[]): Promise<PushResponseDto> {
    this.pushCalls.push(ops);
    if (this.pushGate) {
      await this.pushGate;
    }
    const fault = this.pushFaults.shift();
    if (fault?.kind === 'fail_before') {
      throw fault.error;
    }
    const response = await this.server.push(ops);
    if (fault?.kind === 'fail_after') {
      throw fault.error;
    }
    return response;
  }

  async pullChanges(
    cursor: string | null,
    limit: number,
  ): Promise<PullResponseDto> {
    this.pullCalls.push(cursor);
    const fault = this.pullFaults.shift();
    if (fault) {
      throw fault;
    }
    return this.server.pull(cursor, limit);
  }
}
