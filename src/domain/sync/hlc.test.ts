import { FakeClock } from '@/test/fakes/FakeClock';
import {
  compareHlc,
  HlcClock,
  isValidHlc,
  parseHlc,
  receiveHlc,
  serializeHlc,
  tickHlc,
} from './hlc';

describe('hlc', () => {
  it('round-trips through its serialized form', () => {
    const hlc = {
      physical: 1_700_000_000_123,
      counter: 42,
      nodeId: 'device:a',
    };
    expect(parseHlc(serializeHlc(hlc))).toEqual(hlc);
  });

  it('orders serialized values by physical time, then counter, then node', () => {
    const base = { physical: 1000, counter: 0, nodeId: 'a' };
    const laterPhysical = serializeHlc({ ...base, physical: 1001 });
    const laterCounter = serializeHlc({ ...base, counter: 1 });
    const laterNode = serializeHlc({ ...base, nodeId: 'b' });
    const first = serializeHlc(base);

    expect(compareHlc(first, laterPhysical)).toBe(-1);
    expect(compareHlc(first, laterCounter)).toBe(-1);
    expect(compareHlc(first, laterNode)).toBe(-1);
    expect(compareHlc(laterCounter, laterPhysical)).toBe(-1);
    expect(compareHlc(first, first)).toBe(0);
  });

  it('orders a large counter after a small one despite string comparison', () => {
    const small = serializeHlc({ physical: 1, counter: 9, nodeId: 'a' });
    const large = serializeHlc({ physical: 1, counter: 10, nodeId: 'a' });
    expect(compareHlc(small, large)).toBe(-1);
  });

  it('uses the wall clock when it has moved forward', () => {
    const next = tickHlc({ physical: 1000, counter: 7, nodeId: 'a' }, 2000);
    expect(next).toEqual({ physical: 2000, counter: 0, nodeId: 'a' });
  });

  it('stays monotonic when the wall clock goes backwards', () => {
    const clock = new FakeClock(5000);
    const hlc = new HlcClock(clock, 'a');
    const first = hlc.next();
    clock.set(1000); // user changed the device time
    const second = hlc.next();
    const third = hlc.next();

    expect(compareHlc(first, second)).toBe(-1);
    expect(compareHlc(second, third)).toBe(-1);
    expect(parseHlc(third).physical).toBe(5000);
  });

  it('produces distinct timestamps within the same millisecond', () => {
    const hlc = new HlcClock(new FakeClock(5000), 'a');
    const stamps = [hlc.next(), hlc.next(), hlc.next()];
    expect(new Set(stamps).size).toBe(3);
  });

  it('advances past a remote timestamp from the future', () => {
    const clock = new FakeClock(1000);
    const hlc = new HlcClock(clock, 'a');
    const remote = serializeHlc({ physical: 9000, counter: 3, nodeId: 'b' });

    hlc.observe(remote);
    const next = hlc.next();

    expect(compareHlc(remote, next)).toBe(-1);
  });

  it('merges counters when local and remote share a physical time', () => {
    const merged = receiveHlc(
      { physical: 1000, counter: 2, nodeId: 'a' },
      { physical: 1000, counter: 5, nodeId: 'b' },
      500,
    );
    expect(merged).toEqual({ physical: 1000, counter: 6, nodeId: 'a' });
  });

  it('rejects malformed values', () => {
    expect(isValidHlc('nonsense')).toBe(false);
    expect(isValidHlc(undefined)).toBe(false);
    expect(
      isValidHlc(serializeHlc({ physical: 1, counter: 0, nodeId: 'a' })),
    ).toBe(true);
  });
});
