import type { IdGenerator } from '@/shared/services/IdGenerator';

export class FakeIdGenerator implements IdGenerator {
  private counter = 0;

  constructor(private readonly prefix: string = 'id') {}

  newId(): string {
    this.counter += 1;
    return `${this.prefix}-${this.counter}`;
  }
}
