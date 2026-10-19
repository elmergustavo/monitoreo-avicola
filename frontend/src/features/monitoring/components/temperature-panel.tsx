import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Panel, PanelTitle } from '@/components/panel';
import { formatTemp, formatTime } from '@/lib/format';
import { classifyTemperature, THERMAL_HINT, THERMAL_LABEL } from '@/lib/thermal';
import { cn } from '@/lib/utils';
import { computeTrend } from '../stats';
import type { Reading, ShedSettings } from '../types';
import { THERMAL_ICON, THERMAL_SOFT, THERMAL_TEXT } from './thermal-styles';
import { ThermalScale } from './thermal-scale';

export function TemperaturePanel({ readings, settings }: { readings: Reading[]; settings: ShedSettings }) {
  const last = readings.at(-1);
  if (!last) return <Panel>Sin lecturas todavía.</Panel>;

  const state = classifyTemperature(last.temperature, settings);
  const Icon = THERMAL_ICON[state];
  const trend = computeTrend(readings);
  const TrendIcon = trend === null || Math.abs(trend) < 0.2 ? ArrowRight : trend > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Panel className="flex flex-col">
      <PanelTitle aside={<span className="font-mono text-xs text-muted-foreground tabular">{formatTime(last.at)}</span>}>
        Temperatura actual
      </PanelTitle>

      <div className="flex items-end justify-between gap-4">
        <p className={cn('font-display leading-none font-semibold tracking-tight tabular', THERMAL_TEXT[state])}>
          <span className="text-7xl sm:text-8xl">{formatTemp(last.temperature)}</span>
          <span className="ml-1 align-top text-3xl font-medium sm:text-4xl">°C</span>
        </p>
        <div
          className={cn('mb-2 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium', THERMAL_SOFT[state])}
        >
          <Icon className="size-4" aria-hidden="true" />
          {THERMAL_LABEL[state]}
        </div>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>{THERMAL_HINT[state]}</span>
        {trend !== null && (
          <span className="flex items-center gap-1 text-foreground">
            <TrendIcon className="size-4" aria-hidden="true" />
            <span className="tabular">
              {trend > 0 ? '+' : ''}
              {formatTemp(trend)} °C
            </span>
            <span className="text-muted-foreground">en 30 min</span>
          </span>
        )}
      </p>

      <ThermalScale value={last.temperature} settings={settings} className="mt-auto pt-8" />
    </Panel>
  );
}
