import { CircleCheck, ThermometerSnowflake, ThermometerSun, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ThermalState } from '@/lib/thermal';

export const THERMAL_TEXT: Record<ThermalState, string> = {
  cool: 'text-cool',
  optimal: 'text-optimal',
  warm: 'text-warm',
  alert: 'text-alert',
};

export const THERMAL_BG: Record<ThermalState, string> = {
  cool: 'bg-cool',
  optimal: 'bg-optimal',
  warm: 'bg-warm',
  alert: 'bg-alert',
};

export const THERMAL_SOFT: Record<ThermalState, string> = {
  cool: 'bg-cool/12 text-cool',
  optimal: 'bg-optimal/12 text-optimal',
  warm: 'bg-warm/15 text-warm',
  alert: 'bg-alert/12 text-alert',
};

export const THERMAL_ICON: Record<ThermalState, LucideIcon> = {
  cool: ThermometerSnowflake,
  optimal: CircleCheck,
  warm: ThermometerSun,
  alert: TriangleAlert,
};
