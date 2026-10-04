import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import type { RootStackScreenProps } from '@/app/navigation/types';
import { Screen } from '@/shared/components/Screen';
import { spacing } from '@/shared/theme';
import { MetricCard } from './components/MetricCard';
import { RangeSelector } from './components/RangeSelector';
import { WaterStepper } from './components/WaterStepper';

/** Historical progress for one metric: latest value, goal, chart and summary. */
export function MetricDetailScreen({
  route,
}: RootStackScreenProps<'MetricDetail'>) {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <RangeSelector />
        {route.params.metric === 'water' ? <WaterStepper /> : null}
        <MetricCard metric={route.params.metric} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
});
