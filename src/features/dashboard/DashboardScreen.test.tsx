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

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

type Context = Awaited<ReturnType<typeof createTestServices>>;

let current: Context | null = null;

async function setup(): Promise<Context> {
  const context = await createTestServices();
  current = context;
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

// A test may assert before every query has answered. Let them finish while
// the component is still mounted, so no update lands after the test ends.
afterEach(async () => {
  const client = current?.services.queryClient;
  if (client) {
    await waitFor(() =>
      expect(client.isFetching() + client.isMutating()).toBe(0),
    );
  }
  current = null;
});

describe('DashboardScreen', () => {
  it('starts clean: a zero card for every metric and no import action', async () => {
    const context = await setup();
    await show(context);

    expect(await screen.findByTestId('dashboard-hint')).toBeTruthy();
    const expected: Record<string, string> = {
      weight: '0.0 kg',
      steps: '0 steps',
      sleep: '0m',
      water: '0 glasses',
      workout: '0m',
    };
    for (const metric of METRIC_TYPES) {
      expect(screen.getByTestId(`today-${metric}-value`)).toHaveTextContent(
        expected[metric]!,
      );
    }
    expect(screen.queryByText(/import/i)).toBeNull();
    expect(screen.getByTestId('dashboard-add-weight')).toBeTruthy();
  });

  it('shows today values once dummy data has been imported', async () => {
    const context = await setup();
    await context.services.healthImport.importAll();
    await show(context);

    await waitFor(() =>
      expect(screen.getByTestId('today-steps-value')).not.toHaveTextContent(
        '0 steps',
      ),
    );
    expect(screen.getByTestId('today-weight-value')).not.toHaveTextContent(
      '0.0 kg',
    );
    expect(screen.getByTestId('today-water-value')).toHaveTextContent(
      /glasses?$/,
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

  it('resets weight to zero when none was recorded today', async () => {
    const context = await setup();
    await context.repos.measurements.create({
      metric: 'weight',
      value: 73.4,
      measuredAt: context.repos.clock.now() - 3 * 86_400_000,
    });
    await show(context);

    await screen.findByTestId('today-grid');
    await waitFor(() =>
      expect(screen.queryByTestId('dashboard-hint')).toBeTruthy(),
    );
    expect(screen.getByTestId('today-weight-value')).toHaveTextContent(
      '0.0 kg',
    );
  });

  it('adds a glass of water locally and queues it for sync', async () => {
    const context = await setup();
    await show(context);
    await screen.findByTestId('dashboard-hint');

    await fireEvent.press(screen.getByTestId('dashboard-add-water'));
    await waitFor(() =>
      expect(screen.getByTestId('today-water-value')).toHaveTextContent(
        '1 glass',
      ),
    );
    await fireEvent.press(screen.getByTestId('dashboard-add-water'));
    await waitFor(() =>
      expect(screen.getByTestId('today-water-value')).toHaveTextContent(
        '2 glasses',
      ),
    );

    // Let the mutation settle so its last state update lands inside the test.
    await waitFor(() =>
      expect(context.services.queryClient.isMutating()).toBe(0),
    );
    expect(await context.repos.measurements.count('water')).toBe(1);
    expect(context.nudgeSync).toHaveBeenCalled();
    expect(context.api.pushCalls).toHaveLength(0);
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
