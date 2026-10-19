import { useState } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { LiveIndicator } from '@/components/live-indicator';
import { ThemeToggle } from '@/components/theme-toggle';
import { DaySummary } from '@/features/monitoring/components/day-summary';
import { EventFeed } from '@/features/monitoring/components/event-feed';
import { IrrigationPanel } from '@/features/monitoring/components/irrigation-panel';
import { ShedTabs } from '@/features/monitoring/components/shed-tabs';
import { TemperatureChart } from '@/features/monitoring/components/temperature-chart';
import { TemperaturePanel } from '@/features/monitoring/components/temperature-panel';
import { useTelemetry } from '@/features/monitoring/use-telemetry';

export default function App() {
  const { sheds, lastUpdate } = useTelemetry();
  const [selectedId, setSelectedId] = useState(sheds[0]?.shed.id ?? '');
  const selected = sheds.find((s) => s.shed.id === selectedId) ?? sheds[0];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark className="size-8 text-primary" />
            <div className="leading-tight">
              <p className="font-display text-lg font-semibold tracking-tight">La Sierra</p>
              <p className="text-xs text-muted-foreground">Monitoreo de galpones</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <LiveIndicator lastUpdate={lastUpdate} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 pb-12 sm:px-6 sm:pt-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {selected?.shed.name ?? 'Galpones'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Granjas Avícolas La Sierra · rango ideal {selected?.shed.settings.tempMin}–
              {selected?.shed.settings.tempMax} °C
            </p>
          </div>
          <ShedTabs sheds={sheds} selectedId={selected?.shed.id ?? ''} onSelect={setSelectedId} />
        </div>

        {selected && (
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <TemperaturePanel readings={selected.readings} settings={selected.shed.settings} />
            </div>
            <div className="lg:col-span-4">
              <IrrigationPanel readings={selected.readings} events={selected.events} />
            </div>
            <div className="lg:col-span-3">
              <DaySummary readings={selected.readings} events={selected.events} settings={selected.shed.settings} />
            </div>
            <div className="lg:col-span-8">
              <TemperatureChart readings={selected.readings} settings={selected.shed.settings} />
            </div>
            <div className="lg:col-span-4">
              <EventFeed events={selected.events} />
            </div>
          </div>
        )}

        <p className="mt-8 text-xs text-muted-foreground">
          Horas en tiempo de Guatemala (UTC−6). Datos de demostración generados en el navegador.
        </p>
      </main>
    </div>
  );
}
