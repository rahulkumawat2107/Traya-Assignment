import type { MetricType } from '@/domain/measurement/types';
import { flOzToMl, hoursToMinutes, lbToKg } from '@/domain/measurement/units';
import type { Normalizer } from '../HealthProvider';
import { isNonEmptyString, isNonNegativeNumber, isObject } from './guards';

/**
 * Provider B ("Pulse Health"): imperial units, sleep in hours, timestamps in
 * epoch seconds, and a generic quantity/unit pair.
 *
 *   { identifier: "ph-1", dataType: "weight", quantity: 160, unit: "lb", startDate: 1790148600 }
 */
type Conversion = { metric: MetricType; convert: (quantity: number) => number };

const CONVERSIONS: Record<string, Conversion> = {
  'weight:lb': { metric: 'weight', convert: lbToKg },
  'weight:kg': { metric: 'weight', convert: quantity => quantity },
  'steps:count': { metric: 'steps', convert: quantity => Math.round(quantity) },
  'sleep:hr': { metric: 'sleep', convert: hoursToMinutes },
  'water:fl_oz': { metric: 'water', convert: flOzToMl },
  'water:ml': { metric: 'water', convert: quantity => Math.round(quantity) },
};

export const normalizeProviderB: Normalizer = raw => {
  if (
    !isObject(raw) ||
    !isNonEmptyString(raw.identifier) ||
    !isNonEmptyString(raw.dataType) ||
    !isNonEmptyString(raw.unit) ||
    !isNonNegativeNumber(raw.quantity) ||
    !isNonNegativeNumber(raw.startDate)
  ) {
    return null;
  }
  const conversion = CONVERSIONS[`${raw.dataType}:${raw.unit}`];
  if (!conversion) {
    // Unknown type or a unit we do not know how to convert: refuse rather
    // than store a number in the wrong unit.
    return null;
  }
  const value = conversion.convert(raw.quantity);
  if (conversion.metric === 'weight' && value === 0) {
    return null;
  }
  return {
    metric: conversion.metric,
    value,
    measuredAt: raw.startDate * 1000,
    externalId: raw.identifier,
  };
};
