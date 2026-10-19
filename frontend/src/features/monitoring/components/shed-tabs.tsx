import { classifyTemperature, THERMAL_LABEL } from '@/lib/thermal';
import { formatTemp } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ShedTelemetry } from '../types';
import { THERMAL_BG } from './thermal-styles';

interface ShedTabsProps {
  sheds: ShedTelemetry[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function ShedTabs({ sheds, selectedId, onSelect }: ShedTabsProps) {
  return (
    <div role="tablist" aria-label="Galpones" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {sheds.map(({ shed, readings }) => {
        const last = readings.at(-1);
        const state = last ? classifyTemperature(last.temperature, shed.settings) : null;
        const selected = shed.id === selectedId;
        return (
          <button
            key={shed.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(shed.id)}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-3 rounded-lg border px-4 py-2 text-left transition-colors duration-150',
              selected
                ? 'border-foreground/80 bg-foreground text-background'
                : 'bg-card hover:border-foreground/30',
            )}
          >
            <span className="font-medium">{shed.name}</span>
            {last && state && (
              <span className="flex items-center gap-1.5 font-mono text-sm tabular">
                <span className={cn('size-2 rounded-full', THERMAL_BG[state])} aria-hidden="true" />
                {formatTemp(last.temperature)}°
                <span className="sr-only">{THERMAL_LABEL[state]}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
