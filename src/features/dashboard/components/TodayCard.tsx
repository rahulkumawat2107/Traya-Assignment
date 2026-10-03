import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMetricValue, METRIC_LABEL } from '@/domain/measurement/format';
import type { MetricType } from '@/domain/measurement/types';
import { colors, radius, spacing, typography } from '@/shared/theme';
import type { TodayMetric } from '../hooks/useTodaySummary';

interface Props {
  item: TodayMetric;
  onPress: (metric: MetricType) => void;
}

function caption(item: TodayMetric): string {
  if (!item.goal) {
    return item.reading ? 'Today' : 'No data yet';
  }
  if (item.progress?.achieved) {
    return 'Goal reached';
  }
  return `Goal ${formatMetricValue(item.metric, item.goal.targetValue)}`;
}

/** One metric's value for today. Tapping opens its trend. */
function TodayCardComponent({ item, onPress }: Props) {
  const fraction = item.progress?.fraction ?? 0;
  const achieved = item.progress?.achieved ?? false;

  return (
    <Pressable
      testID={`today-${item.metric}`}
      accessibilityRole="button"
      accessibilityLabel={`${METRIC_LABEL[item.metric]}, ${formatMetricValue(
        item.metric,
        item.value,
      )}`}
      onPress={() => onPress(item.metric)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={styles.label}>{METRIC_LABEL[item.metric]}</Text>
      <Text
        style={styles.value}
        numberOfLines={1}
        adjustsFontSizeToFit
        testID={`today-${item.metric}-value`}
      >
        {formatMetricValue(item.metric, item.value)}
      </Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.round(fraction * 100)}%` },
            achieved && styles.fillAchieved,
          ]}
        />
      </View>
      <Text
        style={[styles.caption, achieved && styles.achieved]}
        numberOfLines={1}
      >
        {caption(item)}
      </Text>
    </Pressable>
  );
}

export const TodayCard = memo(TodayCardComponent);

const styles = StyleSheet.create({
  card: {
    width: '48.5%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  pressed: { opacity: 0.7 },
  label: { ...typography.caption, fontWeight: '600', color: colors.muted },
  value: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.xs,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  fillAchieved: { backgroundColor: colors.success },
  caption: {
    ...typography.caption,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  achieved: { color: colors.success, fontWeight: '600' },
});
