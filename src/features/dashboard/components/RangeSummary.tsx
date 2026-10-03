import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  formatMetricChange,
  formatMetricValue,
} from '@/domain/measurement/format';
import type { RangeSummary as Summary } from '@/domain/measurement/stats';
import type { MetricType } from '@/domain/measurement/types';
import { colors, spacing, typography } from '@/shared/theme';

interface Props {
  metric: MetricType;
  summary: Summary;
}

/** Average, extremes and change over the selected range. */
export function RangeSummary({ metric, summary }: Props) {
  const stats = [
    { label: 'Average', value: formatMetricValue(metric, summary.average) },
    { label: 'Lowest', value: formatMetricValue(metric, summary.min) },
    { label: 'Highest', value: formatMetricValue(metric, summary.max) },
    { label: 'Change', value: formatMetricChange(metric, summary.change) },
  ];
  return (
    <View style={styles.grid}>
      {stats.map(stat => (
        <View key={stat.label} style={styles.cell}>
          <Text style={styles.label}>{stat.label}</Text>
          <Text style={styles.value}>{stat.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md },
  cell: { width: '50%', paddingVertical: spacing.xs },
  label: { ...typography.caption, color: colors.muted },
  value: { ...typography.body, fontWeight: '600', color: colors.text },
});
