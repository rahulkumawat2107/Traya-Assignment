import { RANGE_BUCKET_DAYS, RANGE_DAYS, type HistoryRange } from './types';

export const DAY_MS = 86_400_000;

export interface SeriesWindow {
  /** Inclusive start, ms since epoch (local midnight of the first day). */
  from: number;
  /** Exclusive end, ms since epoch. */
  to: number;
  bucketDays: number;
  /** Local offset from UTC in ms, so days are cut at local midnight. */
  tzOffsetMs: number;
}

/** Index of the local calendar day containing `ms`. */
export function localDayIndex(ms: number, tzOffsetMs: number): number {
  return Math.floor((ms + tzOffsetMs) / DAY_MS);
}

export function dayIndexToMs(dayIndex: number, tzOffsetMs: number): number {
  return dayIndex * DAY_MS - tzOffsetMs;
}

/**
 * The window for "last N days": today plus the N-1 days before it.
 *
 * A fixed offset is used for the whole window, so a day containing a
 * daylight-saving change is cut an hour off. That is acceptable for trend
 * summaries and keeps the bucketing a simple integer division in SQL.
 */
export function seriesWindow(
  range: HistoryRange,
  now: number,
  tzOffsetMs: number,
): SeriesWindow {
  const today = localDayIndex(now, tzOffsetMs);
  const firstDay = today - (RANGE_DAYS[range] - 1);
  return {
    from: dayIndexToMs(firstDay, tzOffsetMs),
    to: dayIndexToMs(today + 1, tzOffsetMs),
    bucketDays: RANGE_BUCKET_DAYS[range],
    tzOffsetMs,
  };
}

export function deviceTzOffsetMs(date: Date = new Date()): number {
  return -date.getTimezoneOffset() * 60_000;
}
