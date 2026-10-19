import { BellRing, CircleAlert, CircleCheck, ExternalLink, Loader2, MessageCircle, Send, Unlink, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CopyButton } from '@/components/copy-button';
import { FormField } from '@/components/form-field';
import { Panel, PanelTitle } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import type { ChannelType, NotificationChannelView, NotificationSettings, WhatsAppLink } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useNotificationSettings, useSendTest, useTelegramLink, useUnlinkChannel, useUpdatePreferences, useWhatsAppLink } from './queries';

const CHANNEL_META: Record<ChannelType, { name: string; icon: LucideIcon }> = {
  telegram: { name: 'Telegram', icon: Send },
  whatsapp: { name: 'WhatsApp', icon: MessageCircle },
};

const linkKey = (channel: NotificationChannelView | undefined) =>
  channel ? `${channel.id}:${channel.lastInboundAt}:${channel.active}` : 'none';

/** "Mi perfil" → where and when this person gets alerts outside the dashboard. */
export function NotificationSettingsSection() {
  const [linking, setLinking] = useState<ChannelType | null>(null);
  const settings = useNotificationSettings(linking ? 3_000 : undefined);
  const closeLink = useCallback(() => setLinking(null), []);

  if (settings.isPending) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }
  if (settings.isError) return <p className="text-sm text-destructive">No se pudo cargar la configuración de notificaciones.</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChannelsPanel settings={settings.data} onLink={setLinking} />
      <PreferencesPanel settings={settings.data} />
      {/* Mounted only while open, so each opening starts fresh. */}
      {linking === 'telegram' && <TelegramLinkDialog onClose={closeLink} settings={settings.data} />}
      {linking === 'whatsapp' && <WhatsAppLinkDialog onClose={closeLink} settings={settings.data} />}
    </div>
  );
}

