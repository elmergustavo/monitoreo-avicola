import { Check, Hand, Loader2 } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { formatAgo, formatTemp, formatTime } from '@/lib/format';
import type { AlertView } from '@/lib/types';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { ALERT_ICONS, SEVERITY_TONE } from './alert-meta';
import { useAcknowledgeAlert, useResolveAlert } from './queries';

/** One unresolved alert, with "Lo atiendo" (and "Cerrar" for alert managers). */
export function AlertCard({
  alert,
  showDevice = true,
  compact = false,
}: {
  alert: AlertView;
  showDevice?: boolean;
  compact?: boolean;
}) {
  const { can, user } = useAuth();
  const now = useNow(30_000);
  const acknowledge = useAcknowledgeAlert();
  const resolve = useResolveAlert();
  const Icon = ALERT_ICONS[alert.kind];
  const tone = SEVERITY_TONE[alert.severity];
  const openedAt = Date.parse(alert.openedAt);
  const acked = alert.status === 'acknowledged';
  const busy = acknowledge.isPending || resolve.isPending;

  const temperature =
    alert.peakTemperature !== null && alert.kind !== 'sustained_cold'
      ? `máx. ${formatTemp(alert.peakTemperature)} °C`
      : alert.triggerTemperature !== null
        ? `${formatTemp(alert.triggerTemperature)} °C`
        : null;

  return (
    <article
      className={cn('flex gap-3 rounded-xl border', compact ? 'p-3' : 'p-4', tone.surface)}
      aria-label={`${alert.label}${showDevice ? ` en ${alert.device.name}` : ''}`}
    >
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', tone.icon)}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 font-medium">
          {alert.label}
          {showDevice && (
            <Link
              to={`/galpones/${alert.device.id}`}
              className="text-sm font-normal text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {alert.device.name}
            </Link>
          )}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground tabular">
          Desde las {formatTime(openedAt)} ({formatAgo(openedAt, now)})
          {temperature && <> · {temperature}</>}
        </p>
        {acked && (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-optimal">
            <Check className="size-4" aria-hidden="true" />
            {alert.acknowledgedBy?.id === user?.id ? 'Tú la estás atendiendo' : `La atiende ${alert.acknowledgedBy?.name ?? 'alguien'}`}
          </p>
        )}
        {(!acked || can('alerts.manage')) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {!acked && (
              <Button size="sm" className="h-9" disabled={busy} onClick={() => acknowledge.mutate(alert)}>
                {acknowledge.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Hand aria-hidden="true" />
                )}
                Lo atiendo
              </Button>
            )}
            {can('alerts.manage') && (
              <Button
                size="sm"
                variant="ghost"
                className="h-9"
                disabled={busy}
                onClick={() => resolve.mutate(alert)}
                title="Marcar como resuelta aunque el sistema no lo haya detectado"
              >
                Cerrar alerta
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
