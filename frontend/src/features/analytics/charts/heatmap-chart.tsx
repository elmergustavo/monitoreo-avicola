import { ImageDown } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { EChart, type EChartInstance, type EChartOption } from '@/components/echart';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { axisLabelStyle, tooltipStyle, useChartColors, type ChartColors } from '@/lib/chart-colors';
import { formatTemp } from '@/lib/format';
import { THERMAL_LABEL } from '@/lib/thermal';
import { ChartCard } from '../chart-card';
import { ThermalLegend } from '../thermal-legend';
import { downloadChartImage, formatDayKey, hourLabel } from '../format';
import { useAnalytics, type AnalyticsParams } from '../queries';
import type { AnalyticsHeatmap } from '../types';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Chart 2: average temperature for each hour of each day. */
export function HeatmapChart({ params, fileName }: { params: AnalyticsParams; fileName: string }) {
  const query = useAnalytics('heatmap', params);
  const colors = useChartColors();
  const chartRef = useRef<EChartInstance | null>(null);
  const data = query.data;

  // Numbers inside the cells only fit on wide screens and short periods.
  const showValues = !useIsMobile() && (data?.days.length ?? 0) <= 10;
  const option = useMemo(() => (data ? buildOption(data, colors, showValues) : null), [data, colors, showValues]);
  const insight = useMemo(() => (data ? describe(data) : null), [data]);
  const days = data?.days.length ?? 7;
  // Rows shrink for long periods so 90 days still fit on screen.
  const rowHeight = days <= 14 ? 28 : days <= 31 ? 18 : 9;
  const height = Math.max(300, days * rowHeight + 110);

  return (
    <ChartCard
      title="Mapa de calor por hora"
      description="Temperatura promedio de cada hora de cada día. Muestra a qué horas se calienta el galpón."
      actions={
        <Button variant="outline" size="sm" className="h-9" onClick={() => downloadChartImage(chartRef.current, `${fileName}-mapa-de-calor`, colors.background)} disabled={!data}>
          <ImageDown aria-hidden="true" /> Imagen
        </Button>
      }
      insight={insight}
      isPending={query.isPending}
      isError={query.isError}
      isRefreshing={query.isPlaceholderData}
      isEmpty={data?.cells.length === 0}
      minHeight="min-h-[300px]"
    >
      {option && data && (
        <>
          {/* Height grows with the number of days. */}
          <div style={{ height }}>
            <EChart
              option={option}
              resetKey={`${params.from}:${params.to}`}
              instanceRef={chartRef}
              ariaLabel={insight ? `Mapa de calor por hora. ${insight}` : 'Mapa de calor por hora'}
              className="h-full"
            />
          </div>
          <ThermalLegend thresholds={data.thresholds} />
        </>
      )}
    </ChartCard>
  );
}

function buildOption(data: AnalyticsHeatmap, c: ChartColors, showValues: boolean): EChartOption {
  const { tempMin, tempMax, tempAlert } = data.thresholds;
  const dayIndex = new Map(data.days.map((d, i) => [d, i]));

  return {
    animation: false,
    grid: { left: 8, right: 8, top: 28, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltipStyle(c),
      formatter: (p: { value: [number, number, number, number, number] }) => {
        const [hour, day, average, max, count] = p.value;
        return `<div style="font-size:12px;opacity:.7">${formatDayKey(data.days[day])} · ${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}</div>
          <div style="font-size:16px;font-weight:600;margin-top:2px">${formatTemp(average)} °C <span style="font-size:12px;font-weight:500;opacity:.75">promedio</span></div>
          <div style="font-size:12px;opacity:.75">Máxima ${formatTemp(max)} °C · ${count} lecturas</div>`;
      },
    },
    xAxis: {
      type: 'category',
      data: HOURS.map(hourLabel),
      position: 'top',
      axisLine: { show: false },
      axisTick: { show: false },
      splitArea: { show: false },
      axisLabel: { ...axisLabelStyle(c), interval: 2, formatter: (v: string) => v.slice(0, 2) },
    },
    yAxis: {
      type: 'category',
      data: data.days,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(c), fontFamily: 'IBM Plex Sans', formatter: formatDayKey },
    },
    visualMap: {
      type: 'piecewise',
      dimension: 2,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      show: false,
      pieces: [
        { lt: tempMin, color: c.cool, label: `${THERMAL_LABEL.cool} <${tempMin}°` },
        { gte: tempMin, lte: tempMax, color: c.optimal, label: `${THERMAL_LABEL.optimal} ${tempMin}–${tempMax}°` },
        { gt: tempMax, lt: tempAlert, color: c.warm, label: `${THERMAL_LABEL.warm} ${tempMax}–${tempAlert}°` },
        { gte: tempAlert, color: c.alert, label: `${THERMAL_LABEL.alert} ≥${tempAlert}°` },
      ],
    },
    series: [
      {
        type: 'heatmap',
        data: data.cells.map((cell) => [cell.hour, dayIndex.get(cell.date) ?? 0, cell.average, cell.max, cell.count]),
        itemStyle: { borderColor: c.background, borderWidth: data.days.length > 31 ? 0.5 : 2, borderRadius: 3 },
        label: {
          show: showValues,
          color: '#fff',
          fontFamily: 'IBM Plex Mono',
          fontSize: 10,
          formatter: (p: { value: number[] }) => Math.round(p.value[2]).toString(),
        },
        emphasis: { itemStyle: { borderColor: c.text, borderWidth: 1.5 } },
      },
    ],
  };
}

/** "Lo más caluroso suele ser a las 14:00 (31.2 °C). Pasa de 30 °C de 11:00 a 17:00." */
function describe(data: AnalyticsHeatmap): string | null {
  if (data.cells.length === 0) return null;
  const byHour = HOURS.map((hour) => {
    const values = data.cells.filter((c) => c.hour === hour).map((c) => c.average);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  });
  let hottest = 0;
  byHour.forEach((v, h) => {
    if (v !== null && (byHour[hottest] === null || v > byHour[hottest]!)) hottest = h;
  });
  const hot = HOURS.filter((h) => (byHour[h] ?? -Infinity) > data.thresholds.tempMax);
  const base = `La hora más calurosa suele ser a las ${hourLabel(hottest)}, con ${formatTemp(byHour[hottest]!)} °C en promedio.`;
  if (hot.length === 0) return `${base} En promedio ninguna hora supera los ${data.thresholds.tempMax} °C.`;
  return `${base} En promedio pasa de ${data.thresholds.tempMax} °C entre las ${hourLabel(hot[0])} y las ${hourLabel((hot.at(-1)! + 1) % 24)}: buen horario para adelantar el riego.`;
}
