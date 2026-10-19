import { AlertCard } from './alert-card';
import { useActiveAlerts } from './queries';

/**
 * Open alerts shown above the page content until they are resolved.
 * Pass deviceId to show only one shed's alerts.
 */
export function ActiveAlertsBanner({ deviceId }: { deviceId?: string }) {
  const alerts = useActiveAlerts();
  const visible = (alerts.data ?? []).filter((alert) => !deviceId || alert.device.id === deviceId);
  if (visible.length === 0) return null;

  return (
    <section aria-label="Alertas activas" className="mb-6 grid gap-3 lg:grid-cols-2">
      {visible.map((alert) => (
        <AlertCard key={alert.id} alert={alert} showDevice={!deviceId} />
      ))}
    </section>
  );
}
