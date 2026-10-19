import { useEffect, useRef, type MutableRefObject } from 'react';
import { BarChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { cn } from '@/lib/utils';

echarts.use([
  LineChart,
  BarChart,
  HeatmapChart,
  ScatterChart,
  DataZoomComponent,
  LegendComponent,
  MarkPointComponent,
  GridComponent,
  TooltipComponent,
  MarkAreaComponent,
  MarkLineComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export type EChartOption = echarts.EChartsCoreOption;
export type EChartInstance = echarts.ECharts;

interface EChartProps {
  option: EChartOption;
  /** Changing this key replaces the whole option instead of merging it. */
  resetKey?: string;
  className?: string;
  ariaLabel: string;
  /** Gives the parent the chart instance (e.g. to export it as an image). */
  instanceRef?: MutableRefObject<EChartInstance | null>;
}

export function EChart({ option, resetKey, className, ariaLabel, instanceRef }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const lastResetKey = useRef(resetKey);
  const lastOption = useRef<EChartOption | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const chart = echarts.init(element, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    if (instanceRef) instanceRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    // Canvas text drawn before the web fonts load keeps the fallback font: redraw once they are ready.
    void document.fonts?.ready.then(() => {
      if (!chart.isDisposed() && lastOption.current) chart.setOption(lastOption.current, { notMerge: true });
    });
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
      if (instanceRef) instanceRef.current = null;
    };
  }, [instanceRef]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const reset = lastResetKey.current !== resetKey;
    lastResetKey.current = resetKey;
    lastOption.current = option;
    chart.setOption(option, reset ? { notMerge: true } : { replaceMerge: ['series'] });
  }, [option, resetKey]);

  return <div ref={containerRef} role="img" aria-label={ariaLabel} className={cn('w-full', className)} />;
}
