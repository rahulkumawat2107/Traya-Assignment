import { validateMeasurementInput } from './validation';

const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);
const today = new Date(NOW);

const validate = (valueText: string, date: Date = today) =>
  validateMeasurementInput({ valueText, date }, NOW);

describe('validateMeasurementInput', () => {
  it('accepts a valid weight and date', () => {
    expect(validate('72.5')).toEqual({
      ok: true,
      value: 72.5,
      measuredAt: NOW,
    });
  });

  it('accepts a comma as the decimal separator and trims spaces', () => {
    expect(validate(' 72,5 ')).toMatchObject({ ok: true, value: 72.5 });
  });

  it('rounds to two decimals', () => {
    expect(validate('72.456')).toMatchObject({ ok: true, value: 72.46 });
  });

  it('requires a value', () => {
    expect(validate('')).toEqual({
      ok: false,
      errors: { value: 'Enter your weight.' },
    });
    expect(validate('   ')).toMatchObject({ ok: false });
  });

  it.each(['abc', '72kg', '7 2', '-5', '1e3', '72.', '.5', '7.2.5'])(
    'rejects non-numeric input %p',
    text => {
      expect(validate(text)).toEqual({
        ok: false,
        errors: { value: 'Enter a number, for example 72.5.' },
      });
    },
  );

  it('rejects values outside the plausible range', () => {
    const message = 'Weight must be between 20 and 400 kg.';
    expect(validate('19.9')).toEqual({ ok: false, errors: { value: message } });
    expect(validate('400.1')).toEqual({
      ok: false,
      errors: { value: message },
    });
    expect(validate('20')).toMatchObject({ ok: true });
    expect(validate('400')).toMatchObject({ ok: true });
  });

  it('rejects a future date but allows the current minute', () => {
    expect(validate('72.5', new Date(NOW + 3_600_000))).toEqual({
      ok: false,
      errors: { date: 'The date cannot be in the future.' },
    });
    expect(validate('72.5', new Date(NOW + 30_000))).toMatchObject({
      ok: true,
    });
  });

  it('rejects an implausibly old or invalid date', () => {
    expect(validate('72.5', new Date(Date.UTC(1990, 0, 1)))).toMatchObject({
      ok: false,
      errors: { date: 'Choose a date after 1 Jan 2000.' },
    });
    expect(validate('72.5', new Date(NaN))).toMatchObject({
      ok: false,
      errors: { date: 'Choose a date.' },
    });
  });

  it('reports every invalid field at once', () => {
    expect(validate('', new Date(NOW + 3_600_000))).toEqual({
      ok: false,
      errors: {
        value: 'Enter your weight.',
        date: 'The date cannot be in the future.',
      },
    });
  });
});
