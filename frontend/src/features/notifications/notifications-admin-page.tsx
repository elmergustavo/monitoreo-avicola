import { CircleCheck, CircleDashed, ExternalLink, Loader2, MessageCircle, Plus, RotateCw, Send, Unlink, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CopyButton } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import { Panel, PanelTitle } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDateTime } from '@/lib/dates';
import type { DeliveryItem, DeliveryStatus, NotificationGroup, NotificationProviders } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useDeliveries, useGroupLink, useGroups, useNotificationSettings, useRetryDelivery, useUnlinkGroup } from './queries';

const STATUS_FILTERS = { all: 'Todos', failed: 'Fallidos', skipped: 'No enviados', sent: 'Enviados', pending: 'En cola' } as const;
type StatusFilter = keyof typeof STATUS_FILTERS;

const STATUS_PILL: Record<DeliveryStatus, { label: string; className: string }> = {
  sent: { label: 'Enviado', className: 'bg-optimal/12 text-optimal' },
  pending: { label: 'En cola', className: 'bg-muted text-muted-foreground' },
  failed: { label: 'Falló', className: 'bg-alert/12 text-alert' },
  skipped: { label: 'No enviado', className: 'bg-warm/15 text-warm' },
};

/** Administración → Notificaciones: providers, the farm's Telegram groups and the delivery log. */
export function NotificationsAdminPage() {
  const [linking, setLinking] = useState(false);
  const settings = useNotificationSettings();
  const groups = useGroups(linking ? 3_000 : undefined);
  const closeLink = useCallback(() => setLinking(false), []);
  const telegramReady = settings.data?.providers.telegram.configured ?? false;

  return (
    <>
      <PageHeader title="Notificaciones" description="Canales de envío, grupo de la granja y registro de mensajes enviados." />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <ProvidersPanel providers={settings.data?.providers} />
        </div>
        <div className="lg:col-span-7">
          <GroupsPanel
            groups={groups.data}
            isPending={groups.isPending}
            canLink={telegramReady}
            onLink={() => setLinking(true)}
          />
        </div>
      </div>
      <DeliveryLog />
      {linking && <GroupLinkDialog onClose={closeLink} groups={groups.data ?? []} />}
    </>
  );
}

