import { cn } from '@/lib/utils';
import { AlertCard } from './alert-card';
import { useActiveAlerts } from './queries';

/**
 * Open alerts shown above the page content until they are resolved.
 * Pass deviceId to show only one shed's alerts, and title to add a heading.
 */
export function ActiveAlertsBanner({ deviceId, title, className }: { deviceId?: string; title?: string; className?: string }) {
  const alerts = useActiveAlerts();
  const visible = (alerts.data ?? []).filter((alert) => !deviceId || alert.device.id === deviceId);
  if (visible.length === 0) return null;

  return (
    <section aria-label={title ? undefined : 'Alertas activas'} aria-labelledby={title ? 'active-alerts-title' : undefined} className={cn('mb-6', className)}>
      {title && (
        <h2 id="active-alerts-title" className="mb-3 font-display text-xl font-semibold tracking-tight">
          {title}
        </h2>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map((alert) => (
          <AlertCard key={alert.id} alert={alert} showDevice={!deviceId} />
        ))}
      </div>
    </section>
  );
}
