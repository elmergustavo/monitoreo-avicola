import { ImageDown } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { EChart, type EChartInstance, type EChartOption } from '@/components/echart';
import { Button } from '@/components/ui/button';
import { axisLabelStyle, tooltipStyle, useChartColors, type ChartColors } from '@/lib/chart-colors';
import { formatDuration, formatTemp } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ChartCard } from '../chart-card';
import { downloadChartImage, percent, signed } from '../format';
import { useAnalytics, type AnalyticsParams } from '../queries';
import type { AnalyticsIrrigation } from '../types';

/** Chart 4: does irrigation cool the shed? Average response curve plus the numbers behind it. */
export function IrrigationChart({ params, fileName }: { params: AnalyticsParams; fileName: string }) {
  const query = useAnalytics('irrigation', params);
  const colors = useChartColors();
  const chartRef = useRef<EChartInstance | null>(null);
  const data = query.data;
  const option = useMemo(() => (data && data.curve.length > 0 ? buildOption(data, colors) : null), [data, colors]);
  const verdict = data ? judge(data) : null;

  return (
    <ChartCard
      title="¿Funciona el riego?"
      description="Cómo cambia la temperatura alrededor del momento en que se enciende el riego (promedio de todos los riegos del periodo)."
      actions={
        <Button variant="outline" size="sm" className="h-9" onClick={() => downloadChartImage(chartRef.current, `${fileName}-riego`, colors.background)} disabled={!option}>
          <ImageDown aria-hidden="true" /> Imagen
        </Button>
      }
      insight={verdict?.text}
      isPending={query.isPending}
      isError={query.isError}
      isRefreshing={query.isPlaceholderData}
      isEmpty={data?.summary.cycles === 0}
      emptyText="No hubo riegos en este periodo."
      minHeight="min-h-[320px]"
    >
      {data && (
        <div className="grid gap-6 lg:grid-cols-12">
          <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-5 lg:col-span-4">
            <Stat label="Riegos" value={String(data.summary.cycles)} detail={data.summary.averageDurationMin !== null ? `${formatDuration(data.summary.averageDurationMin)} en promedio` : undefined} />
            <Stat
              label="Baja en 15 min"
              value={data.summary.averageDrop !== null ? `${signed(-data.summary.averageDrop)} °C` : '—'}
              detail="promedio por riego"
              tone={verdict?.tone}
            />
            <Stat label="Riegos efectivos" value={percent(data.summary.effectiveShare)} detail="bajaron 0.5 °C o más" />
            <Stat
              label="Vuelve al óptimo"
              value={data.summary.averageRecoveryMin !== null ? formatDuration(data.summary.averageRecoveryMin) : '—'}
              detail={
                data.summary.startedHot > 0
                  ? `${percent(data.summary.recoveredShare)} de los ${data.summary.startedHot} que empezaron con calor`
                  : 'ningún riego empezó con calor'
              }
            />
          </dl>
          <div className="min-w-0 lg:col-span-8">
            {option ? (
              <EChart
                option={option}
                resetKey={`${params.from}:${params.to}`}
                instanceRef={chartRef}
                className="h-[300px]"
                ariaLabel={verdict?.text ?? 'Respuesta de la temperatura al riego'}
              />
            ) : (
              <p className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No hay lecturas suficientes alrededor de los riegos.</p>
            )}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>
        <span className={cn('block font-display text-2xl font-semibold tracking-tight tabular', tone)}>{value}</span>
        {detail && <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>}
      </dd>
    </div>
  );
}

function buildOption(data: AnalyticsIrrigation, c: ChartColors): EChartOption {
  const min = Math.min(-0.5, ...data.curve.map((p) => p.delta));
  const max = Math.max(0.5, ...data.curve.map((p) => p.delta));
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      ...tooltipStyle(c),
      axisPointer: { type: 'line', lineStyle: { color: c.muted, type: 'dashed' } },
      formatter: (params: unknown) => {
        const [p] = params as Array<{ value: [number, number]; dataIndex: number }>;
        if (!p) return '';
        const [minute, delta] = p.value;
        const point = data.curve[p.dataIndex];
        const when = minute < 0 ? `${-minute} min antes de encender` : minute === 0 ? 'al encender' : `${minute} min después de encender`;
        return `<div style="font-size:12px;opacity:.7">${when}</div>
          <div style="font-size:16px;font-weight:600;margin-top:2px">${signed(delta, 2)} °C</div>
          <div style="font-size:12px;opacity:.7">promedio de ${point?.cycles ?? 0} riegos</div>`;
      },
    },
    xAxis: {
      type: 'value',
      min: -10,
      max: 45,
      interval: 5,
      axisLine: { lineStyle: { color: c.grid } },
      splitLine: { show: false },
      axisLabel: { ...axisLabelStyle(c), formatter: (v: number) => (v === 0 ? '0' : `${v > 0 ? '+' : ''}${v} min`) },
    },
    yAxis: {
      type: 'value',
      min: Math.floor(min * 2) / 2,
      max: Math.ceil(max * 2) / 2,
      splitLine: { lineStyle: { color: c.grid } },
      axisLabel: { ...axisLabelStyle(c), formatter: (v: number) => `${signed(v, 1)}°` },
    },
    series: [
      {
        name: 'Cambio de temperatura',
        type: 'line',
        smooth: 0.3,
        showSymbol: false,
        data: data.curve.map((p) => [p.minute, p.delta]),
        lineStyle: { width: 2.5, color: c.water },
        itemStyle: { color: c.water },
        areaStyle: { color: c.waterBand, origin: 0 },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            {
              xAxis: 0,
              lineStyle: { color: c.water, type: 'solid', width: 1.5 },
              label: { formatter: 'Se enciende el riego', position: 'end', distance: 6, rotate: 0, color: c.water, fontFamily: 'IBM Plex Sans', fontSize: 11, fontWeight: 500 },
            },
            {
              xAxis: 15,
              lineStyle: { color: c.muted, type: [4, 4], width: 1 },
              label: { formatter: '15 min', position: 'end', distance: 6, rotate: 0, color: c.muted, fontFamily: 'IBM Plex Sans', fontSize: 11 },
            },
            { yAxis: 0, lineStyle: { color: c.muted, type: 'solid', width: 1, opacity: 0.6 }, label: { show: false } },
          ],
        },
      },
    ],
  };
}