function ProvidersPanel({ providers }: { providers: NotificationProviders | undefined }) {
  if (!providers) return <Skeleton className="h-56 rounded-xl" />;
  const rows = [
    {
      name: 'Telegram',
      icon: Send,
      ready: providers.telegram.configured,
      detail: providers.telegram.configured
        ? `Bot @${providers.telegram.botUsername ?? '…'}`
        : 'Falta TELEGRAM_BOT_TOKEN en el servidor.',
    },
    {
      name: 'WhatsApp (Twilio)',
      icon: MessageCircle,
      ready: providers.whatsapp.configured,
      detail: providers.whatsapp.configured
        ? `Número ${providers.whatsapp.number}${providers.whatsapp.sandboxJoinCode ? ' · modo de prueba (sandbox)' : ''}`
        : 'Faltan TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en el servidor.',
    },
  ];
  return (
    <Panel>
      <PanelTitle>Canales del servidor</PanelTitle>
      <ul className="space-y-4">
        {rows.map((row) => (
          <li key={row.name} className="flex items-start gap-3">
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-lg',
                row.ready ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              <row.icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-medium">
                {row.name}
                {row.ready ? (
                  <CircleCheck className="size-4 text-optimal" aria-label="Activo" />
                ) : (
                  <CircleDashed className="size-4 text-muted-foreground" aria-label="Sin configurar" />
                )}
              </p>
              <p className="text-sm break-words text-muted-foreground">{row.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      {providers.whatsapp.sandboxJoinCode && (
        <p className="mt-5 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
          En modo de prueba, cada persona debe enviar <b>{providers.whatsapp.sandboxJoinCode}</b> al número antes de vincularse, y
          WhatsApp solo entrega mensajes si la persona escribió en las últimas 24 h.
        </p>
      )}
    </Panel>
  );
}

function GroupsPanel({
  groups,
  isPending,
  canLink,
  onLink,
}: {
  groups: NotificationGroup[] | undefined;
  isPending: boolean;
  canLink: boolean;
  onLink: () => void;
}) {
  const unlink = useUnlinkGroup();
  const [confirming, setConfirming] = useState<NotificationGroup | null>(null);

  return (
    <Panel>
      <PanelTitle
        aside={
          canLink && (
            <Button size="sm" className="h-9" onClick={onLink}>
              <Plus aria-hidden="true" /> Vincular grupo
            </Button>
          )
        }
      >
        Grupos de Telegram
      </PanelTitle>
      <p className="mb-4 text-sm text-muted-foreground">
        Reciben cada alerta, quién la atiende, cuándo se resuelve y el resumen diario. Cualquiera con su Telegram vinculado puede tocar
        "Lo atiendo" desde el grupo.
      </p>
      {isPending ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : !groups || groups.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">
          <Users className="size-4 shrink-0" aria-hidden="true" />
          {canLink ? 'Ningún grupo vinculado todavía.' : 'Configura Telegram en el servidor para vincular un grupo.'}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {groups.map((group) => (
            <li key={group.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{group.label ?? 'Grupo'}</p>
                <p className="text-xs text-muted-foreground">
                  {group.active ? 'Activo' : 'Desactivado: sacaron al bot del grupo'} · vinculado por {group.linkedBy?.name ?? '—'} el{' '}
                  {formatDateTime(group.createdAt)}
                </p>
              </div>
              <Button size="sm" variant="ghost" className="h-9 text-muted-foreground" onClick={() => setConfirming(group)}>
                <Unlink aria-hidden="true" /> Desvincular
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Desvincular grupo"
        description={`"${confirming?.label ?? 'El grupo'}" dejará de recibir alertas. El bot seguirá en el grupo hasta que lo saques.`}
        confirmLabel="Desvincular"
        destructive
        onConfirm={() => confirming && unlink.mutate(confirming.id)}
      />
    </Panel>
  );
}

function GroupLinkDialog({ onClose, groups }: { onClose: () => void; groups: NotificationGroup[] }) {
  const { mutate, data: link } = useGroupLink();
  useEffect(() => mutate(), [mutate]);

  // Close as soon as a new group shows up.
  const [known] = useState(() => new Set(groups.map((g) => `${g.id}:${g.active}`)));
  const added = groups.find((g) => g.active && !known.has(`${g.id}:${g.active}`));
  useEffect(() => {
    if (added) {
      toast.success('Grupo vinculado', { description: added.label ?? undefined });
      onClose();
    }
  }, [added, onClose]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular un grupo de Telegram</DialogTitle>
          <DialogDescription>Por ejemplo, el grupo de los encargados de la granja.</DialogDescription>
        </DialogHeader>
        {!link ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : (
          <div className="space-y-5">
            <ol className="space-y-4 text-sm">
              <li className="flex gap-3">
                <StepNumber n={1} />
                <div className="min-w-0 flex-1 pt-0.5">
                  <p>
                    Agrega a <b>@{link.botUsername}</b> al grupo:
                  </p>
                  <Button asChild className="mt-2">
                    <a href={link.addToGroupUrl} target="_blank" rel="noreferrer">
                      <Send aria-hidden="true" /> Elegir grupo en Telegram <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  </Button>
                </div>
              </li>
              <li className="flex gap-3">
                <StepNumber n={2} />
                <div className="min-w-0 flex-1 pt-0.5">
                  <p>Si el grupo no se vincula solo, escribe en el grupo:</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="rounded-md bg-muted px-2.5 py-1.5 font-mono text-sm">{link.command}</code>
                    <CopyButton value={link.command} />
                  </div>
                </div>
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">El código vence a las {formatDateTime(link.expiresAt)}.</p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Esperando al grupo… esta ventana se cierra sola.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary tabular">
      {n}
    </span>
  );
}

function DeliveryLog() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const deliveries = useDeliveries(status);
  const retry = useRetryDelivery();

  return (
    <section aria-labelledby="delivery-log" className="mt-10">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="delivery-log" className="font-display text-xl font-semibold tracking-tight">
            Mensajes enviados
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Lo que salió hacia Telegram y WhatsApp. Se reintenta solo hasta 5 veces.</p>
        </div>
        <ToggleGroup
          type="single"
          value={status}
          onValueChange={(value) => value && setStatus(value as StatusFilter)}
          variant="outline"
          aria-label="Estado del envío"
          className="flex-wrap"
        >
          {(Object.keys(STATUS_FILTERS) as StatusFilter[]).map((key) => (
            <ToggleGroupItem key={key} value={key} className="h-10 px-3">
              {STATUS_FILTERS[key]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {deliveries.isPending ? (
        <Skeleton className="h-60 rounded-xl" />
      ) : deliveries.isError ? (
        <p className="text-sm text-destructive">No se pudo cargar el registro.</p>
      ) : deliveries.data.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {status === 'all' ? 'Todavía no se ha enviado ningún mensaje.' : 'No hay mensajes con este estado.'}
        </p>
      ) : (
        <ol className="divide-y rounded-xl border bg-card">
          {deliveries.data.map((item) => (
            <DeliveryRow key={item.id} item={item} onRetry={() => retry.mutate(item.id)} retrying={retry.isPending && retry.variables === item.id} />
          ))}
        </ol>
      )}
    </section>
  );
}

function DeliveryRow({ item, onRetry, retrying }: { item: DeliveryItem; onRetry: () => void; retrying: boolean }) {
  const Icon = item.channel.type === 'telegram' ? Send : MessageCircle;
  const pill = STATUS_PILL[item.status];
  const recipient = item.channel.isGroup ? (item.channel.label ?? 'Grupo') : (item.channel.user?.name ?? item.channel.label ?? '—');

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        <span className="sr-only">{item.channel.type === 'telegram' ? 'Telegram' : 'WhatsApp'}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">{recipient}</span>
          {item.channel.isGroup && <span className="text-xs text-muted-foreground">(grupo)</span>}
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', pill.className)}>{pill.label}</span>
        </p>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{item.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground tabular">
          {formatDateTime(item.createdAt)}
          {item.attempts > 1 && ` · ${item.attempts} intentos`}
        </p>
        {item.lastError && item.status !== 'sent' && <p className="mt-1 text-xs break-words text-alert">{item.lastError}</p>}
      </div>
      {(item.status === 'failed' || item.status === 'skipped') && (
        <Button size="sm" variant="outline" className="h-9" onClick={onRetry} disabled={retrying}>
          {retrying ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}
          Reintentar
        </Button>
      )}
    </li>
  );
}
