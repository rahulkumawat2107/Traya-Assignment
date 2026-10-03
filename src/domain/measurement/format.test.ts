import {
  formatDuration,
  formatMetricChange,
  formatMetricValue,
  sourceLabel,
} from './format';

describe('format', () => {
  it('formats each metric with its unit', () => {
    expect(formatMetricValue('weight', 72.56)).toBe('72.6 kg');
    expect(formatMetricValue('steps', 8432.4)).toBe('8,432 steps');
    expect(formatMetricValue('steps', 1234567)).toBe('1,234,567 steps');
    expect(formatMetricValue('sleep', 450)).toBe('7h 30m');
  });

  it('formats durations at the edges', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(480)).toBe('8h');
  });

  it('formats changes with a sign', () => {
    expect(formatMetricChange('weight', -1.24)).toBe('-1.2 kg');
    expect(formatMetricChange('steps', 350)).toBe('+350 steps');
    expect(formatMetricChange('sleep', 25)).toBe('+25m');
    expect(formatMetricChange('weight', 0.04)).toBe('No change');
  });

  it('describes where a reading came from', () => {
    expect(sourceLabel('manual')).toBe('Entered manually');
    expect(sourceLabel('provider:fitband')).toBe('From Fitband');
  });
});
