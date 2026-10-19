import { startOfDayGt } from '@/lib/format';
import type { DeviceEvent, Reading, ShedSettings } from './types';

export interface DayStats {
  min: Reading;
  max: Reading;
  average: number;
  optimalShare: number;
  irrigationCycles: number;
  irrigationMinutes: number;
}

export function computeDayStats(
  readings: Reading[],
  events: DeviceEvent[],
  settings: ShedSettings,
  now = Date.now(),
): DayStats | null {
  const since = startOfDayGt(now);
  const today = readings.filter((r) => r.at >= since);
  if (today.length === 0) return null;

  let min = today[0];
  let max = today[0];
  let sum = 0;
  let inRange = 0;
  for (const reading of today) {
    if (reading.temperature < min.temperature) min = reading;
    if (reading.temperature > max.temperature) max = reading;
    sum += reading.temperature;
    if (reading.temperature >= settings.tempMin && reading.temperature <= settings.tempMax) inRange += 1;
  }

  const irrigationOffToday = events.filter((e) => e.type === 'irrigation_off' && e.at >= since);

  return {
    min,
    max,
    average: sum / today.length,
    optimalShare: inRange / today.length,
    irrigationCycles: irrigationOffToday.length,
    irrigationMinutes: irrigationOffToday.reduce((total, e) => total + (e.durationMin ?? 0), 0),
  };
}

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
