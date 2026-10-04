import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/app/providers/ServicesProvider';
import { queryKeys } from '@/app/queryClient';
import { errorMessage } from '@/domain/errors';
import { formatGlasses, ML_PER_GLASS } from '@/domain/measurement/format';
import { deviceTzOffsetMs, localDayIndex } from '@/domain/measurement/range';
import { Button } from '@/shared/components/Button';
import { Card } from '@/shared/components/Card';
import { colors, spacing, typography } from '@/shared/theme';
import { MAX_GLASSES_PER_DAY, useWaterIntake } from '../hooks/useWaterIntake';

/** Today's water with buttons to add or take back a glass. */
export function WaterStepper() {
  const { measurements, clock } = useServices();
  const tzOffsetMs = deviceTzOffsetMs();
  const today = useQuery({
    queryKey: queryKeys.today(localDayIndex(clock.now(), tzOffsetMs)),
    queryFn: () => measurements.getToday(clock.now(), tzOffsetMs),
  });
  const water = useWaterIntake();

  const ml = today.data?.water?.value ?? 0;
  const glasses = Math.round(ml / ML_PER_GLASS);

  return (
    <Card style={styles.card} testID="water-stepper">
      <Text style={styles.title}>Today</Text>
      <View style={styles.row}>
        <Button
          testID="water-remove"
          compact
          variant="secondary"
          label="− Glass"
          disabled={glasses === 0 || water.isPending}
          onPress={() => water.mutate(-1)}
        />
        <Text style={styles.value} testID="water-today">
          {formatGlasses(ml)}
        </Text>
        <Button
          testID="water-add"
          compact
          label="+ Glass"
          disabled={glasses >= MAX_GLASSES_PER_DAY || water.isPending}
          onPress={() => water.mutate(1)}
        />
      </View>
      <Text style={styles.hint}>One glass is {ML_PER_GLASS} ml.</Text>
      {water.isError ? (
        <Text style={styles.error}>
          Could not save: {errorMessage(water.error)}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.md },
  title: { ...typography.caption, fontWeight: '600', color: colors.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  value: { ...typography.title, color: colors.text },
  hint: { ...typography.caption, color: colors.muted, marginTop: spacing.sm },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
});
