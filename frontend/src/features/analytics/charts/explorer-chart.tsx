import { Download, ImageDown } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { EChart, type EChartInstance, type EChartOption } from '@/components/echart';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { axisLabelStyle, tooltipStyle, useChartColors } from '@/lib/chart-colors';
import { formatDayLabel, formatShortDay, formatTemp, formatTime } from '@/lib/format';
import { classifyTemperature, THERMAL_LABEL } from '@/lib/thermal';
import { ChartCard } from '../chart-card';
import { downloadChartImage, downloadCsv } from '../format';
import { useAnalytics, type AnalyticsParams } from '../queries';
import type { AnalyticsSeries } from '../types';

const BUCKET_LABEL: Record<number, string> = {
  60: 'promedios de 1 minuto',
  300: 'promedios de 5 minutos',
  600: 'promedios de 10 minutos',
  1800: 'promedios de 30 minutos',
  3600: 'promedios de 1 hora',
};

/** Chart 1: the whole period with zoom, min–max band, thresholds, irrigation and alerts. */
export function ExplorerChart({ params, fileName, deviceName }: { params: AnalyticsParams; fileName: string; deviceName: string }) {
  const query = useAnalytics('series', params);
  const zoomHint = useIsMobile()
    ? 'Para acercarte usa la barra de abajo o pellizca la gráfica.'
    : 'Para acercarte usa la barra de abajo o Ctrl + rueda del mouse; arrastra para moverte.';
  const colors = useChartColors();
  const chartRef = useRef<EChartInstance | null>(null);
  const data = query.data;

  const option = useMemo<EChartOption | null>(() => (data ? buildOption(data, colors) : null), [data, colors]);

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      `${fileName}-temperatura`,
      ['Fecha y hora (Guatemala)', 'Promedio °C', 'Mínima °C', 'Máxima °C', 'Riego'],
      data.points.map((p) => {
        const at = Date.parse(p.at);
        return [`${formatDayLabel(at)} ${formatTime(at)}`, p.average, p.min, p.max, p.irrigation ? 'Sí' : 'No'];
      }),
    );
  };

  const hottest = data?.points.reduce<number | null>((max, p) => (max === null || p.max > max ? p.max : max), null);

  return (
    <ChartCard
      title="Explorador de temperatura"
      description={
        data
          ? `${deviceName} · ${BUCKET_LABEL[data.bucketSeconds] ?? 'promedios'}. ${zoomHint}`
          : zoomHint
      }
      actions={
        <>
          <Button variant="outline" size="sm" className="h-9" onClick={() => downloadChartImage(chartRef.current, `${fileName}-temperatura`, colors.background)} disabled={!data}>
            <ImageDown aria-hidden="true" /> Imagen
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={!data}>
            <Download aria-hidden="true" /> CSV
          </Button>
        </>
      }
      isPending={query.isPending}
      isError={query.isError}
      isRefreshing={query.isPlaceholderData}
      isEmpty={data?.points.length === 0}
      minHeight="min-h-[440px]"
    >
      {option && (
        <EChart
          option={option}
          resetKey={`${params.deviceId}:${params.from}:${params.to}`}
          instanceRef={chartRef}
          className="h-[440px]"
          ariaLabel={`Temperatura de ${deviceName}${hottest !== null && hottest !== undefined ? `, máxima ${formatTemp(hottest)} °C` : ''}, con ${data?.irrigation.length ?? 0} riegos y ${data?.alerts.length ?? 0} alertas`}
        />
      )}
    </ChartCard>
  );
}

