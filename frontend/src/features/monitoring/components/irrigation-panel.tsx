import { Droplets } from 'lucide-react';
import { Panel, PanelTitle } from '@/components/panel';
import { formatMinutes, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { irrigationSpans } from '../stats';
import type { DeviceEvent, Reading } from '../types';

const WINDOW_MS = 24 * 3_600_000;

export function IrrigationPanel({ readings, events }: { readings: Reading[]; events: DeviceEvent[] }) {
  const last = readings.at(-1);
  const now = last?.at ?? 0;
  const isOn = last?.irrigation ?? false;
  const lastOn = events.findLast((e) => e.type === 'irrigation_on');
  const lastOff = events.findLast((e) => e.type === 'irrigation_off');
  const since = now - WINDOW_MS;
  const spans = irrigationSpans(readings.filter((r) => r.at >= since));

  return (
    <Panel className="flex flex-col">
      <PanelTitle>Riego</PanelTitle>

      <div className="flex items-center gap-4">
        <div
          className={cn(
            'flex size-14 shrink-0 items-center justify-center rounded-xl transition-colors duration-300',
            isOn ? 'bg-water text-white' : 'bg-muted text-muted-foreground',
          )}
        >
          <Droplets className={cn('size-7', isOn && 'motion-safe:animate-pulse')} aria-hidden="true" />
        </div>
        <div>
          <p className="font-display text-3xl font-semibold tracking-tight">{isOn ? 'Encendido' : 'Apagado'}</p>
          <p className="text-sm text-muted-foreground">
            {isOn && lastOn
              ? `Desde las ${formatTime(lastOn.at)} · ${formatMinutes((now - lastOn.at) / 60_000)}`
              : lastOff
                ? `Último riego a las ${formatTime(lastOff.at)} · duró ${formatMinutes(lastOff.durationMin ?? 0)}`
                : 'Sin riegos registrados'}
          </p>
        </div>
      </div>

      <div className="mt-auto pt-8">
        <div className="mb-2 flex justify-between text-xs text-muted-foreground">
          <span>Últimas 24 horas</span>
          <span className="tabular">{spans.length} riegos</span>
        </div>
        <div className="relative h-7 overflow-hidden rounded-md bg-muted" aria-hidden="true">
          {spans.map((span) => (
            <div
              key={span.start}
              className="absolute inset-y-0 min-w-[3px] bg-water"
              style={{
                left: `${((span.start - since) / WINDOW_MS) * 100}%`,
                width: `${((span.end - span.start) / WINDOW_MS) * 100}%`,
              }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted-foreground tabular">
          <span>{formatTime(since)}</span>
          <span>{formatTime(since + WINDOW_MS / 2)}</span>
          <span>Ahora</span>
        </div>
      </div>
    </Panel>
  );
}
