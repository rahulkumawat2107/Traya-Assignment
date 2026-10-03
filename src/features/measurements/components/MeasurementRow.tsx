import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMetricValue, sourceLabel } from '@/domain/measurement/format';
import type { Measurement } from '@/domain/measurement/types';
import { colors, spacing, typography } from '@/shared/theme';
import { formatDateTime } from '@/shared/utils/dates';
import { SyncBadge } from './SyncBadge';

/** Fixed, so the list can compute offsets without measuring rows. */
export const MEASUREMENT_ROW_HEIGHT = 68;

interface Props {
  item: Measurement;
  onPress: (item: Measurement) => void;
}

function MeasurementRowComponent({ item, onPress }: Props) {
  return (
    <Pressable
      testID={`measurement-row-${item.id}`}
      accessibilityRole="button"
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.main}>
        <Text style={styles.value}>
          {formatMetricValue(item.metric, item.value)}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatDateTime(item.measuredAt)} · {sourceLabel(item.source)}
        </Text>
      </View>
      <SyncBadge status={item.syncStatus} />
    </Pressable>
  );
}

/**
 * Memoised: a row re-renders only when its own measurement object changes,
 * not whenever the list or the sync banner updates.
 */
export const MeasurementRow = memo(MeasurementRowComponent);

const styles = StyleSheet.create({
  row: {
    height: MEASUREMENT_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  pressed: { backgroundColor: colors.background },
  main: { flex: 1 },
  value: { ...typography.heading, color: colors.text },
  meta: { ...typography.caption, color: colors.muted, marginTop: 2 },
});
