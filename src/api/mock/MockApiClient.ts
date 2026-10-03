import { RetryableError } from '@/domain/errors';
import type { ApiClient } from '../ApiClient';
import {
  parsePullResponse,
  parsePushResponse,
  type PullResponseDto,
  type PushOpDto,
  type PushResponseDto,
} from '../dto';
import type { MockServer } from './MockServer';
import type { NetworkConditions } from './networkConditions';

export interface MockApiClientOptions {
  server: MockServer;
  conditions: () => NetworkConditions;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * The unreliable network between the app and the mock server. Everything a
 * real mobile connection does to a request can be dialled in: latency,
 * drops before and after the server acted, duplicate delivery, reordering.
 *
 * Payloads are passed through JSON and the response parsers, so the client
 * exercises the same validation path a real HTTP client would.
 */
export class MockApiClient implements ApiClient {
  private readonly server: MockServer;
  private readonly conditions: () => NetworkConditions;
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: MockApiClientOptions) {
    this.server = options.server;
    this.conditions = options.conditions;
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async pushOps(ops: PushOpDto[]): Promise<PushResponseDto> {
    const conditions = this.conditions();
    const fate = await this.transmit(conditions);
    if (fate === 'lost_before') {
      throw new RetryableError('Request timed out');
    }

    const wireOps = this.overWire(conditions.reorder ? this.shuffle(ops) : ops);
    let response = await this.server.push(wireOps);
    if (this.random() < conditions.duplicateRate) {
      // The same request arrives twice; the op ids make the second a no-op.
      response = await this.server.push(wireOps);
    }

    if (fate === 'lost_after') {
      // The server applied the ops but the client never hears about it.
      throw new RetryableError('Connection lost before the response arrived');
    }
    return parsePushResponse(this.overWire(response));
  }

  async pullChanges(
    cursor: string | null,
    limit: number,
  ): Promise<PullResponseDto> {
    const conditions = this.conditions();
    const fate = await this.transmit(conditions);
    if (fate !== 'delivered') {
      throw new RetryableError('Request timed out');
    }

    const response = await this.server.pull(cursor, limit);
    let changes = response.changes;
    if (this.random() < conditions.duplicateRate) {
      changes = [...changes, ...changes];
    }
    if (conditions.reorder) {
      changes = this.shuffle(changes);
    }
    return parsePullResponse(this.overWire({ ...response, changes }));
  }

  private async transmit(
    conditions: NetworkConditions,
  ): Promise<'delivered' | 'lost_before' | 'lost_after'> {
    if (conditions.offline) {
      throw new RetryableError('No network connection');
    }
    const spread = Math.max(
      0,
      conditions.maxLatencyMs - conditions.minLatencyMs,
    );
    await this.sleep(conditions.minLatencyMs + this.random() * spread);

    if (this.random() < conditions.failureRate) {
      return this.random() < 0.5 ? 'lost_before' : 'lost_after';
    }
    return 'delivered';
  }

  private overWire<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private shuffle<T>(items: T[]): T[] {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
  }
}
