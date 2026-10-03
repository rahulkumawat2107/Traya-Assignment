import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { ServicesProvider } from '@/app/providers/ServicesProvider';
import { METRIC_TYPES } from '@/domain/measurement/types';
import { useSyncStatusStore } from '@/shared/state/syncStatusStore';
import { INITIAL_SYNC_STATUS } from '@/sync/types';
import { createTestServices } from '@/test/createTestServices';
import { DashboardScreen } from './DashboardScreen';
import { describeImportAll } from './hooks/useImportAll';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

type Context = Awaited<ReturnType<typeof createTestServices>>;

async function setup(): Promise<Context> {
  const context = await createTestServices();
  context.repos.clock.set(Date.now());
  await context.repos.goals.ensureDefaults();
  return context;
}

async function show(context: Context) {
  await render(
    <ServicesProvider services={context.services}>
      <DashboardScreen />
    </ServicesProvider>,
  );
}

beforeEach(() => {
  useSyncStatusStore.setState(INITIAL_SYNC_STATUS);
  mockNavigate.mockClear();
});

describe('DashboardScreen', () => {
  it('starts with a zero card for every metric and an import button', async () => {
    const context = await setup();
    await show(context);

    expect(await screen.findByTestId('dashboard-hint')).toBeTruthy();
    const expected: Record<string, string> = {
      weight: '0.0 kg',
      steps: '0 steps',
      sleep: '0m',
      calories: '0 kcal',
      water: '0.0 L',
      workout: '0m',
    };
    for (const metric of METRIC_TYPES) {
      expect(screen.getByTestId(`today-${metric}-value`)).toHaveTextContent(
        expected[metric]!,
      );
    }
    expect(screen.getByTestId('import-data')).toBeTruthy();
  });

  it('fills the cards with today values after Import data', async () => {
    const context = await setup();
    await show(context);
    await screen.findByTestId('dashboard-hint');

    await fireEvent.press(screen.getByTestId('import-data'));

    // FitBand imports; Pulse declines once and ScaleCo is not installed.
    expect(await screen.findByTestId('import-message')).toHaveTextContent(
      'Imported 180 readings. 2 sources were not available. Open Sources to see why.',
    );
    await waitFor(() =>
      expect(screen.getByTestId('today-steps-value')).not.toHaveTextContent(
        '0 steps',
      ),
    );
    expect(screen.getByTestId('today-weight-value')).not.toHaveTextContent(
      '0.0 kg',
    );
    expect(screen.queryByTestId('dashboard-hint')).toBeNull();
  });

  it('shows the manual weight over a device reading taken today', async () => {
    const context = await setup();
    const now = context.repos.clock.now();
    await context.repos.measurements.create({
      metric: 'weight',
      value: 72.6,
      measuredAt: now,
    });
    await context.repos.measurements.upsertImported({
      metric: 'weight',
      value: 72.5,
      measuredAt: now,
      source: 'provider:scale',
      externalId: 'w1',
    });
    await show(context);

    await waitFor(() =>
      expect(screen.getByTestId('today-weight-value')).toHaveTextContent(
        '72.6 kg',
      ),
    );
    // Partial data: the other metrics stay at zero rather than failing.
    expect(screen.getByTestId('today-steps-value')).toHaveTextContent(
      '0 steps',
    );
  });

  it('carries the last weight forward when none was recorded today', async () => {
    const context = await setup();
    await context.repos.measurements.create({
      metric: 'weight',
      value: 73.4,
      measuredAt: context.repos.clock.now() - 3 * 86_400_000,
    });
    await show(context);

    await waitFor(() =>
      expect(screen.getByTestId('today-weight-value')).toHaveTextContent(
        '73.4 kg',
      ),
    );
    expect(screen.getByText(/^Last measured /)).toBeTruthy();
  });

  it('opens the trend for a metric when its card is pressed', async () => {
    const context = await setup();
    await show(context);

    await fireEvent.press(await screen.findByTestId('today-steps'));

    expect(mockNavigate).toHaveBeenCalledWith('MetricDetail', {
      metric: 'steps',
    });
  });

  it('tells the user when changes are waiting while offline', async () => {
    const context = await setup();
    useSyncStatusStore.setState({ online: false, pendingCount: 1 });
    await show(context);

    expect(await screen.findByTestId('sync-banner')).toHaveTextContent(
      'Offline. 1 change saved on this device will sync when you reconnect.',
    );
  });
});

describe('describeImportAll', () => {
  const report = (imported: number, failed = false) => ({
    providerId: 'p',
    imported,
    updated: 0,
    skipped: 0,
    rejected: 0,
    failure: failed ? ({ kind: 'unavailable', message: 'x' } as const) : null,
  });

  it('counts what was stored', () => {
    expect(describeImportAll([report(3), report(1)])).toBe(
      'Imported 4 readings.',
    );
    expect(describeImportAll([report(1)])).toBe('Imported 1 reading.');
  });

  it('says so when there was nothing new', () => {
    expect(describeImportAll([report(0)])).toBe('Already up to date.');
  });

  it('mentions sources that could not be read', () => {
    expect(describeImportAll([report(2), report(0, true)])).toBe(
      'Imported 2 readings. 1 source was not available. Open Sources to see why.',
    );
    expect(describeImportAll([report(0, true)])).toBe(
      'No source could be read. Open Sources to see why.',
    );
  });
});
