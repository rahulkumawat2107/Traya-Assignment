import { format, isToday, isYesterday } from 'date-fns';

/** "Today, 10:04", "Yesterday, 18:30" or "21 Sep 2026, 10:04". */
export function formatDateTime(ms: number): string {
  const date = new Date(ms);
  const time = format(date, 'HH:mm');
  if (isToday(date)) {
    return `Today, ${time}`;
  }
  if (isYesterday(date)) {
    return `Yesterday, ${time}`;
  }
  return `${format(date, 'd MMM yyyy')}, ${time}`;
}

export function formatDate(ms: number): string {
  return format(new Date(ms), 'd MMM yyyy');
}

export function formatTime(ms: number): string {
  return format(new Date(ms), 'HH:mm:ss');
}
