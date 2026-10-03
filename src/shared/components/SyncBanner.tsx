import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useServices } from '@/app/providers/ServicesProvider';
import { useSyncStatusStore } from '@/shared/state/syncStatusStore';
import { colors, spacing, typography } from '@/shared/theme';
import { formatTime } from '@/shared/utils/dates';
import type { SyncStatus } from '@/sync/types';

type Tone = 'info' | 'warning' | 'danger';

export interface BannerContent {
  tone: Tone;
  text: string;
  action?: 'retry_failed' | 'sync_now';
}

function changes(count: number): string {
  return count === 1 ? '1 change' : `${count} changes`;
}

/**
 * Decides the single most important thing to tell the user about sync.
 * Pure, so every state can be unit tested without rendering.
 */
export function describeSyncStatus(status: SyncStatus): BannerContent | null {
  const { online, phase, pendingCount, failedCount, lastError, nextRetryAt } =
    status;

  if (!online) {
    return {
      tone: 'warning',
      text:
        pendingCount > 0
          ? `Offline. ${changes(
              pendingCount,
            )} saved on this device will sync when you reconnect.`
          : 'Offline. Changes are saved on this device.',
    };
  }
  if (failedCount > 0) {
    return {
      tone: 'danger',
      text: `${changes(failedCount)} could not be synced.`,
      action: 'retry_failed',
    };
  }
  if (phase === 'syncing') {
    return { tone: 'info', text: 'Syncing…' };
  }
  if (phase === 'error') {
    const retry = nextRetryAt ? ` Retrying at ${formatTime(nextRetryAt)}.` : '';
    const waiting =
      pendingCount > 0 ? ` ${changes(pendingCount)} waiting.` : '';
    return {
      tone: 'danger',
      text: `Sync failed: ${lastError ?? 'unknown error'}.${waiting}${retry}`,
      action: 'sync_now',
    };
  }
  if (pendingCount > 0) {
    return {
      tone: 'info',
      text: `${changes(pendingCount)} waiting to sync.`,
      action: 'sync_now',
    };
  }
  return null;
}

const ACTION_LABEL = { retry_failed: 'Retry', sync_now: 'Sync now' } as const;

/** Always-visible explanation of offline / pending / failed sync states. */
export function SyncBanner() {
  const { engine } = useServices();
  const status = useSyncStatusStore();
  const content = describeSyncStatus(status);

  if (!content) {
    return null;
  }

  const onAction = () => {
    if (content.action === 'retry_failed') {
      engine.retryFailed().catch(() => undefined);
    } else {
      engine.run({ force: true }).catch(() => undefined);
    }
  };

  return (
    <View
      testID="sync-banner"
      accessibilityRole="alert"
      style={[styles.banner, toneStyles[content.tone]]}
    >
      <Text style={[styles.text, toneTextStyles[content.tone]]}>
        {content.text}
      </Text>
      {content.action ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.action, toneTextStyles[content.tone]]}>
            {ACTION_LABEL[content.action]}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  text: { ...typography.caption, flex: 1 },
  action: {
    ...typography.caption,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});

const toneStyles = StyleSheet.create({
  info: { backgroundColor: colors.infoBg },
  warning: { backgroundColor: colors.warningBg },
  danger: { backgroundColor: colors.dangerBg },
});

const toneTextStyles = StyleSheet.create({
  info: { color: colors.info },
  warning: { color: colors.warning },
  danger: { color: colors.danger },
});
