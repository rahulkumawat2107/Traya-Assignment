import { DAY_MS } from '@/domain/measurement/range';
import type { TimeRange } from '../HealthProvider';

export interface MockDay {
  /** e.g. "2026-09-21"; stable, so record ids are stable across imports. */
  key: string;
  /** Morning weigh-in time. */
  morning: number;
  /** End-of-day time, for daily totals. */
  evening: number;
  weightKg: number;
  steps: number;
  sleepMinutes: number;
}

/** Deterministic 0..1 value for a day, so the "device" always reports the same data. */
function noise(dayNumber: number, salt: number): number {
  const x = Math.sin(dayNumber * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The underlying "truth" all mock providers observe. Each provider then
 * reports it in its own shape and units, which is what makes it possible to
 * test that the normalizers agree.
 */
export function mockDays(range: TimeRange): MockDay[] {
  const days: MockDay[] = [];
  const cursor = new Date(range.from);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() < range.to) {
    const dayNumber = Math.round(cursor.getTime() / DAY_MS);
    const morning = new Date(cursor).setHours(7, 30, 0, 0);
    const evening = new Date(cursor).setHours(21, 0, 0, 0);
    if (morning >= range.from && morning < range.to) {
      const key = [
        cursor.getFullYear(),
        String(cursor.getMonth() + 1).padStart(2, '0'),
        String(cursor.getDate()).padStart(2, '0'),
      ].join('-');
      // A slow downward trend with daily wobble, ending near 73 kg today.
      const daysAgo = Math.max(0, (range.to - morning) / DAY_MS);
      const weightKg =
        Math.round((73 + daysAgo * 0.03 + (noise(dayNumber, 1) - 0.5)) * 10) /
        10;
      days.push({
        key,
        morning,
        evening: Math.min(evening, range.to - 1),
        weightKg,
        steps: 3000 + Math.round(noise(dayNumber, 2) * 9000),
        sleepMinutes: 330 + Math.round(noise(dayNumber, 3) * 180),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
