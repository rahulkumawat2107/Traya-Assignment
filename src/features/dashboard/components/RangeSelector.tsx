import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HistoryRange } from '@/domain/measurement/types';
import { useUiStore } from '@/shared/state/uiStore';
import { colors, radius, spacing } from '@/shared/theme';

const OPTIONS: { range: HistoryRange; label: string }[] = [
  { range: '7d', label: '7 days' },
  { range: '30d', label: '30 days' },
  { range: '3m', label: '3 months' },
];

export function RangeSelector() {
  const range = useUiStore(state => state.range);
  const setRange = useUiStore(state => state.setRange);

  return (
    <View style={styles.container} accessibilityRole="tablist">
      {OPTIONS.map(option => {
        const selected = option.range === range;
        return (
          <Pressable
            key={option.range}
            testID={`range-${option.range}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => setRange(option.range)}
            style={[styles.option, selected && styles.selected]}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.track,
    borderRadius: radius.md,
    padding: 3,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  selected: { backgroundColor: colors.card },
  label: { fontSize: 14, fontWeight: '500', color: colors.muted },
  selectedLabel: { color: colors.text, fontWeight: '600' },
});
