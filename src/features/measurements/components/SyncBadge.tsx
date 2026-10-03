import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SyncStatus } from '@/domain/measurement/types';
import { colors, radius, spacing } from '@/shared/theme';

const LABEL: Record<SyncStatus, string> = {
  synced: 'Synced',
  pending: 'Waiting to sync',
  failed: 'Not synced',
};

export function SyncBadge({ status }: { status: SyncStatus }) {
  return (
    <View style={[styles.badge, badgeStyles[status]]}>
      <Text style={[styles.label, labelStyles[status]]}>{LABEL[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  label: { fontSize: 12, fontWeight: '600' },
});

const badgeStyles = StyleSheet.create({
  synced: { backgroundColor: colors.successBg },
  pending: { backgroundColor: colors.warningBg },
  failed: { backgroundColor: colors.dangerBg },
});

const labelStyles = StyleSheet.create({
  synced: { color: colors.success },
  pending: { color: colors.warning },
  failed: { color: colors.danger },
});
