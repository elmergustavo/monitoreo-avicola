import { ArrowDownRight, ArrowUpRight, CalendarRange, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ChoiceChips } from '@/components/choice-chips';
import { DateField } from '@/components/date-field';
import { PageHeader } from '@/components/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDevices } from '@/features/monitoring/queries';
import {
  addDays,
  daysInRange,
  describeRange,
  presetRange,
  todayGt,
  validateRange,
  type DateRange,
  type PresetKey,
} from '@/features/reports/periods';
import { formatDateTime } from '@/lib/dates';
import { formatTemp } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CompareChart } from './charts/compare-chart';
import { ExplorerChart } from './charts/explorer-chart';
import { HeatmapChart } from './charts/heatmap-chart';
import { IrrigationChart } from './charts/irrigation-chart';
import { RangesChart } from './charts/ranges-chart';
import { formatDayKeyShort, percent, signed } from './format';
import { useAnalytics, type AnalyticsParams } from './queries';

const PERIODS: Array<{ key: PresetKey; label: string }> = [
  { key: 'today', label: 'Hoy' },
  { key: 'last7', label: '7 días' },
  { key: 'last30', label: '30 días' },
  { key: 'last90', label: '90 días' },
  { key: 'thisMonth', label: 'Este mes' },
  { key: 'lastMonth', label: 'Mes anterior' },
  { key: 'custom', label: 'Personalizado' },
];
const DEFAULT_PERIOD: PresetKey = 'last7';
const minKey = (a: string, b: string) => (a < b ? a : b);

