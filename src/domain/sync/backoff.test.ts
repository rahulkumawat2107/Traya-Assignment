import { computeBackoffMs } from './backoff';

const options = { baseMs: 1000, maxMs: 60_000, jitter: 0.5 };
const noJitter = () => 0;
const fullJitter = () => 1;

describe('computeBackoffMs', () => {
  it('doubles with each attempt', () => {
    expect(computeBackoffMs(1, options, noJitter)).toBe(1000);
    expect(computeBackoffMs(2, options, noJitter)).toBe(2000);
    expect(computeBackoffMs(3, options, noJitter)).toBe(4000);
    expect(computeBackoffMs(4, options, noJitter)).toBe(8000);
  });

  it('never exceeds the cap', () => {
    expect(computeBackoffMs(10, options, noJitter)).toBe(60_000);
    expect(computeBackoffMs(500, options, noJitter)).toBe(60_000);
  });

  it('keeps jitter within the configured fraction', () => {
    expect(computeBackoffMs(3, options, fullJitter)).toBe(2000);
    for (let i = 0; i < 50; i++) {
      const delay = computeBackoffMs(3, options);
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThanOrEqual(4000);
    }
  });

  it('treats zero or negative attempts as the first attempt', () => {
    expect(computeBackoffMs(0, options, noJitter)).toBe(1000);
    expect(computeBackoffMs(-3, options, noJitter)).toBe(1000);
  });
});
