import { Bell, BellOff, CheckCheck, CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { formatDateTime } from '@/lib/dates';
import { formatAgo } from '@/lib/format';
import type { NotificationItem } from '@/lib/types';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { AlertCard } from './alert-card';
import { useActiveAlerts, useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from './queries';

/** Bell in the top bar: open alerts first, then the user's recent notifications. */
export function NotificationCenter() {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const alerts = useActiveAlerts(can('telemetry.read'));
  const count = unread.data ?? 0;
  const pendingAlerts = alerts.data?.filter((a) => a.status === 'open').length ?? 0;
  const hasCritical = alerts.data?.some((a) => a.status === 'open' && a.severity === 'critical') ?? false;

  const label = count === 0 ? 'Notificaciones, ninguna sin leer' : `Notificaciones, ${count} sin leer`;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-10" aria-label={label}>
          <Bell className={cn('size-5', hasCritical && 'text-alert')} aria-hidden="true" />
          {count > 0 && (
            <span
              className={cn(
                'absolute top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] leading-none font-semibold tabular',
                hasCritical ? 'bg-alert text-white' : 'bg-primary text-primary-foreground',
              )}
              aria-hidden="true"
            >
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      {/* One atomic status message for screen readers instead of announcing a bare number. */}
      <span role="status" aria-atomic="true" className="sr-only">
        {count > 0 ? `${count} notificaciones sin leer` : ''}
      </span>

      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="font-display text-xl">Notificaciones</SheetTitle>
          <SheetDescription>
            {pendingAlerts > 0
              ? `${pendingAlerts} ${pendingAlerts === 1 ? 'alerta espera' : 'alertas esperan'} que alguien la atienda.`
              : 'Alertas de los galpones y avisos del sistema.'}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {can('telemetry.read') && (
            <section aria-labelledby="active-alerts" className="border-b px-5 py-4">
              <h3 id="active-alerts" className="mb-3 text-[13px] font-medium tracking-wide text-muted-foreground uppercase">
                Alertas activas
              </h3>
              {alerts.isPending ? (
                <Skeleton className="h-24 rounded-xl" />
              ) : alerts.data && alerts.data.length > 0 ? (
                <div className="space-y-2.5">
                  {alerts.data.map((alert) => (
                    <AlertCard key={alert.id} alert={alert} compact />
                  ))}
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleCheck className="size-4 text-optimal" aria-hidden="true" />
                  Todo en orden: no hay alertas abiertas.
                </p>
              )}
            </section>
          )}
          <RecentNotifications enabled={open} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RecentNotifications({ enabled, onNavigate }: { enabled: boolean; onNavigate: () => void }) {
  const navigate = useNavigate();
  const now = useNow(30_000);
  const notifications = useNotifications(enabled);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const hasUnread = notifications.data?.some((n) => !n.readAt) ?? false;

  const open = (item: NotificationItem) => {
    if (!item.readAt) markRead.mutate(item.id);
    if (item.deviceId) {
      onNavigate();
      void navigate(`/galpones/${item.deviceId}`);
    }
  };

  return (
    <section aria-labelledby="recent-notifications" className="px-5 py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id="recent-notifications" className="text-[13px] font-medium tracking-wide text-muted-foreground uppercase">
          Recientes
        </h3>
        {hasUnread && (
          <Button variant="ghost" size="sm" className="-mr-2 h-9" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            <CheckCheck aria-hidden="true" /> Marcar todo como leído
          </Button>
        )}
      </div>

      {notifications.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      ) : notifications.isError ? (
        <p className="text-sm text-destructive">No se pudieron cargar las notificaciones.</p>
      ) : notifications.data.length === 0 ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <BellOff className="size-4" aria-hidden="true" />
          Aún no tienes notificaciones.
        </p>
      ) : (
        <ul className="-mx-2">
          {notifications.data.map((item) => {
            const unread = !item.readAt;
            const createdAt = Date.parse(item.createdAt);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className="flex w-full gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      !unread
                        ? 'bg-transparent'
                        : item.severity === 'critical'
                          ? 'bg-alert'
                          : item.severity === 'warning'
                            ? 'bg-warm'
                            : 'bg-primary',
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm', unread ? 'font-medium' : 'text-muted-foreground')}>
                      {unread && <span className="sr-only">Sin leer: </span>}
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{item.body}</span>
                    <time className="mt-1 block text-xs text-muted-foreground tabular" dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
                      {formatAgo(createdAt, now)}
                    </time>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
