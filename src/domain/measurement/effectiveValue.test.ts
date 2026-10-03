import { FakeClock } from '@/test/fakes/FakeClock';
import { HlcClock } from '@/domain/sync/hlc';
import { pickEffectiveReading } from './effectiveValue';
import type { Source } from './types';

const DAY = Date.UTC(2026, 8, 21);
const at = (hh: number, mm: number) => DAY + (hh * 60 + mm) * 60_000;

function reading(
  value: number,
  measuredAt: number,
  source: Source,
  hlc: string,
  deletedAt: number | null = null,
) {
  return { value, measuredAt, source, hlc, deletedAt };
}

describe('pickEffectiveReading', () => {
  it('returns undefined when there are no readings', () => {
    expect(pickEffectiveReading([])).toBeUndefined();
  });

  it('shows 72.6 kg for the 10:01-10:04 scenario from the brief', () => {
    const clock = new FakeClock(at(10, 1));
    const hlc = new HlcClock(clock, 'phone');

    // 10:01 - user records 72.8 kg (record A).
    let manual = reading(72.8, at(10, 1), 'manual', hlc.next());

    // 10:02 - device reports 72.5 kg. A different source, so a different
    // record (B): it does not overwrite A.
    clock.set(at(10, 2));
    const device = reading(72.5, at(10, 2), 'provider:scale', hlc.next());

    // 10:03 - user edits record A to 72.6 kg. Same record, newer HLC.
    clock.set(at(10, 3));
    manual = { ...manual, value: 72.6, hlc: hlc.next() };

    // 10:04 - sync. Whatever order the records are read in, the answer is
    // the user's corrected value.
    expect(pickEffectiveReading([manual, device])?.value).toBe(72.6);
    expect(pickEffectiveReading([device, manual])?.value).toBe(72.6);
  });

  it('prefers a manual reading even when the device reading is later', () => {
    const picked = pickEffectiveReading([
      reading(72.8, at(8, 0), 'manual', 'h1'),
      reading(72.5, at(20, 0), 'provider:scale', 'h2'),
    ]);
    expect(picked?.value).toBe(72.8);
  });

  it('falls back to the latest device reading when there is no manual one', () => {
    const picked = pickEffectiveReading([
      reading(72.9, at(7, 0), 'provider:scale', 'h1'),
      reading(72.4, at(21, 0), 'provider:watch', 'h2'),
    ]);
    expect(picked?.value).toBe(72.4);
  });

  it('uses the latest of several manual readings', () => {
    const picked = pickEffectiveReading([
      reading(73.0, at(7, 0), 'manual', 'h1'),
      reading(72.2, at(19, 0), 'manual', 'h2'),
    ]);
    expect(picked?.value).toBe(72.2);
  });

  it('ignores deleted readings, falling back to the device', () => {
    const picked = pickEffectiveReading([
      reading(72.6, at(10, 1), 'manual', 'h3', at(10, 5)),
      reading(72.5, at(10, 2), 'provider:scale', 'h2'),
    ]);
    expect(picked?.value).toBe(72.5);
  });

  it('breaks an exact time tie by HLC so every device agrees', () => {
    const picked = pickEffectiveReading([
      reading(70, at(9, 0), 'manual', 'h1'),
      reading(71, at(9, 0), 'manual', 'h2'),
    ]);
    expect(picked?.value).toBe(71);
  });
});
