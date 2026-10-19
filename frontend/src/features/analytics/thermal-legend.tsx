import { THERMAL_LABEL } from '@/lib/thermal';
import type { Thresholds } from './types';

/** Color key with words, so the chart does not rely on color alone. */
export function ThermalLegend({ thresholds }: { thresholds: Thresholds }) {
  const { tempMin, tempMax, tempAlert } = thresholds;
  const items = [
    { className: 'bg-cool', label: `${THERMAL_LABEL.cool} (menos de ${tempMin}°)` },
    { className: 'bg-optimal', label: `${THERMAL_LABEL.optimal} (${tempMin}–${tempMax}°)` },
    { className: 'bg-warm', label: `${THERMAL_LABEL.warm} (${tempMax}–${tempAlert}°)` },
    { className: 'bg-alert', label: `${THERMAL_LABEL.alert} (${tempAlert}° o más)` },
  ];
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Colores">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className={`size-3 rounded-sm ${item.className}`} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
