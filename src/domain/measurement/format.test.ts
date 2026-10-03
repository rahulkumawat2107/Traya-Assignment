import {
  formatDuration,
  formatMetricChange,
  formatMetricValue,
  sourceLabel,
} from './format';

describe('format', () => {
  it('formats zero for every metric', () => {
    expect(formatMetricValue('weight', 0)).toBe('0.0 kg');
    expect(formatMetricValue('steps', 0)).toBe('0 steps');
    expect(formatMetricValue('water', 0)).toBe('0.0 L');
  });

  it('formats each metric with its unit', () => {
    expect(formatMetricValue('weight', 72.56)).toBe('72.6 kg');
    expect(formatMetricValue('steps', 8432.4)).toBe('8,432 steps');
    expect(formatMetricValue('steps', 1234567)).toBe('1,234,567 steps');
    expect(formatMetricValue('sleep', 450)).toBe('7h 30m');
    expect(formatMetricValue('calories', 1850)).toBe('1,850 kcal');
    expect(formatMetricValue('water', 1500)).toBe('1.5 L');
    expect(formatMetricValue('workout', 45)).toBe('45m');
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
    expect(formatMetricChange('water', 250)).toBe('+0.3 L');
    expect(formatMetricChange('water', 20)).toBe('No change');
  });

  it('describes where a reading came from', () => {
    expect(sourceLabel('manual')).toBe('Entered manually');
    expect(sourceLabel('provider:fitband')).toBe('From Fitband');
  });
});
