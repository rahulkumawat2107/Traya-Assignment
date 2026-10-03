import { normalizeAll } from '../HealthProvider';
import { providerAPayload } from '../providers/MockProviderA';
import { providerBPayload } from '../providers/MockProviderB';
import { providerCPayload } from '../providers/MockProviderC';
import { normalizeProviderA } from './providerA';
import { normalizeProviderB } from './providerB';
import { normalizeProviderC } from './providerC';

const MEASURED_AT = Date.UTC(2026, 8, 21, 7, 30, 0);

describe('the same reading from three providers', () => {
  it('normalizes weight_kg, weight (lb) and body_weight (g) to the same value', () => {
    const fromA = normalizeProviderA({
      uid: 'a-1',
      type: 'weight_kg',
      value: 72.57,
      timestamp: '2026-09-21T07:30:00.000Z',
    });
    const fromB = normalizeProviderB({
      identifier: 'b-1',
      dataType: 'weight',
      quantity: 160,
      unit: 'lb',
      startDate: MEASURED_AT / 1000,
    });
    const fromC = normalizeProviderC({
      record_id: 'c-1',
      body_weight: 72570,
      measured_ms: MEASURED_AT,
    });

    const expected = {
      metric: 'weight',
      value: 72.57,
      measuredAt: MEASURED_AT,
    };
    expect(fromA).toEqual({ ...expected, externalId: 'a-1' });
    expect(fromB).toEqual({ ...expected, externalId: 'b-1' });
    expect(fromC).toEqual({ ...expected, externalId: 'c-1' });
  });

  it('normalizes sleep from minutes, hours and seconds to minutes', () => {
    expect(
      normalizeProviderA({
        uid: 'a',
        type: 'sleep_minutes',
        value: 450,
        timestamp: '2026-09-21T07:30:00.000Z',
      })?.value,
    ).toBe(450);
    expect(
      normalizeProviderB({
        identifier: 'b',
        dataType: 'sleep',
        quantity: 7.5,
        unit: 'hr',
        startDate: 1000,
      })?.value,
    ).toBe(450);
    expect(
      normalizeProviderC({
        record_id: 'c',
        sleep_seconds: 27000,
        measured_ms: 1000,
      })?.value,
    ).toBe(450);
  });

  it('normalizes water from millilitres and fluid ounces to millilitres', () => {
    expect(
      normalizeProviderA({
        uid: 'a',
        type: 'water_ml',
        value: 1500,
        timestamp: '2026-09-21T07:30:00.000Z',
      }),
    ).toMatchObject({ metric: 'water', value: 1500 });
    expect(
      normalizeProviderB({
        identifier: 'b',
        dataType: 'water',
        quantity: 1500 / 29.5735,
        unit: 'fl_oz',
        startDate: 1000,
      }),
    ).toMatchObject({ metric: 'water', value: 1500 });
  });

  it('maps calories and workouts, keeping a zero-minute workout day', () => {
    expect(
      normalizeProviderB({
        identifier: 'b',
        dataType: 'calories',
        quantity: 420.4,
        unit: 'kcal',
        startDate: 1000,
      }),
    ).toMatchObject({ metric: 'calories', value: 420 });
    expect(
      normalizeProviderA({
        uid: 'a',
        type: 'workout_minutes',
        value: 0,
        timestamp: '2026-09-21T07:30:00.000Z',
      }),
    ).toMatchObject({ metric: 'workout', value: 0 });
  });

  it('agrees across the mock providers for every day they share', () => {
    const range = {
      from: MEASURED_AT - 5 * 86_400_000,
      to: MEASURED_AT + 3_600_000,
    };
    const weights = (
      payload: unknown[],
      normalize: typeof normalizeProviderA,
    ) =>
      normalizeAll(payload, normalize)
        .readings.filter(r => r.metric === 'weight')
        .map(r => [r.measuredAt, r.value]);

    const a = weights(providerAPayload(range), normalizeProviderA);
    const b = weights(providerBPayload(range), normalizeProviderB);
    const c = weights(providerCPayload(range), normalizeProviderC);

    expect(a.length).toBeGreaterThan(3);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});

describe('malformed payloads', () => {
  const garbage = [null, undefined, 'text', 42, [], {}];

  it.each([
    ['A', normalizeProviderA],
    ['B', normalizeProviderB],
    ['C', normalizeProviderC],
  ])('provider %s rejects values that are not records', (_name, normalize) => {
    for (const value of garbage) {
      expect(normalize(value)).toBeNull();
    }
  });

  it('provider A rejects unknown types, bad timestamps and bad values', () => {
    const valid = {
      uid: 'a',
      type: 'weight_kg',
      value: 72,
      timestamp: '2026-09-21T07:30:00.000Z',
    };
    expect(normalizeProviderA(valid)).not.toBeNull();
    expect(normalizeProviderA({ ...valid, type: 'heart_rate' })).toBeNull();
    expect(normalizeProviderA({ ...valid, timestamp: 'yesterday' })).toBeNull();
    expect(normalizeProviderA({ ...valid, value: '72' })).toBeNull();
    expect(normalizeProviderA({ ...valid, value: -1 })).toBeNull();
    expect(normalizeProviderA({ ...valid, value: 0 })).toBeNull();
    expect(normalizeProviderA({ ...valid, uid: '' })).toBeNull();
  });

  it('provider B refuses a unit it cannot convert instead of guessing', () => {
    expect(
      normalizeProviderB({
        identifier: 'b',
        dataType: 'weight',
        quantity: 11.4,
        unit: 'st',
        startDate: 1000,
      }),
    ).toBeNull();
  });

  it('provider C rejects a record with no known measurement field', () => {
    expect(
      normalizeProviderC({ record_id: 'c', measured_ms: 1000 }),
    ).toBeNull();
    expect(
      normalizeProviderC({
        record_id: 'c',
        body_weight: 'heavy',
        measured_ms: 1000,
      }),
    ).toBeNull();
  });

  it('drops bad records without losing the good ones', () => {
    const result = normalizeAll(
      [
        { record_id: 'ok', body_weight: 72000, measured_ms: 1000 },
        { record_id: 'bad' },
        null,
      ],
      normalizeProviderC,
    );
    expect(result.readings).toHaveLength(1);
    expect(result.rejected).toBe(2);
  });
});
