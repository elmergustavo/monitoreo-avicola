import { cn } from '@/lib/utils';
import type { ShedSettings } from '../types';

/** Horizontal scale with the cool / optimal / warm / alert bands and a marker. */
export function ThermalScale({
  value,
  settings,
  className,
}: {
  value: number;
  settings: ShedSettings;
  className?: string;
}) {
  const { tempMin, tempMax, tempAlert } = settings;
  const scaleMin = tempMin - 5;
  const scaleMax = tempAlert + 4;
  const toPercent = (v: number) => ((Math.min(Math.max(v, scaleMin), scaleMax) - scaleMin) / (scaleMax - scaleMin)) * 100;

  const bands = [
    { from: scaleMin, to: tempMin, className: 'bg-cool/45' },
    { from: tempMin, to: tempMax, className: 'bg-optimal/70' },
    { from: tempMax, to: tempAlert, className: 'bg-warm/70' },
    { from: tempAlert, to: scaleMax, className: 'bg-alert/70' },
  ];
  const ticks = [tempMin, tempMax, tempAlert];

  return (
    <div className={className}>
      <div className="relative">
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
          {bands.map((band) => (
            <div key={band.from} className={band.className} style={{ width: `${toPercent(band.to) - toPercent(band.from)}%` }} />
          ))}
        </div>
        <div
          className="absolute -top-1.5 h-5 w-1 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-card transition-[left] duration-500 ease-out"
          style={{ left: `${toPercent(value)}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="relative mt-2 h-4 font-mono text-[11px] text-muted-foreground tabular">
        {ticks.map((tick) => (
          <span key={tick} className={cn('absolute -translate-x-1/2')} style={{ left: `${toPercent(tick)}%` }}>
            {tick}°
          </span>
        ))}
      </div>
      <p className="sr-only">
        Rango óptimo entre {tempMin} y {tempMax} grados; alerta desde {tempAlert} grados.
      </p>
    </div>
  );
}
