import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { RootStackScreenProps } from '@/app/navigation/types';
import { Button } from '@/shared/components/Button';
import { Screen } from '@/shared/components/Screen';
import { spacing } from '@/shared/theme';
import { MetricCard } from './components/MetricCard';
import { RangeSelector } from './components/RangeSelector';
import { WaterStepper } from './components/WaterStepper';

/** Historical progress for one metric: latest value, goal, chart and summary. */
export function MetricDetailScreen({
  navigation,
  route,
}: RootStackScreenProps<'MetricDetail'>) {
  const { metric } = route.params;
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <RangeSelector />
        {metric === 'water' ? <WaterStepper /> : null}
        <MetricCard metric={metric} />
        {metric === 'weight' ? (
          // Weight is the manually recorded metric: its entries can be
          // reviewed, edited and deleted from here.
          <View style={styles.actions}>
            <Button
              testID="add-weight"
              label="Add weight"
              onPress={() => navigation.navigate('MeasurementForm')}
            />
            <Button
              testID="open-history"
              label="All measurements"
              variant="secondary"
              onPress={() => navigation.navigate('History')}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  actions: { marginTop: spacing.lg, gap: spacing.md },
});
