import { Panel, PanelTitle } from '@/components/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMinutes, formatTemp, formatTime } from '@/lib/format';
import type { DaySummaryDto } from '@/lib/types';

export function DaySummary({ summary }: { summary: DaySummaryDto | undefined }) {
  return (
    <Panel>
      <PanelTitle>Hoy</PanelTitle>
      {!summary ? (
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : summary.readingsCount === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay lecturas de hoy.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Stat
            label="Mínima"
            value={summary.min ? `${formatTemp(summary.min.temperature)}°` : '—'}
            detail={summary.min ? formatTime(Date.parse(summary.min.at)) : undefined}
          />
          <Stat
            label="Máxima"
            value={summary.max ? `${formatTemp(summary.max.temperature)}°` : '—'}
            detail={summary.max ? formatTime(Date.parse(summary.max.at)) : undefined}
          />
          <Stat label="Promedio" value={summary.average !== null ? `${formatTemp(summary.average)}°` : '—'} />
          <Stat
            label="Riegos"
            value={`${summary.irrigationCycles}`}
            detail={summary.irrigationMinutes > 0 ? formatMinutes(summary.irrigationMinutes) : undefined}
          />
          {summary.optimalShare !== null && (
            <div className="col-span-2">
              <dt className="flex justify-between text-sm text-muted-foreground">
                <span>Tiempo en rango óptimo</span>
                <span className="font-medium text-foreground tabular">{Math.round(summary.optimalShare * 100)}%</span>
              </dt>
              <dd className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-optimal transition-[width] duration-500"
                  style={{ width: `${summary.optimalShare * 100}%` }}
                />
              </dd>
            </div>
          )}
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
