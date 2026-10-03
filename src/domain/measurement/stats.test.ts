import { summarize, trendOf } from './stats';
import { gramsToKg, hoursToMinutes, lbToKg, roundTo } from './units';

describe('summarize', () => {
  it('returns null for an empty range', () => {
    expect(summarize([])).toBeNull();
  });

  it('handles a single data point', () => {
    expect(summarize([{ t: 1, value: 72.5 }])).toEqual({
      latest: 72.5,
      average: 72.5,
      min: 72.5,
      max: 72.5,
      change: 0,
      count: 1,
    });
  });

  it('computes latest, average, extremes and change', () => {
    const summary = summarize([
      { t: 1, value: 74 },
      { t: 2, value: 72 },
      { t: 3, value: 73 },
    ]);
    expect(summary).toEqual({
      latest: 73,
      average: 73,
      min: 72,
      max: 74,
      change: -1,
      count: 3,
    });
  });
});

describe('trendOf', () => {
  it('classifies the change with a tolerance', () => {
    expect(trendOf(0.5)).toBe('up');
    expect(trendOf(-0.5)).toBe('down');
    expect(trendOf(0.01)).toBe('flat');
    expect(trendOf(0)).toBe('flat');
  });
});

describe('units', () => {
  it('converts pounds to kilograms', () => {
    expect(lbToKg(160)).toBe(72.57);
  });

  it('converts grams to kilograms', () => {
    expect(gramsToKg(72570)).toBe(72.57);
  });

  it('converts hours to whole minutes', () => {
    expect(hoursToMinutes(7.5)).toBe(450);
  });

  it('rounds to the requested precision', () => {
    expect(roundTo(72.5678, 1)).toBe(72.6);
    expect(roundTo(72.5678, 0)).toBe(73);
  });
});