export function AnalyticsPage() {
  const devices = useDevices();
  const [params, setParams] = useSearchParams();
  const today = todayGt();

  // Filters live in the URL so a view can be bookmarked or shared.
  const active = devices.data?.filter((d) => d.active) ?? [];
  const device = active.find((d) => d.id === params.get('galpon')) ?? active[0];
  const presetParam = params.get('periodo') as PresetKey | null;
  const preset: PresetKey = PERIODS.some((p) => p.key === presetParam) ? presetParam! : DEFAULT_PERIOD;
  const custom: DateRange = {
    from: params.get('desde') ?? addDays(today, -6),
    to: params.get('hasta') ?? today,
  };
  const range = preset === 'custom' ? custom : presetRange(preset);
  const rangeError = validateRange(range);
  const days = daysInRange(range);

  const update = (changes: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );

  const query: AnalyticsParams | null = device && !rangeError ? { deviceId: device.id, from: range.from, to: range.to } : null;
  const fileName = device ? `${slug(device.name)}-${range.from}-a-${range.to}` : 'analisis';

  if (devices.isPending) return <Skeleton className="h-96 rounded-xl" />;
  if (!device) {
    return (
      <>
        <PageHeader title="Análisis" />
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Todavía no hay galpones registrados.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Análisis" description="Tendencias de temperatura y riego para entender cómo se comporta cada galpón." />

      <section aria-label="Filtros" className="mb-6 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {active.length > 1 && (
            <div className="shrink-0">
              <Select value={device.id} onValueChange={(id) => update({ galpon: id })}>
                <SelectTrigger className="h-10 w-full lg:w-48" aria-label="Galpón">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {active.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <ChoiceChips
              name="analytics-period"
              legend="Periodo"
              value={preset}
              options={PERIODS}
              onChange={(next) =>
                update(
                  next === 'custom'
                    ? { periodo: 'custom', desde: range.from, hasta: range.to }
                    : { periodo: next === DEFAULT_PERIOD ? null : next, desde: null, hasta: null },
                )
              }
            />
            {preset === 'custom' && (
              <div className="mt-4 grid max-w-md grid-cols-2 gap-3">
                <DateField label="Desde" value={custom.from} max={today} onChange={(from) => update({ desde: from })} />
                <DateField
                  label="Hasta"
                  value={custom.to}
                  min={custom.from || undefined}
                  max={custom.from ? minKey(addDays(custom.from, 91), today) : today}
                  onChange={(to) => update({ hasta: to })}
                />
              </div>
            )}
            <p className={cn('mt-3 flex items-start gap-2 text-sm', rangeError ? 'text-destructive' : 'text-muted-foreground')} role={rangeError ? 'alert' : undefined}>
              <CalendarRange className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {rangeError ?? (
                <span>
                  <span className="font-medium text-foreground">{device.name}</span> · {describeRange(range)} · {days} {days === 1 ? 'día' : 'días'}
                </span>
              )}
            </p>
          </div>
        </div>
      </section>

      {query && (
        <div className="space-y-4">
          <Kpis params={query} />
          <ExplorerChart params={query} fileName={fileName} deviceName={device.name} />
          <div className="grid gap-4 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-7">
              <HeatmapChart params={query} fileName={fileName} />
            </div>
            <div className="min-w-0 xl:col-span-5">
              <RangesChart params={query} fileName={fileName} />
            </div>
          </div>
          <IrrigationChart params={query} fileName={fileName} />
          <CompareChart params={query} fileName={fileName} />
          <p className="pt-2 text-xs text-muted-foreground">
            Horas en tiempo de Guatemala (UTC−6). Los rangos usan los umbrales actuales del galpón.
          </p>
        </div>
      )}
    </>
  );
}

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Four headline numbers, each against the previous period of the same length. */
function Kpis({ params }: { params: AnalyticsParams }) {
  const query = useAnalytics('summary', params);
  const data = query.data;

  if (query.isPending) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }
  if (query.isError || !data) return <p className="text-sm text-destructive">No se pudo cargar el resumen.</p>;

  return (
    <div className={cn('space-y-2 transition-opacity', query.isPlaceholderData && 'opacity-50')}>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Temperatura promedio"
          value={data.current.average !== null ? `${formatTemp(data.current.average)} °C` : '—'}
          delta={delta(data.current.average, data.previous?.average ?? null, (d) => `${signed(d)} °C`)}
          detail={data.current.min !== null ? `Entre ${formatTemp(data.current.min)} y ${formatTemp(data.current.max!)} °C` : undefined}
        />
        <KpiCard
          label="Tiempo en rango óptimo"
          value={percent(data.current.optimalShare)}
          delta={delta(data.current.optimalShare, data.previous?.optimalShare ?? null, (d) => `${signed(d * 100, 0)} pts`, 'higher')}
          detail={`${data.thresholds.tempMin}–${data.thresholds.tempMax} °C`}
        />
        <KpiCard
          label="Máxima"
          value={data.hottest ? `${formatTemp(data.hottest.temperature)} °C` : '—'}
          delta={delta(data.current.max, data.previous?.max ?? null, (d) => `${signed(d)} °C`, 'lower')}
          detail={data.hottest ? formatDateTime(data.hottest.at) : undefined}
          tone={data.hottest && data.hottest.temperature >= data.thresholds.tempAlert ? 'text-alert' : undefined}
        />
        <KpiCard
          label="Alertas"
          value={String(data.current.alerts)}
          delta={delta(data.current.alerts, data.previous?.alerts ?? null, (d) => signed(d, 0), 'lower')}
          detail={`${data.current.irrigationCycles} riegos · ${data.current.irrigationMinutesPerDay ?? 0} min/día`}
        />
      </dl>
      <p className="text-xs text-muted-foreground">
        {data.previousPeriod ? (
          <>
            Comparado con {formatDayKeyShort(data.previousPeriod.from)}
            {data.previousPeriod.from !== data.previousPeriod.to && ` – ${formatDayKeyShort(data.previousPeriod.to)}`}
          </>
        ) : (
          `El galpón tiene datos desde el ${formatDayKeyShort(data.dataSince ?? data.period.from)}: no hay periodo anterior para comparar.`
        )}
        {data.current.coverage !== null && data.current.coverage < 0.9 && (
          <span className="text-warm"> · Faltan datos: el equipo reportó el {percent(data.current.coverage)} del tiempo.</span>
        )}
      </p>
    </div>
  );
}

interface Delta {
  text: string;
  direction: 'up' | 'down' | 'flat';
  /** good / bad / neutral, from the point of view of the birds. */
  meaning: 'good' | 'bad' | 'neutral';
}

function delta(
  current: number | null,
  previous: number | null,
  format: (difference: number) => string,
  better?: 'higher' | 'lower',
): Delta | null {
  if (current === null || previous === null) return null;
  const difference = current - previous;
  const flat = Math.abs(difference) < 1e-6;
  const direction = flat ? 'flat' : difference > 0 ? 'up' : 'down';
  const meaning = flat || !better ? 'neutral' : (direction === 'up') === (better === 'higher') ? 'good' : 'bad';
  return { text: format(difference), direction, meaning };
}

function KpiCard({ label, value, delta, detail, tone }: { label: string; value: string; delta: Delta | null; detail?: ReactNode; tone?: string }) {
  const Icon = delta?.direction === 'up' ? ArrowUpRight : delta?.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1">
        <span className={cn('block font-display text-2xl font-semibold tracking-tight tabular sm:text-3xl', tone)}>{value}</span>
        {delta && (
          <span
            className={cn(
              'mt-1 inline-flex items-center gap-0.5 text-xs font-medium tabular',
              delta.meaning === 'good' ? 'text-optimal' : delta.meaning === 'bad' ? 'text-alert' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {delta.text}
            <span className="sr-only"> respecto al periodo anterior</span>
          </span>
        )}
        {detail && <span className="mt-1 block truncate text-xs text-muted-foreground">{detail}</span>}
      </dd>
    </div>
  );
}
