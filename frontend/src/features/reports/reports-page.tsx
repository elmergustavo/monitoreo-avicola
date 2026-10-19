import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  CalendarRange,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Panel, PanelTitle } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDevices } from '@/features/monitoring/queries';
import { api, apiDownload, ApiError, saveFile } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import type { RecentReport, ReportFormat } from '@/lib/types';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import {
  addDays,
  daysInRange,
  describeRange,
  PRESETS,
  presetRange,
  todayGt,
  validateRange,
  type DateRange,
  type PresetKey,
} from './periods';

const ALL_SHEDS = 'all';
const recentKey = ['reports', 'recent'] as const;

interface ReportRequest {
  format: ReportFormat;
  range: DateRange;
  deviceId: string | null;
}

const FORMATS: Record<
  ReportFormat,
  { label: string; extension: string; icon: LucideIcon; summary: string; includes: string[]; tone: string }
> = {
  pdf: {
    label: 'PDF',
    extension: '.pdf',
    icon: FileText,
    summary: 'Informe listo para imprimir, enviar o archivar.',
    includes: [
      'Membrete de la granja y código de reporte',
      'Indicadores clave: promedio, extremos, tiempo en rango óptimo',
      'Hallazgos redactados automáticamente',
      'Gráfica de temperatura con umbrales',
      'Detalle por día y registro de alertas',
      'Espacio para firmas de elaboración y revisión',
    ],
    tone: 'text-alert bg-alert/10',
  },
  xlsx: {
    label: 'Excel',
    extension: '.xlsx',
    icon: FileSpreadsheet,
    summary: 'Datos completos para filtrar, graficar y analizar.',
    includes: [
      'Hoja Resumen con indicadores y umbrales por galpón',
      'Hoja Resumen diario con filtros y barras de rango óptimo',
      'Hoja Eventos: riego, alertas y errores del sensor',
      'Hoja Lecturas: cada lectura (o promedios de 5 min en periodos de más de 7 días)',
    ],
    tone: 'text-optimal bg-optimal/10',
  },
};

