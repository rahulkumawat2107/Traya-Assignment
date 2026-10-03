import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/shared/theme';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  testID?: string;
}

/** Nothing to show yet, and what the user can do about it. */
export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  testID,
}: EmptyStateProps) {
  return (
    <View style={styles.center} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <View style={styles.action}>
          <Button
            label={secondaryLabel}
            onPress={onSecondary}
            variant="secondary"
          />
        </View>
      ) : null}
    </View>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}

/** Something went wrong; say what, and offer the way out. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  compact = false,
}: ErrorStateProps) {
  return (
    <View
      style={compact ? styles.inline : styles.center}
      accessibilityRole="alert"
    >
      <Text style={compact ? styles.inlineTitle : styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <View style={styles.action}>
          <Button
            label="Try again"
            onPress={onRetry}
            variant="secondary"
            compact={compact}
          />
        </View>
      ) : null}
    </View>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[styles.message, styles.loadingLabel]}>{label}</Text>
    </View>
  );
}

interface SkeletonProps {
  height: number;
  width?: number | `${number}%`;
}

/** Placeholder block with the shape of the content that is loading. */
export function Skeleton({ height, width = '100%' }: SkeletonProps) {
  return (
    <View
      accessibilityLabel="Loading"
      style={[styles.skeleton, { height, width }]}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  inline: { paddingVertical: spacing.sm },
  title: { ...typography.heading, color: colors.text, textAlign: 'center' },
  inlineTitle: { ...typography.body, fontWeight: '600', color: colors.danger },
  message: {
    ...typography.body,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  loadingLabel: { marginTop: spacing.md },
  action: { marginTop: spacing.lg, alignSelf: 'stretch' },
  skeleton: {
    backgroundColor: colors.track,
    borderRadius: radius.sm,
    marginVertical: spacing.xs,
  },
});
