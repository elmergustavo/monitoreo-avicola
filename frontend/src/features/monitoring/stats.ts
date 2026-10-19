import type { Reading } from './types';

/** Temperature change over the given window (°C), or null without enough data. */
export function computeTrend(readings: Reading[], windowMs = 30 * 60_000): number | null {
  const last = readings.at(-1);
  if (!last) return null;
  const reference = readings.findLast((r) => r.at <= last.at - windowMs);
  return reference ? last.temperature - reference.temperature : null;
}

export interface IrrigationSpan {
  start: number;
  end: number;
}

/** Continuous periods with irrigation on, derived from the readings. */
export function irrigationSpans(readings: Reading[]): IrrigationSpan[] {
  const spans: IrrigationSpan[] = [];
  let start: number | null = null;
  for (const reading of readings) {
    if (reading.irrigation && start === null) start = reading.at;
    if (!reading.irrigation && start !== null) {
      spans.push({ start, end: reading.at });
      start = null;
    }
  }
  const last = readings.at(-1);
  if (start !== null && last) spans.push({ start, end: last.at });
  return spans;
}