function ChannelsPanel({ settings, onLink }: { settings: NotificationSettings; onLink: (type: ChannelType) => void }) {
  const sendTest = useSendTest();
  return (
    <Panel className="flex flex-col">
      <PanelTitle>Dónde te avisamos</PanelTitle>
      <ul className="-mx-1 divide-y">
        <li className="flex items-start gap-3 px-1 py-3">
          <ChannelIcon icon={BellRing} active />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Campana del dashboard</p>
            <p className="text-sm text-muted-foreground">Siempre activa, con todas las alertas.</p>
          </div>
        </li>
        {(['telegram', 'whatsapp'] as const).map((type) => (
          <ChannelRow key={type} type={type} settings={settings} onLink={() => onLink(type)} />
        ))}
      </ul>
      <div className="mt-auto flex flex-wrap items-center gap-3 border-t pt-4">
        <Button variant="outline" onClick={() => sendTest.mutate()} disabled={sendTest.isPending}>
          {sendTest.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
          Enviar prueba
        </Button>
        <p className="text-xs text-muted-foreground">Llega a la campana y a cada chat vinculado.</p>
      </div>
    </Panel>
  );
}

function ChannelIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <span
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-lg',
        active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

function ChannelRow({ type, settings, onLink }: { type: ChannelType; settings: NotificationSettings; onLink: () => void }) {
  const { name, icon } = CHANNEL_META[type];
  const provider = settings.providers[type];
  const channel = settings.channels.find((c) => c.type === type);
  const enabled = settings.preferences[type];
  const updatePrefs = useUpdatePreferences();
  const unlink = useUnlinkChannel();
  const [confirming, setConfirming] = useState(false);
  const switchId = `channel-${type}`;

  let status: ReactNode;
  if (!provider.configured) {
    status = 'Todavía no está disponible: falta configurarlo en el servidor.';
  } else if (!channel) {
    status = 'Sin vincular.';
  } else if (!channel.active) {
    status = (
      <span className="text-warm">
        Dejó de funcionar (se bloqueó el bot o se salió del chat). Vuelve a vincularlo.
      </span>
    );
  } else if (type === 'whatsapp' && !channel.windowOpen) {
    status = (
      <span className="text-warm">
        {channel.label}: WhatsApp solo nos deja escribirte si nos enviaste un mensaje en las últimas 24 h. Escribe{' '}
        <b>ESTADO</b> al {settings.providers.whatsapp.number} para reactivarlo.
      </span>
    );
  } else {
    status = (
      <span className="inline-flex items-center gap-1.5">
        <CircleCheck className="size-3.5 text-optimal" aria-hidden="true" />
        Vinculado{channel.label ? ` como ${channel.label}` : ''}
      </span>
    );
  }

  const linked = Boolean(channel?.active);

  return (
    <li className="flex items-start gap-3 px-1 py-3">
      <ChannelIcon icon={icon} active={linked && enabled} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={switchId} className="font-medium">
            {name}
          </Label>
          {linked && (
            <Switch
              id={switchId}
              checked={enabled}
              onCheckedChange={(checked) => updatePrefs.mutate({ [type]: checked })}
              aria-describedby={`${switchId}-status`}
            />
          )}
        </div>
        <p id={`${switchId}-status`} className="mt-0.5 text-sm text-muted-foreground">
          {linked && !enabled ? 'Vinculado, pero pausado: no te enviaremos nada por aquí.' : status}
        </p>
        {provider.configured && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant={linked ? 'ghost' : 'default'} className="h-9" onClick={onLink}>
              {linked ? 'Cambiar' : 'Vincular'}
            </Button>
            {channel && (
              <Button size="sm" variant="ghost" className="h-9 text-muted-foreground" onClick={() => setConfirming(true)}>
                <Unlink aria-hidden="true" /> Desvincular
              </Button>
            )}
          </div>
        )}
      </div>
      {channel && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Desvincular ${name}`}
          description="Dejarás de recibir alertas en ese chat. Puedes volver a vincularlo cuando quieras."
          confirmLabel="Desvincular"
          destructive
          onConfirm={() => unlink.mutate(channel.id)}
        />
      )}
    </li>
  );
}

function PreferencesPanel({ settings }: { settings: NotificationSettings }) {
  const prefs = settings.preferences;
  const update = useUpdatePreferences();
  const [quietOn, setQuietOn] = useState(Boolean(prefs.quietStart));
  const [start, setStart] = useState(prefs.quietStart ?? '21:00');
  const [end, setEnd] = useState(prefs.quietEnd ?? '05:00');

  const saveQuiet = (nextStart: string, nextEnd: string) => {
    if (/^\d{2}:\d{2}$/.test(nextStart) && /^\d{2}:\d{2}$/.test(nextEnd) && nextStart !== nextEnd) {
      update.mutate({ quietStart: nextStart, quietEnd: nextEnd });
    }
  };

  return (
    <Panel>
      <PanelTitle>Qué te avisamos por Telegram y WhatsApp</PanelTitle>
      <p className="mb-4 flex gap-2 rounded-lg bg-alert/[0.07] px-3 py-2.5 text-sm">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-alert" aria-hidden="true" />
        Las alertas críticas (calor sin riego, calor sostenido, error del sensor, galpón sin conexión) te llegan siempre.
      </p>
      <div className="divide-y">
        <PreferenceRow
          id="pref-warnings"
          label="Advertencias"
          hint="Riego prolongado y frío sostenido."
          checked={prefs.includeWarnings}
          onChange={(checked) => update.mutate({ includeWarnings: checked })}
        />
        <PreferenceRow
          id="pref-summary"
          label="Resumen diario a las 18:00"
          hint="Temperaturas, riegos y alertas del día. En Telegram llega con el reporte en PDF."
          checked={prefs.dailySummary}
          onChange={(checked) => update.mutate({ dailySummary: checked })}
        />
        <div className="py-3">
          <PreferenceRow
            id="pref-quiet"
            label="Horario de silencio"
            hint="En ese horario solo te llegan las alertas críticas."
            checked={quietOn}
            onChange={(checked) => {
              setQuietOn(checked);
              if (checked) saveQuiet(start, end);
              else update.mutate({ quietStart: null, quietEnd: null });
            }}
            flush
          />
          {quietOn && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <FormField id="quiet-start" label="Desde">
                <Input
                  id="quiet-start"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  onBlur={() => saveQuiet(start, end)}
                  className="h-11 w-32 tabular"
                />
              </FormField>
              <FormField id="quiet-end" label="Hasta">
                <Input
                  id="quiet-end"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  onBlur={() => saveQuiet(start, end)}
                  className="h-11 w-32 tabular"
                />
              </FormField>
              <p className="pb-3 text-xs text-muted-foreground">Hora de Guatemala</p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function PreferenceRow({
  id,
  label,
  hint,
  checked,
  onChange,
  flush,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  flush?: boolean;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', !flush && 'py-3')}>
      <div className="min-w-0">
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        <p id={`${id}-hint`} className="mt-0.5 text-sm text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-hint`} className="mt-1" />
    </div>
  );
}

