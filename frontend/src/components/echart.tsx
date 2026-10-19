import { useEffect, useRef } from 'react';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { cn } from '@/lib/utils';

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  MarkAreaComponent,
  MarkLineComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export type EChartOption = echarts.EChartsCoreOption;

interface EChartProps {
  option: EChartOption;
  /** Changing this key replaces the whole option instead of merging it. */
  resetKey?: string;
  className?: string;
  ariaLabel: string;
}

export function EChart({ option, resetKey, className, ariaLabel }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const lastResetKey = useRef(resetKey);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const chart = echarts.init(element, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const reset = lastResetKey.current !== resetKey;
    lastResetKey.current = resetKey;
    chart.setOption(option, reset ? { notMerge: true } : { replaceMerge: ['series'] });
  }, [option, resetKey]);

  return <div ref={containerRef} role="img" aria-label={ariaLabel} className={cn('w-full', className)} />;
}
