import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { ServicesProvider } from '@/app/providers/ServicesProvider';
import { createTestServices } from '@/test/createTestServices';
import { MeasurementForm } from './MeasurementForm';

// The native date picker is not what is under test here.
jest.mock('@/shared/components/DateField', () => ({
  DateField: () => null,
}));

const NOON = new Date(2026, 8, 21, 12, 0, 0).getTime();

async function setup(measurementId?: string) {
  const context = await createTestServices();
  context.repos.clock.set(NOON);
  const onDone = jest.fn();
  return { ...context, onDone, measurementId };
}

async function renderForm(context: Awaited<ReturnType<typeof setup>>) {
  await render(
    <ServicesProvider services={context.services}>
      <MeasurementForm
        measurementId={context.measurementId}
        onDone={context.onDone}
      />
    </ServicesProvider>,
  );
}

describe('MeasurementForm', () => {
  it('shows a field error and saves nothing when submitted empty', async () => {
    const context = await setup();
    await renderForm(context);

    await fireEvent.press(screen.getByTestId('save-button'));

    expect(await screen.findByText('Enter your weight.')).toBeTruthy();
    expect(context.onDone).not.toHaveBeenCalled();
    expect(await context.repos.measurements.count()).toBe(0);
  });

  it('explains what is wrong with a non-numeric value, then clears it on edit', async () => {
    const context = await setup();
    await renderForm(context);

    await fireEvent.changeText(screen.getByTestId('weight-input'), '72kg');
    await fireEvent.press(screen.getByTestId('save-button'));
    expect(
      await screen.findByText('Enter a number, for example 72.5.'),
    ).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('weight-input'), '72');
    expect(screen.queryByTestId('weight-error')).toBeNull();
  });

  it('saves locally, queues the change for sync and closes', async () => {
    const context = await setup();
    await renderForm(context);

    await fireEvent.changeText(screen.getByTestId('weight-input'), '72.5');
    await fireEvent.press(screen.getByTestId('save-button'));

    await waitFor(() => expect(context.onDone).toHaveBeenCalledTimes(1));
    const page = await context.repos.measurements.getHistoryPage('weight', 10);
    expect(page.items[0]).toMatchObject({
      value: 72.5,
      measuredAt: NOON,
      source: 'manual',
      syncStatus: 'pending',
    });
    expect(await context.repos.outbox.getPending(10)).toHaveLength(1);
    expect(context.nudgeSync).toHaveBeenCalled();
    // Nothing was sent: saving never waits for the network.
    expect(context.api.pushCalls).toHaveLength(0);
  });

  it('prefills an existing measurement and saves the edit', async () => {
    const context = await setup();
    const existing = await context.repos.measurements.create({
      metric: 'weight',
      value: 72.8,
      measuredAt: NOON,
    });
    context.measurementId = existing.id;
    await renderForm(context);

    const input = await screen.findByDisplayValue('72.8');
    await fireEvent.changeText(input, '72.6');
    await fireEvent.press(screen.getByTestId('save-button'));

    await waitFor(() => expect(context.onDone).toHaveBeenCalledTimes(1));
    expect((await context.repos.measurements.getById(existing.id))?.value).toBe(
      72.6,
    );
  });

  it('says so when the measurement was deleted elsewhere', async () => {
    const context = await setup();
    const existing = await context.repos.measurements.create({
      metric: 'weight',
      value: 72.8,
      measuredAt: NOON,
    });
    await context.repos.measurements.remove(existing.id);
    context.measurementId = existing.id;
    await renderForm(context);

    expect(
      await screen.findByText('This measurement no longer exists'),
    ).toBeTruthy();
  });
});