/** Closes the dialog with a toast as soon as the chat shows up as linked. */
function useLinkedWatcher(type: ChannelType, settings: NotificationSettings, onClose: () => void) {
  const current = linkKey(settings.channels.find((c) => c.type === type));
  const initial = useRef(current);
  useEffect(() => {
    if (current !== initial.current && current !== 'none') {
      toast.success(`${CHANNEL_META[type].name} vinculado`, { description: 'Envía una prueba para comprobarlo.' });
      onClose();
    }
  }, [current, type, onClose]);
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary tabular">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5 text-sm">{children}</div>
    </li>
  );
}

function WaitingNote() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Esperando confirmación… esta ventana se cierra sola.
    </p>
  );
}

function TelegramLinkDialog({ onClose, settings }: { onClose: () => void; settings: NotificationSettings }) {
  const { mutate, data: link } = useTelegramLink();
  useLinkedWatcher('telegram', settings, onClose);
  useEffect(() => mutate(), [mutate]);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular Telegram</DialogTitle>
          <DialogDescription>Necesitas Telegram instalado en tu celular o computadora.</DialogDescription>
        </DialogHeader>
        {!link ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : (
          <div className="space-y-5">
            <ol className="space-y-4">
              <Step n={1}>
                <p>Abre el bot <b>@{link.botUsername}</b>:</p>
                <Button asChild className="mt-2">
                  <a href={link.url} target="_blank" rel="noreferrer">
                    <Send aria-hidden="true" /> Abrir Telegram <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </Button>
              </Step>
              <Step n={2}>
                <p>
                  Toca <b>Iniciar</b> (o <b>Start</b>). Si no aparece, envíale este mensaje:
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="rounded-md bg-muted px-2.5 py-1.5 font-mono text-sm">/start {link.code}</code>
                  <CopyButton value={`/start ${link.code}`} />
                </div>
              </Step>
            </ol>
            <p className="text-xs text-muted-foreground">El código vence a las {formatDateTime(link.expiresAt)}.</p>
            <WaitingNote />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WhatsAppLinkDialog({ onClose, settings }: { onClose: () => void; settings: NotificationSettings }) {
  const create = useWhatsAppLink();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<WhatsAppLink | null>(null);
  useLinkedWatcher('whatsapp', settings, onClose);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    create.mutate(phone, {
      onSuccess: setLink,
      onError: (err) => setError(err instanceof ApiError ? err.message : 'No se pudo generar el código'),
    });
  }

  const number = settings.providers.whatsapp.number ?? '';
  const waUrl = (text: string) => `https://wa.me/${number.replace('+', '')}?text=${encodeURIComponent(text)}`;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular WhatsApp</DialogTitle>
          <DialogDescription>Las alertas llegarán desde el número {number}.</DialogDescription>
        </DialogHeader>
        {!link ? (
          <form onSubmit={submit} className="space-y-5" noValidate>
            <FormField id="wa-phone" label="Tu número de WhatsApp" hint="8 dígitos si es de Guatemala, o con código de país (+1…)." error={error}>
              <Input
                id="wa-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="5555 1234"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'wa-phone-error' : 'wa-phone-hint'}
                className="h-11"
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending || phone.trim() === ''}>
                {create.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Continuar
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-5">
            <ol className="space-y-4">
              {link.sandboxJoinCode && (
                <Step n={1}>
                  <p>
                    Solo la primera vez: envía <b>{link.sandboxJoinCode}</b> al {link.number}.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm" className="h-9">
                      <a href={waUrl(link.sandboxJoinCode)} target="_blank" rel="noreferrer">
                        Abrir WhatsApp <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    </Button>
                    <CopyButton value={link.sandboxJoinCode} />
                  </div>
                </Step>
              )}
              <Step n={link.sandboxJoinCode ? 2 : 1}>
                <p>Desde el {link.phone}, envía este mensaje al {link.number}:</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="rounded-md bg-muted px-2.5 py-1.5 font-mono text-sm">{link.message}</code>
                  <CopyButton value={link.message} />
                </div>
                <Button asChild className="mt-3">
                  <a href={link.url} target="_blank" rel="noreferrer">
                    <MessageCircle aria-hidden="true" /> Enviar por WhatsApp <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </Button>
              </Step>
            </ol>
            <p className="text-xs text-muted-foreground">
              El código vence a las {formatDateTime(link.expiresAt)}. ¿Número equivocado?{' '}
              <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => setLink(null)}>
                Cambiarlo
              </button>
            </p>
            <WaitingNote />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
