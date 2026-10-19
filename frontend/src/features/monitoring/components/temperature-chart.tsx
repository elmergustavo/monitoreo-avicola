import { useMemo, useState } from 'react';
import { EChart, type EChartOption } from '@/components/echart';
import { Panel, PanelTitle } from '@/components/panel';
import { useTheme } from '@/components/use-theme';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cssVarToRgba } from '@/lib/css-color';
import { formatDayLabel, formatShortDay, formatTemp, formatTime } from '@/lib/format';
import { classifyTemperature, THERMAL_LABEL } from '@/lib/thermal';
import { useReadingsRange } from '../queries';
import { irrigationSpans } from '../stats';
import type { Reading, ShedSettings } from '../types';

const RANGES = {
  '6h': { label: '6 h', ms: 6 * 3_600_000 },
  '24h': { label: '24 h', ms: 24 * 3_600_000 },
  '7d': { label: '7 días', ms: 7 * 24 * 3_600_000 },
} as const;
type RangeKey = keyof typeof RANGES;
const NO_READINGS: Reading[] = [];

interface TemperatureChartProps {
  deviceId: string;
  /** Last 24 h of raw readings (live). Longer ranges are fetched averaged. */
  readings: Reading[];
  settings: ShedSettings;
}

export function TemperatureChart({ deviceId, readings: last24h, settings }: TemperatureChartProps) {
  const [range, setRange] = useState<RangeKey>('24h');
  const { theme } = useTheme();
  const weekQuery = useReadingsRange(deviceId, 7, range === '7d');
  const readings = range === '7d' ? (weekQuery.data ?? NO_READINGS) : last24h;
  const loading = range === '7d' && weekQuery.isPending;

  const colors = useMemo(
    () => ({
      line: cssVarToRgba('--chart-line'),
      grid: cssVarToRgba('--chart-grid'),
      muted: cssVarToRgba('--muted-foreground'),
      cool: cssVarToRgba('--cool'),
      warm: cssVarToRgba('--warm'),
      alert: cssVarToRgba('--alert'),
      optimalBand: cssVarToRgba('--optimal', theme === 'dark' ? 0.13 : 0.1),
      optimalText: cssVarToRgba('--optimal'),
      water: cssVarToRgba('--water', theme === 'dark' ? 0.2 : 0.14),
      popover: cssVarToRgba('--popover'),
      border: cssVarToRgba('--border'),
      text: cssVarToRgba('--foreground'),
    }),
    [theme],
  );

  const option = useMemo<EChartOption>(() => {
    const now = Math.max(readings.at(-1)?.at ?? 0, last24h.at(-1)?.at ?? 0);
    const visible = readings.filter((r) => r.at >= now - RANGES[range].ms);
    const spans = irrigationSpans(visible);
    const { tempMin, tempMax, tempAlert } = settings;

    return {
      animationDurationUpdate: 400,
      grid: { left: 4, right: 12, top: 16, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.popover,
        borderColor: colors.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: colors.text, fontFamily: 'IBM Plex Sans', fontSize: 13 },
        axisPointer: { type: 'line', lineStyle: { color: colors.muted, type: 'dashed' } },
        formatter: (params: unknown) => {
          const [point] = params as Array<{ value: [number, number, number] }>;
          if (!point) return '';
          const [at, temperature, irrigation] = point.value;
          const state = THERMAL_LABEL[classifyTemperature(temperature, settings)];
          return `<div style="font-size:12px;opacity:.7">${formatDayLabel(at)} · ${formatTime(at)}</div>
            <div style="font-size:16px;font-weight:600;margin-top:2px">${formatTemp(temperature)} °C
              <span style="font-size:12px;font-weight:500;opacity:.75">${state}</span></div>
            <div style="font-size:12px;opacity:.7;margin-top:2px">Riego ${irrigation ? 'encendido' : 'apagado'}</div>`;
        },
      },
      xAxis: {
        type: 'time',
        min: now - RANGES[range].ms,
        max: now,
        axisLine: { lineStyle: { color: colors.grid } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: colors.muted,
          fontFamily: 'IBM Plex Mono',
          fontSize: 11,
          hideOverlap: true,
          formatter: (value: number) => (range === '7d' ? formatShortDay(value) : formatTime(value)),
        },
      },
      yAxis: {
        type: 'value',
        // Even bounds with a 2° step keep the labels aligned and readable.
        min: ({ min }: { min: number }) => Math.floor((Math.min(min, tempMin) - 1) / 2) * 2,
        max: ({ max }: { max: number }) => Math.ceil((Math.max(max, tempAlert) + 1) / 2) * 2,
        interval: 2,
        splitLine: { lineStyle: { color: colors.grid } },
        axisLabel: { color: colors.muted, fontFamily: 'IBM Plex Mono', fontSize: 11, formatter: '{value}°' },
      },
      // Line color follows the thermal bands; in-range stays neutral ink.
      visualMap: {
        show: false,
        seriesIndex: 0,
        dimension: 1,
        pieces: [
          { lt: tempMin, color: colors.cool },
          { gte: tempMin, lte: tempMax, color: colors.line },
          { gt: tempMax, lt: tempAlert, color: colors.warm },
          { gte: tempAlert, color: colors.alert },
        ],
      },
      series: [
        {
          name: 'Temperatura',
          type: 'line',
          data: visible.map((r) => [r.at, r.temperature, r.irrigation ? 1 : 0]),
          showSymbol: false,
          sampling: 'lttb',
          lineStyle: { width: 2 },
          emphasis: { disabled: true },
          markArea: {
            silent: true,
            itemStyle: { color: colors.optimalBand },
            label: {
              position: 'insideTopLeft',
              color: colors.optimalText,
              fontFamily: 'IBM Plex Sans',
              fontSize: 11,
              fontWeight: 500,
            },
            data: [[{ yAxis: tempMin, name: `Óptimo ${tempMin}–${tempMax}°` }, { yAxis: tempMax }]],
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: colors.alert, type: [4, 4], width: 1.5 },
            label: {
              position: 'insideEndTop',
              color: colors.alert,
              fontFamily: 'IBM Plex Sans',
              fontSize: 11,
              fontWeight: 500,
              formatter: `Alerta ${tempAlert}°`,
            },
            data: [{ yAxis: tempAlert }],
          },
        },
        {
          name: 'Riego',
          type: 'line',
          data: [],
          markArea: {
            silent: true,
            itemStyle: { color: colors.water },
            data: spans.map((span) => [{ xAxis: span.start }, { xAxis: span.end }]),
          },
        },
      ],
    };
  }, [readings, last24h, range, settings, colors]);

  return (
    <Panel className="flex flex-col">
      <PanelTitle
        aside={
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={(value) => value && setRange(value as RangeKey)}
            variant="outline"
            size="sm"
            aria-label="Rango de tiempo"
          >
            {(Object.keys(RANGES) as RangeKey[]).map((key) => (
              <ToggleGroupItem key={key} value={key} className="min-w-14 px-3">
                {RANGES[key].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      >
        Temperatura
      </PanelTitle>

      <div className="relative flex min-h-72 flex-1 sm:min-h-80">
        <EChart
          option={option}
          resetKey={`${range}-${theme}`}
          className="min-h-72 flex-1 sm:min-h-80"
          ariaLabel={`Gráfica de temperatura de las últimas ${RANGES[range].label}`}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/70 text-sm text-muted-foreground">
            Cargando 7 días…
          </div>
        )}
        {!loading && readings.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Sin lecturas en este rango.
          </div>
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <Legend swatch="h-2.5 w-4 rounded-sm bg-optimal/25" label="Rango óptimo" />
        <Legend swatch="h-2.5 w-4 rounded-sm bg-water/40" label="Riego encendido" />
        <Legend swatch="h-0 w-4 border-t-2 border-dashed border-alert" label="Umbral de alerta" />
        <Legend swatch="h-0.5 w-4 rounded bg-warm" label="Sobre el rango" />
      </ul>
    </Panel>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={swatch} aria-hidden="true" />
      {label}
    </li>
  );
}
