import React, { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useServices } from '@/app/providers/ServicesProvider';
import { errorMessage } from '@/domain/errors';
import type { MetricType } from '@/domain/measurement/types';
import { Button } from '@/shared/components/Button';
import { Screen } from '@/shared/components/Screen';
import { ErrorState } from '@/shared/components/StateViews';
import { colors, spacing, typography } from '@/shared/theme';
import { formatDate } from '@/shared/utils/dates';
import { TodayCard } from './components/TodayCard';
import { useTodaySummary } from './hooks/useTodaySummary';

/**
 * Today at a glance: one card per metric. Every card shows zero until there
 * is data, so the screen has the same shape on first launch as on day 100.
 */
export function DashboardScreen() {
  const navigation = useNavigation();
  const { engine, clock } = useServices();
  const today = useTodaySummary();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await engine.run({ force: true });
    } finally {
      setRefreshing(false);
    }
  }, [engine]);

  const openMetric = useCallback(
    (metric: MetricType) => navigation.navigate('MetricDetail', { metric }),
    [navigation],
  );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.date}>{formatDate(clock.now())}</Text>

        {today.error ? (
          <ErrorState
            compact
            title="Could not load today's values"
            message={errorMessage(today.error)}
            onRetry={() => today.refetch()}
          />
        ) : null}

        <View style={styles.grid} testID="today-grid">
          {today.metrics.map(item => (
            <TodayCard key={item.metric} item={item} onPress={openMetric} />
          ))}
        </View>

        {!today.isPending && !today.hasAnyData ? (
          <Text style={styles.hint} testID="dashboard-hint">
            Nothing recorded today. Add your weight to get started.
          </Text>
        ) : null}

        <Button
          testID="dashboard-add-weight"
          label="Add weight"
          onPress={() => navigation.navigate('MeasurementForm')}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  date: {
    ...typography.caption,
    color: colors.muted,
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  hint: { ...typography.body, color: colors.muted, marginBottom: spacing.md },
});
