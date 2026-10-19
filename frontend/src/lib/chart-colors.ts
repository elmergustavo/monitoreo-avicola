import { useMemo } from 'react';
import { useTheme } from '@/components/use-theme';
import { cssVarToRgba } from './css-color';

/** Theme colors resolved for ECharts (it needs rgba, not oklch). Recomputed when the theme changes. */
export function useChartColors() {
  const { theme } = useTheme();
  return useMemo(() => {
    const dark = theme === 'dark';
    return {
      dark,
      line: cssVarToRgba('--chart-line'),
      band: cssVarToRgba('--chart-line', dark ? 0.16 : 0.1),
      grid: cssVarToRgba('--chart-grid'),
      muted: cssVarToRgba('--muted-foreground'),
      text: cssVarToRgba('--foreground'),
      background: cssVarToRgba('--card'),
      popover: cssVarToRgba('--popover'),
      border: cssVarToRgba('--border'),
      primary: cssVarToRgba('--primary'),
      cool: cssVarToRgba('--cool'),
      optimal: cssVarToRgba('--optimal'),
      warm: cssVarToRgba('--warm'),
      alert: cssVarToRgba('--alert'),
      water: cssVarToRgba('--water'),
      waterBand: cssVarToRgba('--water', dark ? 0.2 : 0.14),
      optimalBand: cssVarToRgba('--optimal', dark ? 0.13 : 0.1),
    };
  }, [theme]);
}

export type ChartColors = ReturnType<typeof useChartColors>;

/** Shared tooltip look. */
export const tooltipStyle = (c: ChartColors) => ({
  backgroundColor: c.popover,
  borderColor: c.border,
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: c.text, fontFamily: 'IBM Plex Sans', fontSize: 13 },
  extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,.08); border-radius: 8px;',
});

export const axisLabelStyle = (c: ChartColors) => ({
  color: c.muted,
  fontFamily: 'IBM Plex Mono',
  fontSize: 11,
});
