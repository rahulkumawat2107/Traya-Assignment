import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { format } from 'date-fns';
import {
  formatAxisValue,
  formatMetricValue,
  METRIC_AXIS_UNIT,
  METRIC_LABEL,
} from '@/domain/measurement/format';
import type { SeriesWindow } from '@/domain/measurement/range';
import type { MetricType, SeriesPoint } from '@/domain/measurement/types';
import { colors, spacing, typography } from '@/shared/theme';
import {
  buildChartGeometry,
  nearestMarkIndex,
  type ChartKind,
  type ChartMark,
} from '../chart/geometry';

/**
 * Weight is a level that moves a little, so it is a line on a tight scale.
 * The others are daily totals, so they are columns from zero.
 */
const CHART_KIND: Record<MetricType, ChartKind> = {
  weight: 'line',
  steps: 'bar',
  sleep: 'bar',
  water: 'bar',
  workout: 'bar',
};

const HEIGHT = 180;
const PADDING = { top: 12, right: 12, bottom: 8, left: 38 };
const BAR_RADIUS = 4;
const DOT_RADIUS = 4;

interface Props {
  metric: MetricType;
  /** Oldest first. */
  points: readonly SeriesPoint[];
  window: SeriesWindow;
  goal?: number;
}

/** Column with a rounded data end and a square foot on the baseline. */
function barPath(mark: ChartMark): string {
  const { barX: x, y, barWidth: w, barHeight: h } = mark;
  const r = Math.min(BAR_RADIUS, w / 2, h);
  return [
    `M${x} ${y + h}`,
    `L${x} ${y + r}`,
    `Q${x} ${y} ${x + r} ${y}`,
    `L${x + w - r} ${y}`,
    `Q${x + w} ${y} ${x + w} ${y + r}`,
    `L${x + w} ${y + h}`,
    'Z',
  ].join(' ');
}

function bucketLabel(t: number, window: SeriesWindow): string {
  return window.bucketDays > 1
    ? `Week of ${format(new Date(t), 'd MMM')}`
    : format(new Date(t), 'EEE d MMM');
}

/**
 * Trend of one metric over the selected range.
 *
 * One series, so no legend: the card title names it. Values are read from
 * the caption (touch or drag across the plot to move it), the axis, and the
 * summary below, rather than from a label on every mark.
 */
export function TrendChart({ metric, points, window, goal }: Props) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const kind = CHART_KIND[metric];

  const geometry = useMemo(
    () =>
      buildChartGeometry({
        points,
        window,
        kind,
        goal,
        unit: METRIC_AXIS_UNIT[metric],
        size: { width, height: HEIGHT },
        padding: PADDING,
      }),
    [points, window, kind, goal, metric, width],
  );

  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);
  const onTouch = (event: GestureResponderEvent) => {
    const index = nearestMarkIndex(geometry.marks, event.nativeEvent.locationX);
    if (index >= 0) {
      setSelected(index);
    }
  };

  // Until the user picks a point, the caption describes the latest one.
  const activeIndex =
    selected !== null && selected < points.length
      ? selected
      : points.length - 1;
  const active = points[activeIndex];
  const activeMark = geometry.marks[activeIndex];
  if (!active) {
    return null;
  }

  const { plot } = geometry;
  const baselineY = plot.y + plot.height;
  const average = window.bucketDays > 1 && kind === 'bar' ? 'avg ' : '';
  const first = points[0]!;
  const last = points[points.length - 1]!;

  return (
    <View style={styles.container} testID={`chart-${metric}`}>
      <Text style={styles.caption} testID={`chart-${metric}-caption`}>
        {bucketLabel(active.t, window)} · {average}
        {formatMetricValue(metric, active.value)}
      </Text>

      <View
        style={styles.plot}
        onLayout={onLayout}
        testID={`chart-${metric}-plot`}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${METRIC_LABEL[metric]} trend, ${points.length} ${
          points.length === 1 ? 'value' : 'values'
        } from ${formatMetricValue(metric, first.value)} to ${formatMetricValue(
          metric,
          last.value,
        )}`}
        onStartShouldSetResponder={() => true}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT} pointerEvents="none">
            {geometry.ticks.map(tick => (
              <React.Fragment key={tick.value}>
                <Line
                  x1={plot.x}
                  x2={plot.x + plot.width}
                  y1={tick.y}
                  y2={tick.y}
                  stroke={colors.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={plot.x - 6}
                  y={tick.y + 4}
                  fontSize={11}
                  fill={colors.muted}
                  textAnchor="end"
                >
                  {formatAxisValue(metric, tick.value)}
                </SvgText>
              </React.Fragment>
            ))}

            {geometry.goalY !== null ? (
              <>
                <Line
                  x1={plot.x}
                  x2={plot.x + plot.width}
                  y1={geometry.goalY}
                  y2={geometry.goalY}
                  stroke={colors.muted}
                  strokeWidth={1}
                />
              </>
            ) : null}

            {activeMark && selected !== null ? (
              <Line
                x1={activeMark.x}
                x2={activeMark.x}
                y1={plot.y}
                y2={baselineY}
                stroke={colors.muted}
                strokeWidth={1}
              />
            ) : null}

            {kind === 'bar'
              ? geometry.marks.map(mark => (
                  <Path
                    key={mark.index}
                    d={barPath(mark)}
                    fill={colors.primary}
                    opacity={
                      selected === null || mark.index === activeIndex ? 1 : 0.45
                    }
                  />
                ))
              : null}

            {kind === 'line' ? (
              <>
                {geometry.areaPath ? (
                  <Path
                    d={geometry.areaPath}
                    fill={colors.primary}
                    opacity={0.1}
                  />
                ) : null}
                {geometry.linePath ? (
                  <Path
                    d={geometry.linePath}
                    stroke={colors.primary}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    fill="none"
                  />
                ) : null}
                {activeMark ? (
                  // The ring in the surface colour keeps the dot legible on the line.
                  <Circle
                    cx={activeMark.x}
                    cy={activeMark.y}
                    r={DOT_RADIUS + 1}
                    fill={colors.primary}
                    stroke={colors.card}
                    strokeWidth={2}
                  />
                ) : null}
              </>
            ) : null}
          </Svg>
        ) : null}
      </View>

      <View style={styles.xAxis}>
        <Text style={styles.axisLabel}>
          {format(new Date(window.from), 'd MMM')}
        </Text>
        {goal !== undefined ? (
          // A key under the plot, so the label can never sit on the data.
          <View style={styles.goalKey}>
            <View style={styles.goalSwatch} />
            <Text style={styles.axisLabel}>
              Goal {formatMetricValue(metric, goal)}
            </Text>
          </View>
        ) : null}
        <Text style={styles.axisLabel}>
          {format(new Date(window.to - 1), 'd MMM')}
        </Text>
      </View>

      {points.length === 1 ? (
        <Text style={styles.note} testID={`chart-${metric}-single`}>
          Only one value in this range so far. A trend appears once there are
          more.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.lg },
  caption: { ...typography.caption, fontWeight: '600', color: colors.text },
  plot: { height: HEIGHT, marginTop: spacing.xs },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: PADDING.left,
    paddingRight: PADDING.right,
  },
  axisLabel: { fontSize: 11, color: colors.muted },
  goalKey: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  goalSwatch: { width: 14, height: 1, backgroundColor: colors.muted },
  note: { ...typography.caption, color: colors.muted, marginTop: spacing.sm },
});