function buildOption(data: AnalyticsSeries, c: ReturnType<typeof useChartColors>): EChartOption {
  const { tempMin, tempMax, tempAlert } = data.thresholds;
  const points = data.points.map((p) => ({ ...p, t: Date.parse(p.at) }));
  const multiDay = points.length > 1 && points.at(-1)!.t - points[0].t > 36 * 3_600_000;
  const span = (p: { t: number }) => p.t;
  const alertY = (temperature: number | null) => temperature ?? tempAlert;
  const alerts = data.alerts.map((a) => ({ ...a, t: Date.parse(a.openedAt) }));

  return {
    animation: false,
    grid: { left: 8, right: 16, top: 44, bottom: 64, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      itemGap: 16,
      textStyle: { color: c.muted, fontFamily: 'IBM Plex Sans', fontSize: 12 },
      data: [
        { name: 'Promedio', icon: 'roundRect' },
        { name: 'Mínima y máxima', icon: 'roundRect' },
        { name: 'Riego', icon: 'roundRect' },
        { name: 'Alertas', icon: 'pin' },
      ],
    },
    tooltip: {
      trigger: 'axis',
      ...tooltipStyle(c),
      axisPointer: { type: 'line', lineStyle: { color: c.muted, type: 'dashed' } },
      formatter: (params: unknown) => {
        const list = params as Array<{ seriesName: string; dataIndex: number }>;
        const avg = list.find((p) => p.seriesName === 'Promedio');
        if (!avg) return '';
        const p = points[avg.dataIndex];
        const state = THERMAL_LABEL[classifyTemperature(p.average, data.thresholds)];
        const near = alerts.filter((a) => Math.abs(a.t - p.t) <= data.bucketSeconds * 1000);
        return `<div style="font-size:12px;opacity:.7">${formatDayLabel(p.t)} · ${formatTime(p.t)}</div>
          <div style="font-size:16px;font-weight:600;margin-top:2px">${formatTemp(p.average)} °C
            <span style="font-size:12px;font-weight:500;opacity:.75">${state}</span></div>
          <div style="font-size:12px;opacity:.75;margin-top:2px">Mín ${formatTemp(p.min)} · Máx ${formatTemp(p.max)} °C</div>
          <div style="font-size:12px;opacity:.75">Riego ${p.irrigation ? 'encendido' : 'apagado'}</div>
          ${near.map((a) => `<div style="font-size:12px;font-weight:600;color:${a.severity === 'critical' ? c.alert : c.warm};margin-top:4px">⚠ ${a.label}</div>`).join('')}`;
      },
    },
    dataZoom: [
      // The wheel scrolls the page; Ctrl + wheel (or pinch) zooms, dragging pans.
      { type: 'inside', filterMode: 'none', minValueSpan: 30 * 60_000, zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false, moveOnMouseMove: true },
      {
        type: 'slider',
        height: 28,
        bottom: 8,
        filterMode: 'none',
        borderColor: c.border,
        backgroundColor: 'transparent',
        fillerColor: c.band,
        dataBackground: { lineStyle: { color: c.muted, opacity: 0.5 }, areaStyle: { color: c.band } },
        selectedDataBackground: { lineStyle: { color: c.line }, areaStyle: { color: c.band } },
        handleStyle: { color: c.background, borderColor: c.muted },
        moveHandleStyle: { color: c.muted, opacity: 0.4 },
        textStyle: { color: c.muted, fontSize: 11 },
        labelFormatter: (value: number) => `${formatShortDay(value)} ${formatTime(value)}`,
      },
    ],
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: c.grid } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        ...axisLabelStyle(c),
        hideOverlap: true,
        formatter: (value: number) => (multiDay ? formatShortDay(value) : formatTime(value)),
      },
    },
    yAxis: {
      type: 'value',
      min: ({ min }: { min: number }) => Math.floor((Math.min(min, tempMin) - 1) / 2) * 2,
      max: ({ max }: { max: number }) => Math.ceil((Math.max(max, tempAlert) + 1) / 2) * 2,
      interval: 2,
      splitLine: { lineStyle: { color: c.grid } },
      axisLabel: { ...axisLabelStyle(c), formatter: '{value}°' },
    },
    visualMap: {
      show: false,
      seriesIndex: 2,
      dimension: 1,
      pieces: [
        { lt: tempMin, color: c.cool },
        { gte: tempMin, lte: tempMax, color: c.line },
        { gt: tempMax, lt: tempAlert, color: c.warm },
        { gte: tempAlert, color: c.alert },
      ],
    },
    series: [
      // Min–max band: an invisible base at the minimum plus the range stacked on top.
      {
        name: 'Mínima y máxima',
        type: 'line',
        stack: 'band',
        data: points.map((p) => [span(p), p.min]),
        showSymbol: false,
        lineStyle: { opacity: 0 },
        itemStyle: { color: c.band },
        emphasis: { disabled: true },
        silent: true,
      },
      {
        name: 'Mínima y máxima',
        type: 'line',
        stack: 'band',
        data: points.map((p) => [span(p), Math.max(0, p.max - p.min)]),
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { color: c.band },
        itemStyle: { color: c.band },
        emphasis: { disabled: true },
        silent: true,
      },
      {
        name: 'Promedio',
        type: 'line',
        data: points.map((p) => [span(p), p.average]),
        showSymbol: false,
        sampling: 'lttb',
        lineStyle: { width: 2 },
        itemStyle: { color: c.line },
        emphasis: { disabled: true },
        markArea: {
          silent: true,
          itemStyle: { color: c.optimalBand },
          label: { position: 'insideTopLeft', color: c.optimal, fontFamily: 'IBM Plex Sans', fontSize: 11, fontWeight: 500 },
          data: [[{ yAxis: tempMin, name: `Óptimo ${tempMin}–${tempMax}°` }, { yAxis: tempMax }]],
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: c.alert, type: [4, 4], width: 1.5 },
          label: { position: 'insideEndTop', color: c.alert, fontFamily: 'IBM Plex Sans', fontSize: 11, fontWeight: 500, formatter: `Alerta ${tempAlert}°` },
          data: [{ yAxis: tempAlert }],
        },
      },
      {
        name: 'Riego',
        type: 'line',
        data: [],
        itemStyle: { color: c.waterBand },
        markArea: {
          silent: true,
          itemStyle: { color: c.waterBand },
          data: data.irrigation.map((s) => [{ xAxis: Date.parse(s.from) }, { xAxis: Date.parse(s.to) }]),
        },
      },
      {
        name: 'Alertas',
        type: 'scatter',
        symbol: 'pin',
        symbolSize: 26,
        itemStyle: { color: c.alert },
        data: data.alerts.map((a) => ({
          value: [Date.parse(a.openedAt), alertY(a.temperature)],
          itemStyle: { color: a.severity === 'critical' ? c.alert : c.warm },
          name: a.label,
        })),
        z: 5,
      },
    ],
  };
}
