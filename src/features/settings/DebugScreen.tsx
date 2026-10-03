import React, { useState, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/app/providers/ServicesProvider';
import { MEASUREMENTS_KEY, queryKeys } from '@/app/queryClient';
import type { NetworkConditions } from '@/api/mock/networkConditions';
import { measurementToDto } from '@/data/mappers';
import { errorMessage } from '@/domain/errors';
import { formatMetricValue } from '@/domain/measurement/format';
import { parseHlc, serializeHlc } from '@/domain/sync/hlc';
import { Button } from '@/shared/components/Button';
import { Card } from '@/shared/components/Card';
import { Screen } from '@/shared/components/Screen';
import { useSyncStatusStore } from '@/shared/state/syncStatusStore';
import { colors, spacing, typography } from '@/shared/theme';
import { formatDateTime, formatTime } from '@/shared/utils/dates';
import { generateSeedReadings } from './seedData';

const SEED_CHUNK = 500;

interface ChoiceProps<T> {
  label: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: ChoiceProps<T>) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.choices}>
        {options.map(option => (
          <Button
            key={String(option.value)}
            compact
            label={option.label}
            variant={option.value === value ? 'primary' : 'secondary'}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testID?: string;
}

function Toggle({ label, value, onChange, testID }: ToggleProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch testID={testID} value={value} onValueChange={onChange} />
    </View>
  );
}

/**
 * Developer tooling for reviewers: drive the mock network into the failure
 * modes the sync engine is built for, and watch the outbox react.
 */
export function DebugScreen() {
  const { debug, engine, outbox, measurements, queryClient, clock } =
    useServices();
  const { conditions, server, healthSimulation } = debug;
  const current = useSyncExternalStore(conditions.subscribe, conditions.get);
  const status = useSyncStatusStore();
  const [scaleInstalled, setScaleInstalled] = useState(
    healthSimulation.isScaleInstalled(),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const ops = useQuery({
    queryKey: queryKeys.outbox(),
    queryFn: () => outbox.list(50),
  });

  const set = (patch: Partial<NetworkConditions>) => conditions.set(patch);

  const runTask = async (name: string, task: () => Promise<string>) => {
    setBusy(name);
    setMessage(null);
    try {
      setMessage(await task());
    } catch (error) {
      setMessage(`Failed: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.outbox() });
    }
  };

  const syncNow = () =>
    runTask('sync', async () => {
      const result = await engine.run({ force: true });
      if (!result.ran) {
        return 'Skipped: the device is offline.';
      }
      return result.error
        ? `Sync failed: ${result.error}`
        : `Pushed ${result.pushed}, pulled ${result.pulled}, rejected ${result.rejected}.`;
    });

  const retryFailed = () =>
    runTask('retry', async () => {
      const result = await engine.retryFailed();
      return `Retried. Pushed ${result.pushed}, rejected ${result.rejected}.`;
    });

  const seed = () =>
    runTask('seed', async () => {
      const readings = generateSeedReadings(clock.now());
      const started = Date.now();
      // Chunked so no single transaction holds the database for long.
      for (let i = 0; i < readings.length; i += SEED_CHUNK) {
        await measurements.insertSeed(readings.slice(i, i + SEED_CHUNK));
      }
      await queryClient.invalidateQueries({ queryKey: MEASUREMENTS_KEY });
      return `Inserted ${readings.length} readings (3 years) in ${
        Date.now() - started
      } ms.`;
    });

  /** Pretends another device edited the newest weight, then syncs. */
  const simulateRemoteEdit = () =>
    runTask('remote', async () => {
      const page = await measurements.getHistoryPage('weight', 1);
      const target = page.items[0];
      if (!target) {
        return 'Add a weight first.';
      }
      const newValue = Math.round((target.value + 0.4) * 10) / 10;
      const physical = Math.max(clock.now(), parseHlc(target.hlc).physical + 1);
      await server.injectRemoteChange({
        ...measurementToDto(target),
        value: newValue,
        hlc: serializeHlc({ physical, counter: 0, nodeId: 'other-device' }),
      });
      await engine.run({ force: true });
      return `Another device changed ${formatMetricValue(
        'weight',
        target.value,
      )} to ${formatMetricValue(
        'weight',
        newValue,
      )}. Its edit is newer, so it wins after sync.`;
    });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.heading}>Mock network</Text>
          <Toggle
            testID="toggle-offline"
            label="Simulate offline"
            value={current.offline}
            onChange={offline => set({ offline })}
          />
          <Choice
            label="Failure rate"
            value={current.failureRate}
            onChange={failureRate => set({ failureRate })}
            options={[
              { label: '0%', value: 0 },
              { label: '50%', value: 0.5 },
              { label: '100%', value: 1 },
            ]}
          />
          <Choice
            label="Latency"
            value={current.maxLatencyMs}
            onChange={maxLatencyMs =>
              set({ maxLatencyMs, minLatencyMs: Math.round(maxLatencyMs / 4) })
            }
            options={[
              { label: 'Fast', value: 600 },
              { label: '3 s', value: 3000 },
              { label: '8 s', value: 8000 },
            ]}
          />
          <Choice
            label="Duplicate delivery"
            value={current.duplicateRate}
            onChange={duplicateRate => set({ duplicateRate })}
            options={[
              { label: '0%', value: 0 },
              { label: '100%', value: 1 },
            ]}
          />
          <Toggle
            label="Deliver out of order"
            value={current.reorder}
            onChange={reorder => set({ reorder })}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.heading}>Sync</Text>
          <Text style={styles.line}>
            {status.online ? 'Online' : 'Offline'} · {status.phase} ·{' '}
            {status.pendingCount} pending · {status.failedCount} failed
          </Text>
          <Text style={styles.line}>
            Last synced:{' '}
            {status.lastSyncedAt
              ? formatDateTime(status.lastSyncedAt)
              : 'never'}
          </Text>
          {status.lastError ? (
            <Text style={styles.errorLine}>Last error: {status.lastError}</Text>
          ) : null}
          <Text style={styles.line}>
            Records on the mock server: {server.recordCount()}
          </Text>
          <View style={styles.buttons}>
            <Button
              testID="sync-now"
              compact
              label="Sync now"
              onPress={syncNow}
              loading={busy === 'sync'}
            />
            <Button
              compact
              variant="secondary"
              label="Retry failed"
              onPress={retryFailed}
              loading={busy === 'retry'}
              disabled={status.failedCount === 0}
            />
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.heading}>Scenarios</Text>
          <Toggle
            label="ScaleCo app installed"
            value={scaleInstalled}
            onChange={installed => {
              healthSimulation.setScaleInstalled(installed);
              setScaleInstalled(installed);
            }}
          />
          <View style={styles.buttons}>
            <Button
              compact
              variant="secondary"
              label="Edit from another device"
              onPress={simulateRemoteEdit}
              loading={busy === 'remote'}
            />
            <Button
              testID="seed"
              compact
              variant="secondary"
              label="Seed 3 years of data"
              onPress={seed}
              loading={busy === 'seed'}
            />
          </View>
          {message ? (
            <Text style={styles.message} testID="debug-message">
              {message}
            </Text>
          ) : null}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.heading}>Outbox ({ops.data?.length ?? 0})</Text>
          {ops.data?.length === 0 ? (
            <Text style={styles.line}>
              Empty. Every local change has been synced.
            </Text>
          ) : null}
          {ops.data?.map(op => (
            <View key={op.opId} style={styles.op}>
              <Text style={styles.opTitle}>
                {op.opType} ·{' '}
                {formatMetricValue(op.payload.metric, op.payload.value)} ·{' '}
                {op.status}
              </Text>
              <Text style={styles.opMeta}>
                attempts {op.attempts}
                {op.nextAttemptAt > 0
                  ? ` · next at ${formatTime(op.nextAttemptAt)}`
                  : ''}
                {op.lastError ? ` · ${op.lastError}` : ''}
              </Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  card: { marginTop: spacing.md },
  heading: {
    ...typography.heading,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  rowLabel: { ...typography.body, color: colors.text, flexShrink: 1 },
  choices: { flexDirection: 'row', gap: spacing.xs },
  line: { ...typography.caption, color: colors.muted, marginTop: 2 },
  errorLine: { ...typography.caption, color: colors.danger, marginTop: 2 },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  message: { ...typography.caption, color: colors.text, marginTop: spacing.md },
  op: {
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  opTitle: { ...typography.caption, fontWeight: '600', color: colors.text },
  opMeta: { ...typography.caption, color: colors.muted },
});
