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
import { describeImportAll, useImportAll } from './hooks/useImportAll';
import { useTodaySummary } from './hooks/useTodaySummary';

/**
 * Today at a glance: one card per metric. Every card shows zero until there
 * is data, so the screen has the same shape on first launch as on day 100.
 */
export function DashboardScreen() {
  const navigation = useNavigation();
  const { engine, clock } = useServices();
  const today = useTodaySummary();
  const importAll = useImportAll();
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

  const importMessage = importAll.isError
    ? `Import failed: ${errorMessage(importAll.error)}`
    : importAll.data
    ? describeImportAll(importAll.data)
    : null;

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
            Nothing recorded yet. Import data from your health sources or add
            your weight.
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            testID="import-data"
            label="Import data"
            loading={importAll.isPending}
            onPress={() => importAll.mutate()}
          />
          <Button
            testID="dashboard-add-weight"
            label="Add weight"
            variant="secondary"
            onPress={() => navigation.navigate('MeasurementForm')}
          />
        </View>
        {importMessage ? (
          <Text style={styles.message} testID="import-message">
            {importMessage}
          </Text>
        ) : null}
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
  actions: { gap: spacing.md, marginTop: spacing.xs },
  message: {
    ...typography.caption,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
