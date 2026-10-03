import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { ErrorBoundary } from 'react-error-boundary';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { bootstrap } from '@/app/bootstrap';
import { RootNavigator } from '@/app/navigation/RootNavigator';
import { ServicesProvider } from '@/app/providers/ServicesProvider';
import type { AppServices } from '@/app/services';
import { errorMessage } from '@/domain/errors';
import { ErrorState, LoadingState } from '@/shared/components/StateViews';
import { colors } from '@/shared/theme';

type BootState =
  | { phase: 'loading' }
  | { phase: 'ready'; services: AppServices }
  | { phase: 'error'; message: string };

// Module-level so React strict mode / fast refresh cannot start it twice and
// open the database twice.
let bootPromise: Promise<AppServices> | null = null;

function boot(): Promise<AppServices> {
  if (!bootPromise) {
    bootPromise = bootstrap().catch(error => {
      bootPromise = null;
      throw error;
    });
  }
  return bootPromise;
}

function CrashFallback({
  error,
  resetErrorBoundary,
}: {
  error: unknown;
  resetErrorBoundary: () => void;
}) {
  return (
    <SafeAreaView style={styles.fill}>
      <ErrorState
        title="Something went wrong"
        message={`${errorMessage(
          error,
        )}\n\nYour saved data is safe on this device.`}
        onRetry={resetErrorBoundary}
      />
    </SafeAreaView>
  );
}

export default function App() {
  const [state, setState] = useState<BootState>({ phase: 'loading' });

  const start = useCallback(() => {
    setState({ phase: 'loading' });
    boot().then(
      services => setState({ phase: 'ready', services }),
      error => setState({ phase: 'error', message: errorMessage(error) }),
    );
  }, []);

  useEffect(start, [start]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      {state.phase === 'loading' ? (
        <View style={styles.fill}>
          <LoadingState label="Opening your data…" />
        </View>
      ) : null}
      {state.phase === 'error' ? (
        <SafeAreaView style={styles.fill}>
          <ErrorState
            title="Could not open your data"
            message={state.message}
            onRetry={start}
          />
        </SafeAreaView>
      ) : null}
      {state.phase === 'ready' ? (
        <ErrorBoundary FallbackComponent={CrashFallback}>
          <ServicesProvider services={state.services}>
            <RootNavigator />
          </ServicesProvider>
        </ErrorBoundary>
      ) : null}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
});
