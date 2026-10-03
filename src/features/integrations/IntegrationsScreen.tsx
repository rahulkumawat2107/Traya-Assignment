import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useServices } from '@/app/providers/ServicesProvider';
import { errorMessage } from '@/domain/errors';
import type {
  ImportFailure,
  ImportReport,
} from '@/integrations/health/HealthImportService';
import type { HealthProvider } from '@/integrations/health/HealthProvider';
import { Button } from '@/shared/components/Button';
import { Card } from '@/shared/components/Card';
import { Screen } from '@/shared/components/Screen';
import { EmptyState } from '@/shared/components/StateViews';
import { colors, spacing, typography } from '@/shared/theme';
import { formatDateTime } from '@/shared/utils/dates';
import { useProviderImport } from './hooks/useProviderImport';

const FAILURE_TITLE: Record<ImportFailure['kind'], string> = {
  unavailable: 'Not available',
  permission_denied: 'Access not granted',
  failed: 'Import failed',
};

function describeReport(report: ImportReport): string {
  const parts: string[] = [];
  if (report.imported > 0) {
    parts.push(`${report.imported} new`);
  }
  if (report.updated > 0) {
    parts.push(`${report.updated} updated`);
  }
  if (report.skipped > 0) {
    parts.push(`${report.skipped} already imported`);
  }
  if (report.rejected > 0) {
    parts.push(`${report.rejected} unreadable and skipped`);
  }
  return parts.length > 0
    ? `${parts.join(', ')}.`
    : 'No readings found for this period.';
}

function ProviderCard({ provider }: { provider: HealthProvider }) {
  const { lastImportAt, importNow } = useProviderImport(provider.id);
  const report = importNow.data;
  const failure = report?.failure ?? null;
  const thrown = importNow.isError ? errorMessage(importNow.error) : null;

  return (
    <Card style={styles.card} testID={`provider-${provider.id}`}>
      <Text style={styles.name}>{provider.name}</Text>
      <Text style={styles.description}>{provider.description}</Text>
      <Text style={styles.meta}>
        {lastImportAt
          ? `Last imported ${formatDateTime(lastImportAt)}`
          : 'Never imported'}
      </Text>

      {failure ? (
        <View style={styles.failure} accessibilityRole="alert">
          <Text style={styles.failureTitle}>{FAILURE_TITLE[failure.kind]}</Text>
          <Text style={styles.failureMessage}>{failure.message}</Text>
        </View>
      ) : null}
      {thrown ? (
        <View style={styles.failure} accessibilityRole="alert">
          <Text style={styles.failureTitle}>{FAILURE_TITLE.failed}</Text>
          <Text style={styles.failureMessage}>{thrown}</Text>
        </View>
      ) : null}
      {report && !failure ? (
        <Text style={styles.result} testID={`provider-${provider.id}-result`}>
          {describeReport(report)}
        </Text>
      ) : null}

      <View style={styles.action}>
        <Button
          testID={`import-${provider.id}`}
          label={failure || thrown ? 'Try again' : 'Import last 30 days'}
          variant="secondary"
          loading={importNow.isPending}
          onPress={() => importNow.mutate()}
        />
      </View>
    </Card>
  );
}

export function IntegrationsScreen() {
  const { healthImport } = useServices();
  const providers = healthImport.listProviders();

  if (providers.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="No health sources"
          message="No health data sources are available on this device."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Import readings from a health source. Importing again never creates
          duplicates.
        </Text>
        {providers.map(provider => (
          <ProviderCard key={provider.id} provider={provider} />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  intro: { ...typography.body, color: colors.muted },
  card: { marginTop: spacing.md },
  name: { ...typography.heading, color: colors.text },
  description: { ...typography.caption, color: colors.muted, marginTop: 2 },
  meta: { ...typography.caption, color: colors.muted, marginTop: spacing.sm },
  failure: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.dangerBg,
  },
  failureTitle: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.danger,
  },
  failureMessage: { ...typography.caption, color: colors.danger, marginTop: 2 },
  result: {
    ...typography.caption,
    color: colors.success,
    marginTop: spacing.md,
  },
  action: { marginTop: spacing.md },
});
