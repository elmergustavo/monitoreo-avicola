import { ImageDown } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { EChart, type EChartInstance, type EChartOption } from '@/components/echart';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { axisLabelStyle, tooltipStyle, useChartColors, type ChartColors } from '@/lib/chart-colors';
import { formatTemp } from '@/lib/format';
import { ChartCard } from '../chart-card';
import { downloadChartImage, formatDayKey, formatDayKeyLong, slotLabel } from '../format';
import { useAnalytics, type AnalyticsParams } from '../queries';
import type { AnalyticsCompare } from '../types';

type Mode = 'days' | 'sheds';

interface Line {
  name: string;
  values: (number | null)[];
  color: string;
  dashed?: boolean;
  width?: number;
}

/** Chart 5: the last day of the period against the day before, the 7-day average and other sheds. */
export function CompareChart({ params, fileName }: { params: AnalyticsParams; fileName: string }) {
  const query = useAnalytics('compare', params);
  const colors = useChartColors();
  const chartRef = useRef<EChartInstance | null>(null);
  const [mode, setMode] = useState<Mode>('days');
  const data = query.data;
  const canCompareSheds = (data?.devices.length ?? 0) > 1;
  const effectiveMode: Mode = canCompareSheds ? mode : 'days';

  const lines = useMemo(() => (data ? linesFor(data, effectiveMode, colors) : []), [data, effectiveMode, colors]);
  const option = useMemo(() => (data ? buildOption(data, lines, colors) : null), [data, lines, colors]);
  const insight = useMemo(() => (data ? describe(data) : null), [data]);
  const hasDay = data?.curves.day.some((v) => v !== null) ?? false;

  return (
    <ChartCard
      title="Comparar"
      description={
        data
          ? `${formatDayKeyLong(data.day)} (último día del periodo) cada 15 minutos.`
          : 'El último día del periodo, cada 15 minutos.'
      }
      actions={
        <>
          {canCompareSheds && (
            <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as Mode)} variant="outline" size="sm" aria-label="Comparar contra">
              <ToggleGroupItem value="days" className="h-9 px-3">
                Días
              </ToggleGroupItem>
              <ToggleGroupItem value="sheds" className="h-9 px-3">
                Galpones
              </ToggleGroupItem>
            </ToggleGroup>
          )}
          <Button variant="outline" size="sm" className="h-9" onClick={() => downloadChartImage(chartRef.current, `${fileName}-comparacion`, colors.background)} disabled={!data}>
            <ImageDown aria-hidden="true" /> Imagen
          </Button>
        </>
      }
      insight={effectiveMode === 'days' ? insight : null}
      isPending={query.isPending}
      isError={query.isError}
      isRefreshing={query.isPlaceholderData}
      isEmpty={!hasDay && !(data?.curves.weekAverage.some((v) => v !== null) ?? false)}
      minHeight="min-h-[340px]"
    >
      {option && (
        <EChart
          option={option}
          resetKey={`${params.from}:${params.to}:${effectiveMode}`}
          instanceRef={chartRef}
          className="h-[340px]"
          ariaLabel={insight ?? 'Comparación de temperatura'}
        />
      )}
    </ChartCard>
  );
}

function linesFor(data: AnalyticsCompare, mode: Mode, c: ChartColors): Line[] {
  if (mode === 'sheds') {
    const palette = [c.line, c.water, c.warm, c.cool, c.optimal, c.alert];
    return data.devices.map((d, i) => ({
      name: d.name,
      values: d.points,
      color: d.current ? c.line : palette[(i % (palette.length - 1)) + 1],
      width: d.current ? 2.5 : 1.75,
    }));
  }
  return [
    { name: `Promedio de los 7 días anteriores`, values: data.curves.weekAverage, color: c.muted, dashed: true, width: 1.5 },
    { name: `Día anterior (${formatDayKey(data.previousDay)})`, values: data.curves.previousDay, color: c.water, width: 1.75 },
    { name: `${formatDayKey(data.day)}`, values: data.curves.day, color: c.line, width: 2.75 },
  ];
}

