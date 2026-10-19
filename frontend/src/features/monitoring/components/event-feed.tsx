import { Droplet, DropletOff, ThermometerSun, Timer, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Panel, PanelTitle } from '@/components/panel';
import { formatDayLabel, formatMinutes, formatTemp, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DeviceEvent, EventType } from '../types';

const MAX_EVENTS = 14;

const EVENT_META: Record<EventType, { title: string; icon: LucideIcon; tone: string; emphasis?: boolean }> = {
  irrigation_on: { title: 'Riego encendido', icon: Droplet, tone: 'bg-water/15 text-water' },
  irrigation_off: { title: 'Riego apagado', icon: DropletOff, tone: 'bg-muted text-muted-foreground' },
  heat_alert_no_irrigation: {
    title: 'Calor sin riego',
    icon: ThermometerSun,
    tone: 'bg-alert/12 text-alert',
    emphasis: true,
  },
  prolonged_irrigation_alert: { title: 'Riego prolongado', icon: Timer, tone: 'bg-warm/15 text-warm', emphasis: true },
  sensor_error: { title: 'Error del sensor', icon: TriangleAlert, tone: 'bg-alert/12 text-alert', emphasis: true },
};

function describe(event: DeviceEvent): string {
  const temperature = event.temperature !== null ? `${formatTemp(event.temperature)} °C` : null;
  switch (event.type) {
    case 'irrigation_on':
      return temperature ? `Con ${temperature}` : 'Sin lectura de temperatura';
    case 'irrigation_off':
      return [event.durationMin !== null ? `Duró ${formatMinutes(event.durationMin)}` : null, temperature]
        .filter(Boolean)
        .join(' · ');
    case 'heat_alert_no_irrigation':
      return `${temperature ?? 'Temperatura alta'} y el riego apagado`;
    case 'prolonged_irrigation_alert':
      return event.durationMin !== null ? `Lleva ${formatMinutes(event.durationMin)} encendido` : 'Riego muy largo';
    case 'sensor_error':
      return 'No se pudo leer la temperatura';
  }
}

export function EventFeed({ events }: { events: DeviceEvent[] }) {
  const recent = events.slice(-MAX_EVENTS).reverse();
  const groups = new Map<string, DeviceEvent[]>();
  for (const event of recent) {
    const day = formatDayLabel(event.at);
    groups.set(day, [...(groups.get(day) ?? []), event]);
  }

  return (
    <Panel className="flex flex-col">
      <PanelTitle>Eventos</PanelTitle>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
      ) : (
        <div className="-mr-2 max-h-[26rem] space-y-5 overflow-y-auto pr-2">
          {[...groups.entries()].map(([day, items]) => (
            <section key={day}>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">{day}</h3>
              <ol className="space-y-1">
                {items.map((event) => {
                  const meta = EVENT_META[event.type];
                  const Icon = meta.icon;
                  return (
                    <li key={event.id} className="flex items-center gap-3 rounded-lg py-1.5">
                      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', meta.tone)}>
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm', meta.emphasis ? 'font-semibold' : 'font-medium')}>{meta.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{describe(event)}</p>
                      </div>
                      <time className="font-mono text-xs text-muted-foreground tabular" dateTime={new Date(event.at).toISOString()}>
                        {formatTime(event.at)}
                      </time>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}
