import { ArrowUpRight, BellOff, Check, CircleCheck, Hand, Loader2, Megaphone, Repeat, UserX } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { Panel, PanelTitle } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useDevices } from '@/features/monitoring/queries';
import { formatDateTime } from '@/lib/dates';
import { formatAfter, formatDayLabel, formatDuration, formatTemp, formatTime, startOfDayGt } from '@/lib/format';
import type { AlertKind, AlertStats, AlertView } from '@/lib/types';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { ActiveAlertsBanner } from './active-alerts-banner';
import { ALERT_ICONS, ALERT_LABELS, SEVERITY_TONE } from './alert-meta';
import { useAlertHistory, useAlertStats, type AlertFilters } from './queries';

const PERIODS = { '7': '7 días', '30': '30 días', '90': '90 días' } as const;
type PeriodKey = keyof typeof PERIODS;

const STATUS = { all: 'Todas', active: 'Abiertas', resolved: 'Resueltas' } as const;
type StatusKey = keyof typeof STATUS;

const ALL = 'all';

const minutesBetween = (from: string, to: string | number) =>
  ((typeof to === 'number' ? to : Date.parse(to)) - Date.parse(from)) / 60_000;

export function AlertsPage() {
  const [params, setParams] = useSearchParams();
  const devices = useDevices();

  // Filters live in the URL so a filtered view can be shared or bookmarked.
  const period = (params.get('periodo') ?? '30') in PERIODS ? ((params.get('periodo') ?? '30') as PeriodKey) : '30';
  const status = (params.get('estado') ?? ALL) in STATUS ? ((params.get('estado') ?? ALL) as StatusKey) : ALL;
  const deviceId = params.get('galpon') ?? undefined;
  const kindParam = params.get('tipo');
  const kind = kindParam && kindParam in ALERT_LABELS ? (kindParam as AlertKind) : undefined;

  const setParam = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const filters: AlertFilters = { status: status === ALL ? undefined : status, deviceId, kind };
  const filtered = Boolean(filters.status || deviceId || kind);
  const stats = useAlertStats(Number(period), deviceId);
  const activeDevices = devices.data?.filter((d) => d.active) ?? [];

  return (
    <>
      <PageHeader
        title="Alertas"
        description="Qué pasó en los galpones, cuánto duró y quién lo atendió."
        actions={
          <ToggleGroup
            type="single"
            value={period}
            onValueChange={(value) => value && setParam('periodo', value === '30' ? undefined : value)}
            variant="outline"
            aria-label="Periodo del resumen"
          >
            {(Object.keys(PERIODS) as PeriodKey[]).map((key) => (
              <ToggleGroupItem key={key} value={key} className="h-10 min-w-16 px-3">
                {PERIODS[key]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />

      <StatsSection stats={stats.data} isPending={stats.isPending} isError={stats.isError} />

      <ActiveAlertsBanner deviceId={deviceId} title="Abiertas ahora" className="mt-8 mb-0" />

      <section aria-labelledby="alert-history" className="mt-10">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="alert-history" className="font-display text-xl font-semibold tracking-tight">
            Historial
          </h2>
          <div className="flex flex-wrap gap-2">
            <ToggleGroup
              type="single"
              value={status}
              onValueChange={(value) => value && setParam('estado', value === ALL ? undefined : value)}
              variant="outline"
              aria-label="Estado"
            >
              {(Object.keys(STATUS) as StatusKey[]).map((key) => (
                <ToggleGroupItem key={key} value={key} className="h-10 px-3">
                  {STATUS[key]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {activeDevices.length > 1 && (
              <Select value={deviceId ?? ALL} onValueChange={(value) => setParam('galpon', value === ALL ? undefined : value)}>
                <SelectTrigger className="h-10 w-44" aria-label="Galpón">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos los galpones</SelectItem>
                  {activeDevices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={kind ?? ALL} onValueChange={(value) => setParam('tipo', value === ALL ? undefined : value)}>
              <SelectTrigger className="h-10 w-48" aria-label="Tipo de alerta">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos los tipos</SelectItem>
                {(Object.keys(ALERT_LABELS) as AlertKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {ALERT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <History
          filters={filters}
          filtered={filtered}
          onClear={() =>
            setParams(
              (prev) => {
                const next = new URLSearchParams();
                const keep = prev.get('periodo');
                if (keep) next.set('periodo', keep);
                return next;
              },
              { replace: true },
            )
          }
        />
      </section>
    </>
  );
}

function StatsSection({ stats, isPending, isError }: { stats: AlertStats | undefined; isPending: boolean; isError: boolean }) {
  if (isError) return <p className="text-sm text-destructive">No se pudo cargar el resumen de alertas.</p>;
  if (isPending || !stats) {
    return (
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-44 rounded-xl lg:col-span-7" />
        <Skeleton className="h-44 rounded-xl lg:col-span-5" />
      </div>
    );
  }

  const maxByKind = Math.max(1, ...stats.byKind.map((k) => k.count));
  const attendedShare = stats.total > 0 ? Math.round((stats.acknowledged / stats.total) * 100) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Panel className="lg:col-span-7">
        <PanelTitle>Resumen de {stats.days} días</PanelTitle>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
          <Kpi label="Alertas" value={String(stats.total)} detail={`${stats.critical} críticas`} />
          <Kpi
            label="Respuesta"
            value={stats.avgResponseMin !== null ? formatDuration(stats.avgResponseMin) : '—'}
            detail={attendedShare !== null ? `${attendedShare}% atendidas` : 'promedio'}
          />
          <Kpi
            label="Duración"
            value={stats.avgDurationMin !== null ? formatDuration(stats.avgDurationMin) : '—'}
            detail="promedio hasta normalizar"
          />
          <Kpi
            label="Escaladas"
            value={String(stats.escalated)}
            detail="nadie las atendió a tiempo"
            tone={stats.escalated > 0 ? 'text-alert' : undefined}
          />
        </dl>
      </Panel>
      <Panel className="lg:col-span-5">
        <PanelTitle>Por tipo</PanelTitle>
        {stats.byKind.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-optimal" aria-hidden="true" />
            Sin alertas en este periodo.
          </p>
        ) : (
          <ul className="space-y-3">
            {stats.byKind.map((item) => {
              const Icon = ALERT_ICONS[item.kind];
              return (
                <li key={item.kind}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="font-medium tabular">{item.count}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(item.count / maxByKind) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Kpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>
        <span className={cn('block font-display text-2xl font-semibold tracking-tight tabular', tone)}>{value}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
      </dd>
    </div>
  );
}

function History({ filters, filtered, onClear }: { filters: AlertFilters; filtered: boolean; onClear: () => void }) {
  const query = useAlertHistory(filters);
  const now = useNow(60_000);
  const alerts = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

  // Group by day in Guatemala.
  const days = useMemo(() => {
    const groups: { day: number; items: AlertView[] }[] = [];
    for (const alert of alerts) {
      const day = startOfDayGt(Date.parse(alert.openedAt));
      const last = groups.at(-1);
      if (last?.day === day) last.items.push(alert);
      else groups.push({ day, items: [alert] });
    }
    return groups;
  }, [alerts]);

  if (query.isPending) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  }
  if (query.isError) return <p className="text-sm text-destructive">No se pudo cargar el historial.</p>;
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center">
        <BellOff className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {filtered ? 'No hay alertas con estos filtros.' : 'Todavía no se ha registrado ninguna alerta.'}
        </p>
        {filtered && (
          <Button variant="outline" onClick={onClear}>
            Quitar filtros
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {days.map((group) => (
          <section key={group.day} aria-label={formatDayLabel(group.day, now)}>
            <h3 className="mb-2 text-[13px] font-medium tracking-wide text-muted-foreground uppercase">{formatDayLabel(group.day, now)}</h3>
            <ol className="divide-y rounded-xl border bg-card">
              {group.items.map((alert) => (
                <HistoryRow key={alert.id} alert={alert} now={now} />
              ))}
            </ol>
          </section>
        ))}
      </div>
      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {query.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
          </Button>
        </div>
      )}
    </>
  );
}

const STATUS_PILL = {
  open: { label: 'Abierta', className: 'bg-alert/12 text-alert' },
  acknowledged: { label: 'En atención', className: 'bg-warm/15 text-warm' },
  resolved: { label: 'Resuelta', className: 'bg-muted text-muted-foreground' },
} as const;

function HistoryRow({ alert, now }: { alert: AlertView; now: number }) {
  const Icon = ALERT_ICONS[alert.kind];
  const tone = SEVERITY_TONE[alert.severity];
  const pill = STATUS_PILL[alert.status];
  const openedAt = Date.parse(alert.openedAt);
  const duration = minutesBetween(alert.openedAt, alert.resolvedAt ?? now);
  const temperature =
    alert.kind === 'sustained_cold'
      ? alert.triggerTemperature
      : (alert.peakTemperature ?? alert.triggerTemperature);

  return (
    <li className="flex gap-3 px-4 py-4 sm:px-5">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tone.icon)}>
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-medium">{alert.label}</p>
          <Link
            to={`/galpones/${alert.device.id}`}
            className="inline-flex items-center gap-0.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {alert.device.name}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', pill.className)}>{pill.label}</span>
          <span className="sr-only">{tone.label}</span>
        </div>

        <p className="mt-0.5 text-sm text-muted-foreground tabular">
          <time dateTime={alert.openedAt} title={formatDateTime(alert.openedAt)}>
            {formatTime(openedAt)}
          </time>
          {alert.resolvedAt ? (
            <>
              {' – '}
              <time dateTime={alert.resolvedAt} title={formatDateTime(alert.resolvedAt)}>
                {formatTime(Date.parse(alert.resolvedAt))}
              </time>
              {` · duró ${formatDuration(duration)}`}
            </>
          ) : (
            ` · lleva ${formatDuration(duration)}`
          )}
          {temperature !== null && (
            <>
              {' · '}
              {alert.kind === 'sustained_cold' ? 'mín.' : 'máx.'} {formatTemp(temperature)} °C
            </>
          )}
        </p>

        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {alert.acknowledgedAt && alert.acknowledgedBy ? (
            <li className="flex items-center gap-1.5">
              <Hand className="size-3.5 text-optimal" aria-hidden="true" />
              Atendió {alert.acknowledgedBy.name}
              <span className="text-muted-foreground">{formatAfter(minutesBetween(alert.openedAt, alert.acknowledgedAt))}</span>
            </li>
          ) : (
            alert.status === 'resolved' && (
              <li className="flex items-center gap-1.5 text-muted-foreground">
                <UserX className="size-3.5" aria-hidden="true" />
                Nadie la marcó como atendida
              </li>
            )
          )}
          {alert.escalatedAt && (
            <li className="flex items-center gap-1.5 text-alert">
              <Megaphone className="size-3.5" aria-hidden="true" />
              Escalada {formatAfter(minutesBetween(alert.openedAt, alert.escalatedAt))}
            </li>
          )}
          {alert.reminderCount > 0 && (
            <li className="flex items-center gap-1.5 text-muted-foreground">
              <Repeat className="size-3.5" aria-hidden="true" />
              {alert.reminderCount} {alert.reminderCount === 1 ? 'recordatorio' : 'recordatorios'}
            </li>
          )}
          {alert.resolution && (
            <li className="flex items-center gap-1.5 text-muted-foreground">
              <Check className="size-3.5" aria-hidden="true" />
              {alert.resolution}
            </li>
          )}
        </ul>
      </div>
    </li>
  );
}
