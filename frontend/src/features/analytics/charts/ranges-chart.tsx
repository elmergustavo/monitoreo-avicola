import { ImageDown } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { EChart, type EChartInstance, type EChartOption } from '@/components/echart';
import { Button } from '@/components/ui/button';
import { axisLabelStyle, tooltipStyle, useChartColors, type ChartColors } from '@/lib/chart-colors';
import { formatDuration } from '@/lib/format';
import { THERMAL_LABEL } from '@/lib/thermal';
import { ChartCard } from '../chart-card';
import { ThermalLegend } from '../thermal-legend';
import { downloadChartImage, formatDayKey, formatDayKeyLong, formatDayKeyShort, percent } from '../format';
import { useAnalytics, type AnalyticsParams } from '../queries';
import type { AnalyticsRanges } from '../types';

const BANDS = ['cold', 'optimal', 'warm', 'alert'] as const;

/** Chart 3: share of each day spent cold, optimal, warm and at alert level. */
export function RangesChart({ params, fileName }: { params: AnalyticsParams; fileName: string }) {
  const query = useAnalytics('ranges', params);
  const colors = useChartColors();
  const chartRef = useRef<EChartInstance | null>(null);
  const data = query.data;
  const option = useMemo(() => (data ? buildOption(data, colors) : null), [data, colors]);
  const insight = useMemo(() => (data ? describe(data) : null), [data]);
  const withData = data?.days.filter((d) => d.readings > 0) ?? [];

  return (
    <ChartCard
      title="Tiempo en cada rango"
      description="Qué parte de cada día pasó el galpón con frío, en el rango óptimo, con calor o en alerta."
      actions={
        <Button variant="outline" size="sm" className="h-9" onClick={() => downloadChartImage(chartRef.current, `${fileName}-rangos`, colors.background)} disabled={!data}>
          <ImageDown aria-hidden="true" /> Imagen
        </Button>
      }
      insight={insight}
      isPending={query.isPending}
      isError={query.isError}
      isRefreshing={query.isPlaceholderData}
      isEmpty={withData.length === 0}
      minHeight="min-h-[340px]"
    >
      {option && (
        <>
          <EChart option={option} resetKey={`${params.from}:${params.to}`} instanceRef={chartRef} className="h-[320px]" ariaLabel={insight ?? 'Tiempo en cada rango por día'} />
          <ThermalLegend thresholds={data!.thresholds} />
        </>
      )}
    </ChartCard>
  );
}

function buildOption(data: AnalyticsRanges, c: ChartColors): EChartOption {
  const { tempMin, tempMax, tempAlert } = data.thresholds;
  const color = { cold: c.cool, optimal: c.optimal, warm: c.warm, alert: c.alert };
  const label = {
    cold: `${THERMAL_LABEL.cool} <${tempMin}°`,
    optimal: `${THERMAL_LABEL.optimal} ${tempMin}–${tempMax}°`,
    warm: `${THERMAL_LABEL.warm} ${tempMax}–${tempAlert}°`,
    alert: `${THERMAL_LABEL.alert} ≥${tempAlert}°`,
  };
  const many = data.days.length > 14;

  return {
    animation: false,
    grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: c.band } },
      ...tooltipStyle(c),
      formatter: (params: unknown) => {
        const list = params as Array<{ dataIndex: number }>;
        const day = data.days[list[0]?.dataIndex ?? 0];
        if (!day || day.readings === 0) return '';
        const rows = BANDS.map((band) => {
          const share = day[band] ?? 0;
          return `<div style="display:flex;justify-content:space-between;gap:16px;font-size:12px">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color[band]};margin-right:6px"></span>${label[band]}</span>
            <span style="font-weight:600">${percent(share)} · ${formatDuration(share * 24 * 60)}</span></div>`;
        }).join('');
        return `<div style="font-size:12px;opacity:.7;margin-bottom:4px">${formatDayKeyLong(day.date)}</div>${rows}`;
      },
    },
    xAxis: {
      type: 'category',
      data: data.days.map((d) => d.date),
      axisLine: { lineStyle: { color: c.grid } },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(c), fontFamily: 'IBM Plex Sans', hideOverlap: true, formatter: many ? formatDayKeyShort : formatDayKey },
    },
    yAxis: {
      type: 'value',
      max: 100,
      interval: 25,
      splitLine: { lineStyle: { color: c.grid } },
      axisLabel: { ...axisLabelStyle(c), formatter: '{value} %' },
    },
    series: BANDS.map((band) => ({
      name: label[band],
      type: 'bar',
      stack: 'day',
      barMaxWidth: 36,
      itemStyle: { color: color[band], borderRadius: band === 'alert' ? [3, 3, 0, 0] : 0 },
      emphasis: { focus: 'series' },
      data: data.days.map((d) => (d.readings > 0 ? Math.round((d[band] ?? 0) * 1000) / 10 : null)),
    })),
  };
}

function describe(data: AnalyticsRanges): string | null {
  const days = data.days.filter((d) => d.readings > 0);
  if (days.length === 0) return null;
  const average = (band: (typeof BANDS)[number]) => days.reduce((sum, d) => sum + (d[band] ?? 0), 0) / days.length;
  const best = days.reduce((a, b) => ((b.optimal ?? 0) > (a.optimal ?? 0) ? b : a));
  const optimal = average('optimal');
  const cold = average('cold');
  const hot = average('warm') + average('alert');
  const main = cold > hot ? `con frío (${percent(cold)})` : `con calor (${percent(hot)})`;
  return `En promedio el galpón estuvo ${percent(optimal)} del día en el rango óptimo y la mayor parte del resto ${main}. El mejor día fue el ${formatDayKey(best.date)} (${percent(best.optimal)}).`;
}