function buildOption(data: AnalyticsCompare, lines: Line[], c: ChartColors): EChartOption {
  const { tempMin, tempMax, tempAlert } = data.thresholds;
  const slots = data.curves.day.length;
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 44, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, itemGap: 16, textStyle: { color: c.muted, fontFamily: 'IBM Plex Sans', fontSize: 12 } },
    tooltip: {
      trigger: 'axis',
      ...tooltipStyle(c),
      axisPointer: { type: 'line', lineStyle: { color: c.muted, type: 'dashed' } },
      formatter: (params: unknown) => {
        const list = params as Array<{ seriesName: string; value: number | null; color: string; dataIndex: number }>;
        if (!list.length) return '';
        const rows = [...list]
          .reverse()
          .map(
            (p) => `<div style="display:flex;justify-content:space-between;gap:16px;font-size:12px">
              <span><span style="display:inline-block;width:10px;height:2px;background:${p.color};margin-right:6px;vertical-align:middle"></span>${p.seriesName}</span>
              <span style="font-weight:600">${p.value === null || p.value === undefined ? '—' : `${formatTemp(p.value)} °C`}</span></div>`,
          )
          .join('');
        return `<div style="font-size:12px;opacity:.7;margin-bottom:4px">${slotLabel(list[0].dataIndex, data.slotMinutes)}</div>${rows}`;
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: Array.from({ length: slots }, (_, i) => slotLabel(i, data.slotMinutes)),
      axisLine: { lineStyle: { color: c.grid } },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(c), interval: (index: number) => index % (120 / data.slotMinutes) === 0 },
    },
    yAxis: {
      type: 'value',
      min: ({ min }: { min: number }) => Math.floor((Math.min(min, tempMin) - 1) / 2) * 2,
      max: ({ max }: { max: number }) => Math.ceil((Math.max(max, tempAlert) + 1) / 2) * 2,
      interval: 2,
      splitLine: { lineStyle: { color: c.grid } },
      axisLabel: { ...axisLabelStyle(c), formatter: '{value}°' },
    },
    series: lines.map((line, index) => ({
      name: line.name,
      type: 'line',
      data: line.values,
      connectNulls: false,
      showSymbol: false,
      smooth: 0.2,
      lineStyle: { color: line.color, width: line.width ?? 2, type: line.dashed ? [6, 4] : 'solid' },
      itemStyle: { color: line.color },
      emphasis: { focus: 'series' },
      z: index + 2,
      ...(index === 0
        ? {
            markArea: {
              silent: true,
              itemStyle: { color: c.optimalBand },
              label: { position: 'insideTopLeft', color: c.optimal, fontFamily: 'IBM Plex Sans', fontSize: 11, fontWeight: 500 },
              data: [[{ yAxis: tempMin, name: `Óptimo ${tempMin}–${tempMax}°` }, { yAxis: tempMax }]],
            },
          }
        : {}),
    })),
  };
}

/** "El lun 19 oct estuvo 0.8 °C más caluroso que su promedio de 7 días. Su máxima fue 31.4 °C (lo normal, 30.6 °C)." */
function describe(data: AnalyticsCompare): string | null {
  const { day, weekAverage } = data.curves;
  const pairs = day.flatMap((v, i) => (v !== null && weekAverage[i] !== null ? [[v, weekAverage[i]!] as const] : []));
  if (pairs.length < 8) return null;
  const diff = pairs.reduce((sum, [d, w]) => sum + (d - w), 0) / pairs.length;
  const dayMax = Math.max(...pairs.map(([d]) => d));
  const usualMax = Math.max(...pairs.map(([, w]) => w));
  const comparison =
    Math.abs(diff) < 0.2
      ? 'fue muy parecido a su promedio de 7 días'
      : `estuvo ${formatTemp(Math.abs(diff))} °C ${diff > 0 ? 'más caluroso' : 'más fresco'} que su promedio de 7 días`;
  const partial = pairs.length < day.length * 0.9 ? ' (hasta la hora con datos)' : '';
  return `El ${formatDayKey(data.day)} ${comparison}${partial}. Su máxima fue ${formatTemp(dayMax)} °C; lo normal a esas horas, ${formatTemp(usualMax)} °C.`;
}
