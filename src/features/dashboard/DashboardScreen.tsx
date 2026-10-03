import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/app/providers/ServicesProvider';
import { queryKeys } from '@/app/queryClient';
import { errorMessage } from '@/domain/errors';
import { METRIC_TYPES } from '@/domain/measurement/types';
import { Button } from '@/shared/components/Button';
import { Screen } from '@/shared/components/Screen';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/shared/components/StateViews';
import { spacing } from '@/shared/theme';
import { MetricCard } from './components/MetricCard';
import { RangeSelector } from './components/RangeSelector';

export function DashboardScreen() {
  const navigation = useNavigation();
  const { measurements, engine } = useServices();
  const [refreshing, setRefreshing] = useState(false);

  const count = useQuery({
    queryKey: queryKeys.count(),
    queryFn: () => measurements.count(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await engine.run({ force: true });
    } finally {
      setRefreshing(false);
    }
  }, [engine]);

  const addWeight = useCallback(
    () => navigation.navigate('MeasurementForm'),
    [navigation],
  );

  if (count.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading your progress…" />
      </Screen>
    );
  }
  if (count.isError) {
    return (
      <Screen>
        <ErrorState
          title="Could not load your data"
          message={errorMessage(count.error)}
          onRetry={() => count.refetch()}
        />
      </Screen>
    );
  }
  if (count.data === 0) {
    return (
      <Screen>
        <EmptyState
          testID="dashboard-empty"
          title="No health data yet"
          message="Record your weight or import data from a health source to start tracking your progress."
          actionLabel="Add weight"
          onAction={addWeight}
          secondaryLabel="Connect a source"
          onSecondary={() =>
            navigation.navigate('Tabs', { screen: 'Integrations' })
          }
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <RangeSelector />
        {METRIC_TYPES.map(metric => (
          <MetricCard key={metric} metric={metric} />
        ))}
        <View style={styles.action}>
          <Button
            testID="dashboard-add-weight"
            label="Add weight"
            onPress={addWeight}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  action: { marginTop: spacing.lg },
});
