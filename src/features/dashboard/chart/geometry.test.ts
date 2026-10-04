import { DAY_MS, seriesWindow } from '@/domain/measurement/range';
import {
  buildChartGeometry,
  bucketCountOf,
  MAX_BAR_WIDTH,
  nearestMarkIndex,
  niceStep,
  niceTicks,
  type ChartInput,
} from './geometry';

const NOON = Date.UTC(2026, 8, 21, 12, 0, 0);
const week = seriesWindow('7d', NOON, 0);
const size = { width: 340, height: 180 };
const padding = { top: 10, right: 10, bottom: 20, left: 40 };

const day = (daysAfterStart: number, value: number) => ({
  t: week.from + daysAfterStart * DAY_MS,
  value,
});

const build = (patch: Partial<ChartInput>) =>
  buildChartGeometry({
    points: [],
    window: week,
    kind: 'bar',
    size,
    padding,
    ...patch,
  });

describe('niceTicks', () => {
  it('rounds steps to 1, 2, 2.5 or 5 times a power of ten', () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(1.3)).toBe(2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(37)).toBe(50);
    expect(niceStep(3300)).toBe(5000);
    expect(niceStep(0)).toBe(1);
  });

  it('produces round numbers that enclose the data', () => {
    expect(niceTicks(0, 11_400)).toEqual([0, 5000, 10_000, 15_000]);
    expect(niceTicks(72.1, 73.9)).toEqual([72, 73, 74]);
    expect(niceTicks(0, 8)).toEqual([0, 5, 10]);
  });

  it('gives a flat series some room', () => {
    const ticks = niceTicks(72.5, 72.5);
    expect(ticks[0]).toBeLessThan(72.5);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(72.5);
  });

  it('has no floating-point dust', () => {
    for (const tick of niceTicks(72.3, 72.9)) {
      expect(String(tick).length).toBeLessThan(7);
    }
  });
});

describe('buildChartGeometry', () => {
  it('counts the buckets in each range', () => {
    expect(bucketCountOf(week)).toBe(7);
    expect(bucketCountOf(seriesWindow('30d', NOON, 0))).toBe(30);
    expect(bucketCountOf(seriesWindow('3m', NOON, 0))).toBe(13);
  });

  it('starts columns at zero so their length is the value', () => {
    const geometry = build({ points: [day(0, 5000), day(1, 10_000)] });
    const baseline = geometry.plot.y + geometry.plot.height;

    expect(geometry.ticks[0]).toEqual({ value: 0, y: baseline });
    const [half, full] = geometry.marks;
    expect(full!.barHeight).toBeCloseTo(half!.barHeight * 2);
    expect(half!.y + half!.barHeight).toBeCloseTo(baseline);
  });

  it('caps the column width and leaves the rest of the slot empty', () => {
    const geometry = build({ points: [day(0, 1)] });
    expect(geometry.slotWidth).toBeGreaterThan(MAX_BAR_WIDTH);
    expect(geometry.marks[0]!.barWidth).toBe(MAX_BAR_WIDTH);
  });

  it('keeps a gap between columns when slots are narrow', () => {
    const geometry = build({
      window: seriesWindow('30d', NOON, 0),
      points: [day(0, 1)],
    });
    expect(geometry.marks[0]!.barWidth).toBeLessThanOrEqual(
      geometry.slotWidth - 2,
    );
  });

  it('leaves a gap where a day has no data', () => {
    const geometry = build({ points: [day(0, 1), day(3, 1), day(6, 1)] });
    const [a, b, c] = geometry.marks.map(mark => mark.x);

    expect(b! - a!).toBeCloseTo(geometry.slotWidth * 3);
    expect(c! - b!).toBeCloseTo(geometry.slotWidth * 3);
    expect(a!).toBeCloseTo(geometry.plot.x + geometry.slotWidth / 2);
    expect(c!).toBeCloseTo(
      geometry.plot.x + geometry.plot.width - geometry.slotWidth / 2,
    );
  });

  it('uses a tight range for a line instead of a zero baseline', () => {
    const geometry = build({
      kind: 'line',
      points: [day(0, 73.4), day(6, 72.6)],
    });

    expect(geometry.ticks.map(tick => tick.value)).toEqual([72.5, 73, 73.5]);
    expect(geometry.marks[0]!.y).toBeLessThan(geometry.marks[1]!.y);
    expect(geometry.linePath.startsWith('M')).toBe(true);
    expect(geometry.areaPath.endsWith('Z')).toBe(true);
  });

  it('draws no line for a single point but still places it', () => {
    const geometry = build({ kind: 'line', points: [day(3, 72.5)] });

    expect(geometry.linePath).toBe('');
    expect(geometry.marks).toHaveLength(1);
    const { plot } = geometry;
    expect(geometry.marks[0]!.y).toBeGreaterThan(plot.y);
    expect(geometry.marks[0]!.y).toBeLessThan(plot.y + plot.height);
  });

  it('keeps the goal inside the visible range', () => {
    const below = build({
      kind: 'line',
      points: [day(0, 78), day(6, 77)],
      goal: 72,
    });
    expect(below.goalY).toBeGreaterThan(below.marks[1]!.y);
    expect(below.goalY).toBeLessThanOrEqual(below.plot.y + below.plot.height);

    const above = build({ points: [day(0, 3000)], goal: 8000 });
    expect(above.goalY).toBeGreaterThanOrEqual(above.plot.y);
    expect(above.goalY).toBeLessThan(above.marks[0]!.y);
  });

  it('puts ticks on whole display units', () => {
    // Sleep is stored in minutes and read in hours.
    const sleep = build({
      points: [day(0, 395), day(1, 470)],
      goal: 480,
      unit: 60,
    });
    expect(sleep.ticks.map(tick => tick.value / 60)).toEqual([0, 5, 10]);
  });

  it('handles an empty series', () => {
    const geometry = build({ points: [] });
    expect(geometry.marks).toEqual([]);
    expect(geometry.goalY).toBeNull();
    expect(geometry.ticks.length).toBeGreaterThan(1);
  });
});

describe('nearestMarkIndex', () => {
  it('finds the mark closest to a touch', () => {
    const { marks } = build({ points: [day(0, 1), day(3, 1), day(6, 1)] });
    expect(nearestMarkIndex(marks, 0)).toBe(0);
    expect(nearestMarkIndex(marks, marks[1]!.x + 5)).toBe(1);
    expect(nearestMarkIndex(marks, 9999)).toBe(2);
    expect(nearestMarkIndex([], 10)).toBe(-1);
  });
});
