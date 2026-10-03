import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Goal, GoalProgress } from '@/domain/goals/goalProgress';
import { formatMetricValue } from '@/domain/measurement/format';
import { colors, spacing, typography } from '@/shared/theme';

interface Props {
  goal: Goal;
  progress: GoalProgress;
}

export function GoalProgressBar({ goal, progress }: Props) {
  const percent = Math.round(progress.fraction * 100);
  const target = formatMetricValue(goal.metric, goal.targetValue);
  const detail = progress.achieved
    ? 'Goal reached'
    : `${formatMetricValue(goal.metric, progress.remaining)} to go`;

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View style={styles.header}>
        <Text style={styles.text}>Goal {target}</Text>
        <Text style={[styles.text, progress.achieved && styles.achieved]}>
          {detail}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${percent}%` },
            progress.achieved && styles.fillAchieved,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  text: { ...typography.caption, color: colors.muted },
  achieved: { color: colors.success, fontWeight: '600' },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.track,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  fillAchieved: { backgroundColor: colors.success },
});