/** A plain-language verdict on whether irrigation cools the shed. */
function judge(data: AnalyticsIrrigation): { text: string; tone?: string } | null {
  const { averageDrop, effectiveShare, averageRecoveryMin, cycles, measured } = data.summary;
  if (cycles === 0 || averageDrop === null || measured === 0) return null;
  const lowest = data.curve.reduce((a, b) => (b.delta < a.delta ? b : a), data.curve[0]);
  const recovery = averageRecoveryMin !== null ? ` Cuando empieza con calor, vuelve al rango óptimo en unos ${formatDuration(averageRecoveryMin)}.` : '';
  if (averageDrop >= 0.5) {
    return {
      tone: 'text-optimal',
      text: `Sí: en promedio la temperatura baja ${formatTemp(averageDrop)} °C en los 15 minutos siguientes${lowest ? ` y llega a su punto más bajo a los ${lowest.minute} min` : ''}. ${percent(effectiveShare)} de los riegos fueron efectivos.${recovery}`,
    };
  }
  if (averageDrop > 0) {
    return {
      tone: 'text-warm',
      text: `Poco: en promedio la temperatura solo baja ${formatTemp(averageDrop)} °C en 15 minutos. Conviene revisar el caudal de los aspersores o encender el riego más temprano.${recovery}`,
    };
  }
  return {
    tone: 'text-alert',
    text: 'No se nota: en promedio la temperatura no baja después de encender el riego. Revisa que los aspersores funcionen o que el sensor esté bien ubicado.',
  };
}
