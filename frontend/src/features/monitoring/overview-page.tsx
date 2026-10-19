import { ChevronRight, Droplets, Plus, Warehouse } from 'lucide-react';
import { ActiveAlertsBanner } from '@/features/alerts/active-alerts-banner';
import { Link } from 'react-router';
import { DataFreshness } from '@/components/data-freshness';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { formatTemp } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { classifyTemperature, THERMAL_LABEL } from '@/lib/thermal';
import type { Device } from '@/lib/types';
import { cn } from '@/lib/utils';
import { THERMAL_ICON, THERMAL_SOFT, THERMAL_TEXT } from './components/thermal-styles';
import { Sparkline } from './components/sparkline';
import { useDevices, useLast24h } from './queries';

const STALE_MS = 2 * 60_000;

export function OverviewPage() {
  const { user, can } = useAuth();
  const { data: devices, isPending, isError, refetch } = useDevices();
  const now = useNow();
  const active = devices?.filter((d) => d.active) ?? [];

  const online = active.filter((d) => d.lastReading && now - Date.parse(d.lastReading.createdAt) < STALE_MS).length;
  const outOfRange = active.filter(
    (d) => d.lastReading && classifyTemperature(d.lastReading.temperature, d.settings) !== 'optimal',
  ).length;
  const irrigating = active.filter((d) => d.lastReading?.irrigation).length;

  return (
    <>
      <PageHeader
        title={`Hola, ${user?.name.split(' ')[0] ?? ''}`}
        description="Estado actual de los galpones de Granjas Avícolas La Sierra."
      />

      <ActiveAlertsBanner />

      {isError ? (
        <div className="rounded-xl border bg-card p-6 text-sm">
          No se pudieron cargar los galpones.{' '}
          <Button variant="link" className="px-1" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-16 text-center">
          <Warehouse className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-medium">Todavía no hay galpones registrados</p>
          {can('devices.manage') && (
            <Button asChild className="mt-5">
              <Link to="/administracion/galpones">
                <Plus aria-hidden="true" /> Registrar galpón
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <dl className="mb-6 grid grid-cols-3 divide-x rounded-xl border bg-card">
            <Kpi label="En línea" value={`${online}/${active.length}`} />
            <Kpi label="Fuera de rango" value={`${outOfRange}`} tone={outOfRange > 0 ? 'text-warm' : undefined} />
            <Kpi label="Regando ahora" value={`${irrigating}`} tone={irrigating > 0 ? 'text-water' : undefined} />
          </dl>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((device) => (
              <ShedCard key={device.id} device={device} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-4 py-4 sm:px-6">
      <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
      <dd className={cn('mt-1 font-display text-2xl font-semibold tracking-tight tabular sm:text-3xl', tone)}>{value}</dd>
    </div>
  );
}

function ShedCard({ device }: { device: Device }) {
  const { data: readings } = useLast24h(device.id);
  const now = useNow(60_000);
  const last = device.lastReading;
  const state = last ? classifyTemperature(last.temperature, device.settings) : null;
  const Icon = state ? THERMAL_ICON[state] : null;
  const recent = readings?.filter((r) => r.at >= now - 6 * 3_600_000) ?? [];

  return (
    <Link
      to={`/galpones/${device.id}`}
      className="group flex flex-col rounded-xl border bg-card p-5 transition-colors duration-150 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-semibold tracking-tight">{device.name}</p>
          <DataFreshness at={last ? Date.parse(last.createdAt) : null} className="text-xs" />
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        {last && state && Icon ? (
          <>
            <p className={cn('font-display leading-none font-semibold tracking-tight tabular', THERMAL_TEXT[state])}>
              <span className="text-5xl">{formatTemp(last.temperature)}</span>
              <span className="ml-0.5 align-top text-xl">°C</span>
            </p>
            <div className="flex flex-col items-end gap-1.5">
              <span className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium', THERMAL_SOFT[state])}>
                <Icon className="size-3.5" aria-hidden="true" />
                {THERMAL_LABEL[state]}
              </span>
              <span className={cn('flex items-center gap-1 text-xs', last.irrigation ? 'text-water' : 'text-muted-foreground')}>
                <Droplets className="size-3.5" aria-hidden="true" />
                {last.irrigation ? 'Regando' : 'Riego apagado'}
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Esperando la primera lectura del dispositivo…</p>
        )}
      </div>

      <Sparkline readings={recent} settings={device.settings} className="mt-4 h-14 w-full" />
      <p className="mt-1 text-[11px] text-muted-foreground">Últimas 6 horas · rango {device.settings.tempMin}–{device.settings.tempMax} °C</p>
    </Link>
  );
}
