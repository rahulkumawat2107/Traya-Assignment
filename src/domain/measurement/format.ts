import { METRIC_UNIT, type MetricType } from './types';

export const METRIC_LABEL: Record<MetricType, string> = {
  weight: 'Weight',
  steps: 'Steps',
  sleep: 'Sleep',
};

function withThousands(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatDuration(minutes: number): string {
  const total = Math.round(Math.abs(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) {
    return `${rest}m`;
  }
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Value with its unit, e.g. "72.6 kg", "8,432 steps", "7h 30m". */
export function formatMetricValue(metric: MetricType, value: number): string {
  switch (metric) {
    case 'weight':
      return `${value.toFixed(1)} ${METRIC_UNIT.weight}`;
    case 'steps':
      return `${withThousands(value)} steps`;
    case 'sleep':
      return formatDuration(value);
  }
}

/** Signed difference, e.g. "-1.2 kg", "+350 steps", "+25m". "No change" for zero. */
export function formatMetricChange(metric: MetricType, change: number): string {
  const rounded =
    metric === 'weight' ? Math.round(change * 10) / 10 : Math.round(change);
  if (rounded === 0) {
    return 'No change';
  }
  const sign = rounded > 0 ? '+' : '-';
  return `${sign}${formatMetricValue(metric, Math.abs(rounded))}`;
}

export function sourceLabel(source: string): string {
  if (source === 'manual') {
    return 'Entered manually';
  }
  const name = source.replace(/^provider:/, '');
  return `From ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}
