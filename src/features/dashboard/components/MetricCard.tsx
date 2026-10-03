import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@/domain/errors';
import {
  formatMetricValue,
  METRIC_LABEL,
  sourceLabel,
} from '@/domain/measurement/format';
import type { HistoryRange, MetricType } from '@/domain/measurement/types';
import { Card } from '@/shared/components/Card';
import { ErrorState, Skeleton } from '@/shared/components/StateViews';
import { useUiStore } from '@/shared/state/uiStore';
import { colors, spacing, typography } from '@/shared/theme';
import { formatDateTime } from '@/shared/utils/dates';
import { useDashboardSummary } from '../hooks/useDashboardSummary';
import { GoalProgressBar } from './GoalProgressBar';
import { RangeSummary } from './RangeSummary';

const RANGE_PHRASE: Record<HistoryRange, string> = {
  '7d': 'the last 7 days',
  '30d': 'the last 30 days',
  '3m': 'the last 3 months',
};

interface Props {
  metric: MetricType;
}

/**
 * One metric on the dashboard. Each card runs its own queries, so one metric
 * failing or being empty never blanks the others (partial data).
 */
function MetricCardComponent({ metric }: Props) {
  const range = useUiStore(state => state.range);
  const data = useDashboardSummary(metric, range);

  let body: React.ReactNode;
  if (data.isPending) {
    body = (
      <View testID={`metric-${metric}-loading`}>
        <Skeleton height={34} width="45%" />
        <Skeleton height={14} width="70%" />
        <Skeleton height={48} />
      </View>
    );
  } else if (data.error) {
    body = (
      <ErrorState
        compact
        title={`Could not load ${METRIC_LABEL[metric].toLowerCase()}`}
        message={errorMessage(data.error)}
        onRetry={data.refetch}
      />
    );
  } else if (!data.latest) {
    body = (
      <Text style={styles.empty} testID={`metric-${metric}-empty`}>
        No {METRIC_LABEL[metric].toLowerCase()} data yet.
        {metric === 'weight'
          ? ' Add a measurement or import from a connected source.'
          : ' Import from a connected source to see it here.'}
      </Text>
    );
  } else {
    body = (
      <>
        <Text style={styles.value} testID={`metric-${metric}-value`}>
          {formatMetricValue(metric, data.latest.value)}
        </Text>
        <Text style={styles.meta}>
          {formatDateTime(data.latest.measuredAt)} ·{' '}
          {sourceLabel(data.latest.source)}
        </Text>
        {data.goal && data.progress ? (
          <GoalProgressBar goal={data.goal} progress={data.progress} />
        ) : null}
        {data.summary ? (
          <RangeSummary metric={metric} summary={data.summary} />
        ) : (
          <Text style={styles.noRange} testID={`metric-${metric}-no-range`}>
            No data in {RANGE_PHRASE[range]}. The reading above is the most
            recent one.
          </Text>
        )}
      </>
    );
  }

  return (
    <Card testID={`metric-${metric}`} style={styles.card}>
      <Text style={styles.title}>{METRIC_LABEL[metric]}</Text>
      {body}
    </Card>
  );
}

export const MetricCard = memo(MetricCardComponent);

const styles = StyleSheet.create({
  card: { marginTop: spacing.md },
  title: { ...typography.caption, fontWeight: '600', color: colors.muted },
  value: { ...typography.value, color: colors.text, marginTop: spacing.xs },
  meta: { ...typography.caption, color: colors.muted },
  empty: { ...typography.body, color: colors.muted, marginTop: spacing.sm },
  noRange: {
    ...typography.caption,
    color: colors.muted,
    marginTop: spacing.md,
  },
});
