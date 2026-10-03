const KG_PER_LB = 0.45359237;

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function lbToKg(lb: number): number {
  return roundTo(lb * KG_PER_LB, 2);
}

export function gramsToKg(grams: number): number {
  return roundTo(grams / 1000, 2);
}

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

export function secondsToMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}
