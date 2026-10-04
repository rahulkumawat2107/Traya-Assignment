import { DAY_MS, type SeriesWindow } from '@/domain/measurement/range';
import type { SeriesPoint } from '@/domain/measurement/types';

export type ChartKind = 'line' | 'bar';

export interface ChartSize {
  width: number;
  height: number;
}

export interface ChartPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartInput {
  /** Oldest first; buckets without data are simply absent. */
  points: readonly SeriesPoint[];
  window: SeriesWindow;
  kind: ChartKind;
  size: ChartSize;
  padding: ChartPadding;
  /** Drawn as a reference line and kept inside the visible range. */
  goal?: number;
  /**
   * Size of one display unit in stored units (60 for hours of sleep, 250 for
   * glasses of water), so axis ticks land on round numbers the user reads.
   */
  unit?: number;
}

export interface ChartMark {
  /** Index into `points`. */
  index: number;
  /** Centre of the mark. */
  x: number;
  /** Top of the bar / position of the line point. */
  y: number;
  /** Bars only. */
  barX: number;
  barWidth: number;
  barHeight: number;
}

export interface ChartTick {
  value: number;
  y: number;
}

export interface ChartGeometry {
  plot: { x: number; y: number; width: number; height: number };
  ticks: ChartTick[];
  marks: ChartMark[];
  /** SVG path through the points; empty with fewer than two. */
  linePath: string;
  /** The line closed down to the baseline, for the area wash. */
  areaPath: string;
  goalY: number | null;
  bucketCount: number;
  slotWidth: number;
}

/** Widest a column may be; beyond this the slot's remainder stays empty. */
export const MAX_BAR_WIDTH = 24;
/** Smallest gap kept between neighbouring columns. */
const MIN_BAR_GAP = 2;

/** Rounds a step up to 1, 2, 2.5 or 5 times a power of ten. */
export function niceStep(rough: number): number {
  if (!(rough > 0)) {
    return 1;
  }
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const nice =
    fraction <= 1
      ? 1
      : fraction <= 2
      ? 2
      : fraction <= 2.5
      ? 2.5
      : fraction <= 5
      ? 5
      : 10;
  return nice * power;
}

/**
 * A round-numbered axis covering [min, max] with about `target` intervals.
 * Returned ticks include both ends, so the data never touches the frame.
 */
export function niceTicks(min: number, max: number, target = 3): number[] {
  if (min === max) {
    // A flat series still needs a visible range around it.
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.02 : 1;
    min -= pad;
    max += pad;
  }
  const step = niceStep((max - min) / target);
  const first = Math.floor(min / step + 1e-9) * step;
  const last = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let value = first; value <= last + step / 2; value += step) {
    // Trim floating-point dust such as 72.30000000000001.
    ticks.push(Math.round(value * 1e6) / 1e6);
  }
  return ticks;
}

export function bucketCountOf(window: SeriesWindow): number {
  return Math.max(
    1,
    Math.ceil((window.to - window.from) / (window.bucketDays * DAY_MS)),
  );
}

/**
 * Turns a series into positions. Pure: no React, no SVG, so the layout rules
 * (zero baseline for columns, capped column width, gaps for missing days,
 * goal kept in range) are unit tested.
 *
 * Columns always start at zero, because their length is the value. A line
 * may use a tighter range: for weight, a zero baseline would flatten a 2 kg
 * change into a straight line.
 */
export function buildChartGeometry(input: ChartInput): ChartGeometry {
  const { points, window, kind, size, padding, goal } = input;
  const unit = input.unit ?? 1;
  const plot = {
    x: padding.left,
    y: padding.top,
    width: Math.max(0, size.width - padding.left - padding.right),
    height: Math.max(0, size.height - padding.top - padding.bottom),
  };

  const values = points.map(point => point.value);
  if (goal !== undefined) {
    values.push(goal);
  }
  const dataMin = values.length > 0 ? Math.min(...values) : 0;
  const dataMax = values.length > 0 ? Math.max(...values) : 1;
  const tickValues = niceTicks(
    kind === 'bar' ? 0 : dataMin / unit,
    Math.max(dataMax / unit, kind === 'bar' ? 1 : dataMin / unit),
  ).map(value => value * unit);
  const axisMin = tickValues[0]!;
  const axisMax = tickValues[tickValues.length - 1]!;
  const span = axisMax - axisMin || 1;
  const toY = (value: number) =>
    plot.y + plot.height - ((value - axisMin) / span) * plot.height;

  const bucketCount = bucketCountOf(window);
  const slotWidth = plot.width / bucketCount;
  const barWidth = Math.max(
    1,
    Math.min(MAX_BAR_WIDTH, slotWidth - MIN_BAR_GAP),
  );
  const bucketMs = window.bucketDays * DAY_MS;
  const baselineY = plot.y + plot.height;

  const marks: ChartMark[] = points.map((point, index) => {
    const bucket = Math.min(
      bucketCount - 1,
      Math.max(0, Math.round((point.t - window.from) / bucketMs)),
    );
    const x = plot.x + (bucket + 0.5) * slotWidth;
    const y = toY(point.value);
    return {
      index,
      x,
      y,
      barX: x - barWidth / 2,
      barWidth,
      barHeight: Math.max(0, baselineY - y),
    };
  });

  let linePath = '';
  let areaPath = '';
  if (kind === 'line' && marks.length >= 2) {
    linePath = marks
      .map(
        (mark, i) => `${i === 0 ? 'M' : 'L'}${round(mark.x)} ${round(mark.y)}`,
      )
      .join(' ');
    const first = marks[0]!;
    const last = marks[marks.length - 1]!;
    areaPath = `${linePath} L${round(last.x)} ${round(baselineY)} L${round(
      first.x,
    )} ${round(baselineY)} Z`;
  }

  return {
    plot,
    ticks: tickValues.map(value => ({ value, y: toY(value) })),
    marks,
    linePath,
    areaPath,
    goalY: goal === undefined ? null : toY(goal),
    bucketCount,
    slotWidth,
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Index of the mark closest to a horizontal touch position, or -1. */
export function nearestMarkIndex(
  marks: readonly ChartMark[],
  x: number,
): number {
  let best = -1;
  let bestDistance = Infinity;
  for (const mark of marks) {
    const distance = Math.abs(mark.x - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = mark.index;
    }
  }
  return best;
}
