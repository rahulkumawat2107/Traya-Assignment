import type { Clock } from '@/shared/services/Clock';

export class FakeClock implements Clock {
  constructor(private current: number = 1_700_000_000_000) {}

  now(): number {
    return this.current;
  }

  set(ms: number): void {
    this.current = ms;
  }

  advance(ms: number): void {
    this.current += ms;
  }
}
