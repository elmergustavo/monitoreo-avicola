import { Panel, PanelTitle } from '@/components/panel';
import { formatMinutes, formatTemp, formatTime } from '@/lib/format';
import { computeDayStats } from '../stats';
import type { DeviceEvent, Reading, ShedSettings } from '../types';

interface DaySummaryProps {
  readings: Reading[];
  events: DeviceEvent[];
  settings: ShedSettings;
}

export function DaySummary({ readings, events, settings }: DaySummaryProps) {
  const stats = computeDayStats(readings, events, settings, readings.at(-1)?.at);

  return (
    <Panel>
      <PanelTitle>Hoy</PanelTitle>
      {!stats ? (
        <p className="text-sm text-muted-foreground">Aún no hay lecturas de hoy.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Stat label="Mínima" value={`${formatTemp(stats.min.temperature)}°`} detail={formatTime(stats.min.at)} />
          <Stat label="Máxima" value={`${formatTemp(stats.max.temperature)}°`} detail={formatTime(stats.max.at)} />
          <Stat label="Promedio" value={`${formatTemp(stats.average)}°`} />
          <Stat
            label="Riego"
            value={`${stats.irrigationCycles}`}
            detail={stats.irrigationMinutes > 0 ? formatMinutes(stats.irrigationMinutes) : undefined}
          />
          <div className="col-span-2">
            <dt className="flex justify-between text-sm text-muted-foreground">
              <span>Tiempo en rango óptimo</span>
              <span className="font-medium text-foreground tabular">{Math.round(stats.optimalShare * 100)}%</span>
            </dt>
            <dd className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-optimal transition-[width] duration-500"
                style={{ width: `${stats.optimalShare * 100}%` }}
              />
            </dd>
          </div>
        </dl>
      )}
    </Panel>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-2">
        <span className="font-display text-2xl font-semibold tracking-tight tabular">{value}</span>
        {detail && <span className="font-mono text-xs text-muted-foreground tabular">{detail}</span>}
      </dd>
    </div>
  );
}
