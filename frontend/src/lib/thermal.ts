import type { ShedSettings } from '@/features/monitoring/types';

export type ThermalState = 'cool' | 'optimal' | 'warm' | 'alert';

export const THERMAL_LABEL: Record<ThermalState, string> = {
  cool: 'Fresco',
  optimal: 'Óptimo',
  warm: 'Calor',
  alert: 'Alerta',
};

export const THERMAL_HINT: Record<ThermalState, string> = {
  cool: 'Por debajo del rango ideal',
  optimal: 'Dentro del rango ideal',
  warm: 'Por encima del rango ideal',
  alert: 'Temperatura de alerta',
};

export function classifyTemperature(value: number, settings: ShedSettings): ThermalState {
  if (value >= settings.tempAlert) return 'alert';
  if (value > settings.tempMax) return 'warm';
  if (value < settings.tempMin) return 'cool';
  return 'optimal';
}