export function ReportsPage() {
  const queryClient = useQueryClient();
  const now = useNow(60_000);
  const today = todayGt(now);
  const devices = useDevices();
  const activeDevices = useMemo(() => devices.data?.filter((d) => d.active) ?? [], [devices.data]);

  const [deviceId, setDeviceId] = useState<string>(ALL_SHEDS);
  const [preset, setPreset] = useState<PresetKey>('last7');
  const [custom, setCustom] = useState<DateRange>(() => presetRange('last7'));
  const [format, setFormat] = useState<ReportFormat>('pdf');

  const range = preset === 'custom' ? custom : presetRange(preset, now);
  const rangeError = validateRange(range, now);

  const recent = useQuery({
    queryKey: recentKey,
    queryFn: () => api<RecentReport[]>('/reports/recent'),
  });

  const download = useMutation({
    mutationFn: async (request: ReportRequest) =>
      apiDownload(
        '/reports/operations',
        {
          format: request.format,
          from: request.range.from,
          to: request.range.to,
          deviceId: request.deviceId ?? undefined,
        },
        `reporte${FORMATS[request.format].extension}`,
      ),
    onSuccess: (file) => {
      saveFile(file);
      toast.success('Reporte descargado', { description: file.fileName });
      void queryClient.invalidateQueries({ queryKey: recentKey });
    },
    onError: (err) =>
      toast.error('No se pudo generar el reporte', {
        description: err instanceof ApiError ? err.message : 'Intenta de nuevo en unos segundos.',
      }),
  });

  const scopeName =
    deviceId === ALL_SHEDS ? 'Todos los galpones' : (activeDevices.find((d) => d.id === deviceId)?.name ?? 'Galpón');
  const days = rangeError ? null : daysInRange(range);
  const selected = FORMATS[format];

  return (
    <>
      <PageHeader title="Reportes" description="Descarga informes de temperatura y riego en PDF o Excel." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className="h-auto">
          <form
            className="space-y-7"
            onSubmit={(event) => {
              event.preventDefault();
              if (rangeError || download.isPending) return;
              download.mutate({ format, range, deviceId: deviceId === ALL_SHEDS ? null : deviceId });
            }}
          >
            <Step number={1} title="Galpón">
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger id="report-device" className="h-11 w-full sm:w-80" aria-label="Galpón">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SHEDS}>Todos los galpones</SelectItem>
                  {activeDevices.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Step>

            <Step number={2} title="Periodo">
              <ChoiceChips
                name="report-period"
                legend="Periodo"
                value={preset}
                options={PRESETS}
                onChange={(next) => {
                  // Start the custom range from whatever was selected.
                  if (next === 'custom' && preset !== 'custom') setCustom(range);
                  setPreset(next);
                }}
              />
              {preset === 'custom' && (
                <div className="mt-4 grid max-w-md grid-cols-2 gap-3">
                  <DateField
                    label="Desde"
                    value={custom.from}
                    max={today}
                    onChange={(from) => setCustom((current) => ({ ...current, from }))}
                  />
                  <DateField
                    label="Hasta"
                    value={custom.to}
                    min={custom.from || undefined}
                    max={custom.from ? minKey(addDays(custom.from, 91), today) : today}
                    onChange={(to) => setCustom((current) => ({ ...current, to }))}
                  />
                </div>
              )}
              <p
                className={cn(
                  'mt-3 flex items-start gap-2 text-sm',
                  rangeError ? 'text-destructive' : 'text-muted-foreground',
                )}
                role={rangeError ? 'alert' : undefined}
              >
                <CalendarRange className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {rangeError ?? (
                  <span>
                    <span className="font-medium text-foreground">{describeRange(range)}</span> · {days}{' '}
                    {days === 1 ? 'día' : 'días'}
                  </span>
                )}
              </p>
            </Step>

            <Step number={3} title="Formato">
              <fieldset>
                <legend className="sr-only">Formato del archivo</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(Object.keys(FORMATS) as ReportFormat[]).map((key) => (
                    <FormatCard key={key} format={key} checked={format === key} onSelect={() => setFormat(key)} />
                  ))}
                </div>
              </fieldset>
            </Step>

            <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {download.isPending
                  ? 'Generando el reporte, esto toma unos segundos…'
                  : `${scopeName} · ${selected.label}`}
              </p>
              <Button type="submit" size="lg" className="h-11 w-full sm:w-auto" disabled={!!rangeError || download.isPending}>
                {download.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download aria-hidden="true" />
                )}
                {download.isPending ? 'Generando…' : `Descargar ${selected.label}`}
              </Button>
            </div>
          </form>
        </Panel>

        <div className="space-y-6">
          <Panel className="h-auto">
            <PanelTitle>El {selected.label} incluye</PanelTitle>
            <ul className="space-y-2.5">
              {selected.includes.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-optimal" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="h-auto">
            <PanelTitle>Descargas recientes</PanelTitle>
            <RecentList
              query={recent}
              disabled={download.isPending}
              onRepeat={(item) =>
                item.format &&
                item.from &&
                item.to &&
                download.mutate({ format: item.format, range: { from: item.from, to: item.to }, deviceId: item.deviceId })
              }
            />
          </Panel>
        </div>
      </div>
    </>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${number}`}>
      <h2 id={`step-${number}`} className="mb-3 flex items-center gap-2.5 text-sm font-medium">
        <span
          className="flex size-6 items-center justify-center rounded-full bg-primary/10 font-mono text-xs text-primary"
          aria-hidden="true"
        >
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Radio buttons styled as chips; arrow keys move between options natively. */
function ChoiceChips<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: T;
  options: Array<{ key: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.key}
            className={cn(
              'relative inline-flex h-10 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors',
              'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
              value === option.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card hover:border-foreground/25 hover:bg-muted/60',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.key}
              checked={value === option.key}
              onChange={() => onChange(option.key)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} className="h-11" />
    </div>
  );
}

function FormatCard({ format, checked, onSelect }: { format: ReportFormat; checked: boolean; onSelect: () => void }) {
  const info = FORMATS[format];
  const Icon = info.icon;
  return (
    <label
      className={cn(
        'relative flex cursor-pointer gap-3.5 rounded-xl border p-4 transition-colors',
        'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
        checked ? 'border-primary bg-primary/[0.04] ring-1 ring-primary' : 'hover:border-foreground/25 hover:bg-muted/40',
      )}
    >
      <input type="radio" name="report-format" value={format} checked={checked} onChange={onSelect} className="sr-only" />
      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg', info.tone)}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-medium">
          {info.label}
          <span className="font-mono text-xs text-muted-foreground">{info.extension}</span>
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{info.summary}</span>
      </span>
      <span
        className={cn(
          'absolute top-3 right-3 flex size-5 items-center justify-center rounded-full border transition-colors',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
        )}
        aria-hidden="true"
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
    </label>
  );
}

function RecentList({
  query,
  disabled,
  onRepeat,
}: {
  query: UseQueryResult<RecentReport[]>;
  disabled: boolean;
  onRepeat: (item: RecentReport) => void;
}) {
  if (query.isPending) return <Skeleton className="h-32 rounded-lg" />;
  if (query.isError) return <p className="text-sm text-destructive">No se pudieron cargar tus descargas.</p>;
  if (query.data.length === 0) {
    return (
      <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <History className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Aquí aparecerán los reportes que descargues.
      </p>
    );
  }

  return (
    <ul className="-mx-2 divide-y">
      {query.data.map((item) => {
        const info = item.format ? FORMATS[item.format] : FORMATS.pdf;
        const Icon = info.icon;
        const period = item.from && item.to ? describeRange({ from: item.from, to: item.to }) : '—';
        return (
          <li key={item.id} className="flex items-center gap-3 px-2 py-3">
            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', info.tone)}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.deviceName ?? 'Todos los galpones'}</p>
              <p className="truncate text-xs text-muted-foreground">{period}</p>
              <p className="truncate text-xs text-muted-foreground tabular">{formatDateTime(item.createdAt)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0"
              disabled={disabled}
              onClick={() => onRepeat(item)}
              aria-label={`Descargar de nuevo: ${item.deviceName ?? 'todos los galpones'}, ${period}, ${info.label}`}
              title="Descargar de nuevo con los datos actuales"
            >
              <RotateCcw aria-hidden="true" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

const minKey = (a: string, b: string) => (a < b ? a : b);
