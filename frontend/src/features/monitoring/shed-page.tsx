import { useParams } from 'react-router';
import { DataFreshness } from '@/components/data-freshness';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { DaySummary } from './components/day-summary';
import { EventFeed } from './components/event-feed';
import { IrrigationPanel } from './components/irrigation-panel';
import { TemperatureChart } from './components/temperature-chart';
import { TemperaturePanel } from './components/temperature-panel';
import { useDevices, useEvents, useLast24h, useSummary } from './queries';
import { SettingsDialog } from './settings-dialog';

export function ShedPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const devices = useDevices();
  const readings = useLast24h(id);
  const events = useEvents(id);
  const summary = useSummary(id);
  const device = devices.data?.find((d) => d.id === id);

  if (devices.isPending) return <Skeleton className="h-96 rounded-xl" />;
  if (!device) {
    return <p className="py-16 text-center text-muted-foreground">Este galpón no existe o no tienes acceso.</p>;
  }

  const lastAt = device.lastReading ? Date.parse(device.lastReading.createdAt) : null;
  const data = readings.data ?? [];

  return (
    <>
      <PageHeader
        title={device.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {device.shed} · rango ideal {device.settings.tempMin}–{device.settings.tempMax} °C
            </span>
            <DataFreshness at={lastAt} />
          </span>
        }
        actions={can('settings.manage') ? <SettingsDialog device={device} /> : undefined}
      />

      {readings.isPending ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <Skeleton className="h-64 rounded-xl lg:col-span-5" />
          <Skeleton className="h-64 rounded-xl lg:col-span-4" />
          <Skeleton className="h-64 rounded-xl lg:col-span-3" />
          <Skeleton className="h-96 rounded-xl lg:col-span-12" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <TemperaturePanel readings={data} settings={device.settings} />
          </div>
          <div className="lg:col-span-4">
            <IrrigationPanel readings={data} events={[...(events.data ?? [])].reverse()} />
          </div>
          <div className="lg:col-span-3">
            <DaySummary summary={summary.data} />
          </div>
          <div className="lg:col-span-8">
            <TemperatureChart deviceId={device.id} readings={data} settings={device.settings} />
          </div>
          <div className="lg:col-span-4">
            <EventFeed events={[...(events.data ?? [])].reverse()} />
          </div>
        </div>
      )}
      <p className="mt-8 text-xs text-muted-foreground">Horas en tiempo de Guatemala (UTC−6).</p>
    </>
  );
}
