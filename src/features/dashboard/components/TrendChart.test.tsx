import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DAY_MS, seriesWindow } from '@/domain/measurement/range';
import { TrendChart } from './TrendChart';

const NOON = new Date(2026, 8, 21, 12, 0, 0).getTime();
const tz = -new Date(NOON).getTimezoneOffset() * 60_000;
const week = seriesWindow('7d', NOON, tz);
const day = (index: number, value: number) => ({
  t: week.from + index * DAY_MS,
  value,
});

async function layout(metric: string, width = 340) {
  await fireEvent(screen.getByTestId(`chart-${metric}-plot`), 'layout', {
    nativeEvent: { layout: { width, height: 180, x: 0, y: 0 } },
  });
}

describe('TrendChart', () => {
  it('describes the latest value until a point is chosen', async () => {
    await render(
      <TrendChart
        metric="steps"
        window={week}
        goal={8000}
        points={[day(0, 4000), day(3, 9000), day(6, 6500)]}
      />,
    );
    await layout('steps');

    expect(screen.getByTestId('chart-steps-caption')).toHaveTextContent(
      'Mon 21 Sep · 6,500 steps',
    );
  });

  it('moves the caption to the point nearest a touch', async () => {
    await render(
      <TrendChart
        metric="weight"
        window={week}
        goal={72}
        points={[day(0, 73.4), day(3, 73.0), day(6, 72.6)]}
      />,
    );
    await layout('weight');

    await fireEvent(screen.getByTestId('chart-weight-plot'), 'responderGrant', {
      nativeEvent: { locationX: 40 },
    });

    expect(screen.getByTestId('chart-weight-caption')).toHaveTextContent(
      'Tue 15 Sep · 73.4 kg',
    );
  });

  it('labels weekly buckets as averages', async () => {
    const quarter = seriesWindow('3m', NOON, tz);
    await render(
      <TrendChart
        metric="steps"
        window={quarter}
        points={[
          { t: quarter.from, value: 7000 },
          { t: quarter.from + 7 * DAY_MS, value: 7500 },
        ]}
      />,
    );

    expect(screen.getByTestId('chart-steps-caption')).toHaveTextContent(
      /^Week of .* · avg 7,500 steps$/,
    );
  });

  it('explains a single value instead of drawing a meaningless trend', async () => {
    await render(
      <TrendChart metric="weight" window={week} points={[day(6, 72.6)]} />,
    );
    await layout('weight');

    expect(screen.getByTestId('chart-weight-single')).toBeTruthy();
  });

  it('renders nothing without data', async () => {
    await render(<TrendChart metric="weight" window={week} points={[]} />);
    expect(screen.queryByTestId('chart-weight')).toBeNull();
  });

  it('summarises itself for screen readers', async () => {
    await render(
      <TrendChart
        metric="water"
        window={week}
        points={[day(5, 1500), day(6, 2000)]}
      />,
    );
    expect(
      screen.getByLabelText(
        'Water trend, 2 values from 6 glasses to 8 glasses',
      ),
    ).toBeTruthy();
  });
});
