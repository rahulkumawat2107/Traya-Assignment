import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ServicesProvider } from '@/app/providers/ServicesProvider';
import { useSyncStatusStore } from '@/shared/state/syncStatusStore';
import { INITIAL_SYNC_STATUS } from '@/sync/types';
import { createTestServices } from '@/test/createTestServices';
import { DashboardScreen } from './DashboardScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

async function renderDashboard() {
  const context = await createTestServices();
  context.repos.clock.set(Date.now());
  return context;
}

async function show(context: Awaited<ReturnType<typeof renderDashboard>>) {
  await render(
    <ServicesProvider services={context.services}>
      <DashboardScreen />
    </ServicesProvider>,
  );
}

beforeEach(() => {
  useSyncStatusStore.setState(INITIAL_SYNC_STATUS);
});

describe('DashboardScreen', () => {
  it('shows the empty state with both ways to add data when there is none', async () => {
    const context = await renderDashboard();
    await show(context);

    expect(await screen.findByTestId('dashboard-empty')).toBeTruthy();
    expect(screen.getByText('No health data yet')).toBeTruthy();
    expect(screen.getByText('Add weight')).toBeTruthy();
    expect(screen.getByText('Connect a source')).toBeTruthy();
  });

  it('shows the manual value over a device reading and handles partial data', async () => {
    const context = await renderDashboard();
    const now = context.repos.clock.now();
    await context.repos.measurements.create({
      metric: 'weight',
      value: 72.6,
      measuredAt: now - 60_000,
    });
    await context.repos.measurements.upsertImported({
      metric: 'weight',
      value: 72.5,
      measuredAt: now - 30_000,
      source: 'provider:scale',
      externalId: 'w1',
    });
    await show(context);

    const value = await screen.findByTestId('metric-weight-value');
    expect(value).toHaveTextContent('72.6 kg');
    // Weight has data; steps and sleep do not, and say so without failing.
    expect(await screen.findByTestId('metric-steps-empty')).toBeTruthy();
    expect(await screen.findByTestId('metric-sleep-empty')).toBeTruthy();
  });

  it('tells the user when changes are waiting while offline', async () => {
    const context = await renderDashboard();
    await context.repos.measurements.create({
      metric: 'weight',
      value: 72.6,
      measuredAt: context.repos.clock.now(),
    });
    useSyncStatusStore.setState({ online: false, pendingCount: 1 });
    await show(context);

    expect(await screen.findByTestId('sync-banner')).toHaveTextContent(
      'Offline. 1 change saved on this device will sync when you reconnect.',
    );
  });
});
