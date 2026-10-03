export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 400;

/** Earliest date accepted; guards against a mistyped year. */
const EARLIEST_MS = Date.UTC(2000, 0, 1);
/** Tolerance for "now" so a reading taken this minute is not "in the future". */
const FUTURE_TOLERANCE_MS = 60_000;

export interface MeasurementInput {
  /** Raw text from the input, exactly as typed. */
  valueText: string;
  date: Date;
}

export interface FieldErrors {
  value?: string;
  date?: string;
}

export type ValidationResult =
  | { ok: true; value: number; measuredAt: number }
  | { ok: false; errors: FieldErrors };

/**
 * Validates the weight form. Pure: takes "now" as an argument, returns
 * either the parsed values or one message per invalid field.
 */
export function validateMeasurementInput(
  input: MeasurementInput,
  now: number,
): ValidationResult {
  const errors: FieldErrors = {};

  // Accept a comma as the decimal separator; many locales type "72,5".
  const text = input.valueText.trim().replace(',', '.');
  let value = NaN;
  if (text.length === 0) {
    errors.value = 'Enter your weight.';
  } else if (!/^\d+(\.\d+)?$/.test(text)) {
    errors.value = 'Enter a number, for example 72.5.';
  } else {
    value = Math.round(Number(text) * 100) / 100;
    if (value < WEIGHT_MIN_KG || value > WEIGHT_MAX_KG) {
      errors.value = `Weight must be between ${WEIGHT_MIN_KG} and ${WEIGHT_MAX_KG} kg.`;
    }
  }

  const measuredAt = input.date.getTime();
  if (Number.isNaN(measuredAt)) {
    errors.date = 'Choose a date.';
  } else if (measuredAt > now + FUTURE_TOLERANCE_MS) {
    errors.date = 'The date cannot be in the future.';
  } else if (measuredAt < EARLIEST_MS) {
    errors.date = 'Choose a date after 1 Jan 2000.';
  }

  if (errors.value || errors.date) {
    return { ok: false, errors };
  }
  return { ok: true, value, measuredAt };
}
