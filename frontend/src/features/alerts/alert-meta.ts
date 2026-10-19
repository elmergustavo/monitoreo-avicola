import { CloudOff, Snowflake, ThermometerSun, Timer, TriangleAlert, Flame, type LucideIcon } from 'lucide-react';
import type { AlertKind, AlertSeverity } from '@/lib/types';

export const ALERT_ICONS: Record<AlertKind, LucideIcon> = {
  heat_no_irrigation: ThermometerSun,
  sustained_heat: Flame,
  sustained_cold: Snowflake,
  prolonged_irrigation: Timer,
  sensor_error: TriangleAlert,
  device_offline: CloudOff,
};

/** Surface + text colors per severity (theme tokens, works in light and dark). */
export const SEVERITY_TONE: Record<AlertSeverity, { surface: string; icon: string; label: string }> = {
  critical: { surface: 'border-alert/35 bg-alert/[0.07]', icon: 'bg-alert/15 text-alert', label: 'Crítica' },
  warning: { surface: 'border-warm/40 bg-warm/[0.08]', icon: 'bg-warm/15 text-warm', label: 'Advertencia' },
};
