import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, MoreHorizontal, Pencil, Plus, Power, PowerOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataFreshness } from '@/components/data-freshness';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { SecretDialog } from '@/components/secret-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys, useDevices } from '@/features/monitoring/queries';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { formatTemp } from '@/lib/format';
import type { Device } from '@/lib/types';

type Editing = { mode: 'create' } | { mode: 'edit'; device: Device } | null;
type Pending = { kind: 'rotate' | 'toggle'; device: Device } | null;

export function DevicesPage() {
  const queryClient = useQueryClient();
  const devices = useDevices();
  const [editing, setEditing] = useState<Editing>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [secret, setSecret] = useState<{ name: string; apiKey: string; created: boolean } | null>(null);

  const rotate = useMutation({
    mutationFn: (device: Device) => api<{ apiKey: string }>(`/devices/${device.id}/rotate-key`, { method: 'POST' }),
    onSuccess: (result, device) => setSecret({ name: device.name, apiKey: result.apiKey, created: false }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar la key'),
  });

  const toggle = useMutation({
    mutationFn: (device: Device) => api<Device>(`/devices/${device.id}`, { method: 'PATCH', body: { active: !device.active } }),
    onSuccess: (device) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.devices });
      toast.success(device.active ? `${device.name} activado` : `${device.name} desactivado`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar'),
  });

  return (
    <>
      <PageHeader
        title="Dispositivos"
        description="Cada galpón tiene un ESP32 con su propia API key."
        actions={
          <Button onClick={() => setEditing({ mode: 'create' })}>
            <Plus aria-hidden="true" /> Registrar galpón
          </Button>
        }
      />

      {devices.isPending ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : devices.isError ? (
        <p className="text-sm text-destructive">No se pudieron cargar los dispositivos.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {devices.data.map((device) => (
            <li key={device.id} className={`rounded-xl border bg-card p-5 ${device.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-display text-xl font-semibold tracking-tight">
                    {device.name}
                    {!device.active && <Badge variant="outline">Inactivo</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">{device.shed}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-10" aria-label={`Acciones para ${device.name}`}>
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing({ mode: 'edit', device })}>
                      <Pencil aria-hidden="true" /> Editar nombre
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setPending({ kind: 'rotate', device })}>
                      <KeyRound aria-hidden="true" /> Generar nueva API key
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant={device.active ? 'destructive' : 'default'}
                      onSelect={() => setPending({ kind: 'toggle', device })}
                    >
                      {device.active ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
                      {device.active ? 'Desactivar' : 'Activar'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Última lectura</dt>
                  <dd className="mt-0.5 font-medium tabular">
                    {device.lastReading ? `${formatTemp(device.lastReading.temperature)} °C` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Conexión</dt>
                  <dd className="mt-0.5">
                    <DataFreshness at={device.lastSeenAt ? Date.parse(device.lastSeenAt) : null} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Umbrales</dt>
                  <dd className="mt-0.5 tabular">
                    {device.settings.tempMin} / {device.settings.tempMax} / {device.settings.tempAlert} °C
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Registrado</dt>
                  <dd className="mt-0.5 tabular">{formatDateTime(device.createdAt)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <DeviceFormDialog
          editing={editing}
          onClose={() => setEditing(null)}
          onCreated={(name, apiKey) => setSecret({ name, apiKey, created: true })}
        />
      )}
      <ConfirmDialog
        open={pending?.kind === 'rotate'}
        onOpenChange={(open) => !open && setPending(null)}
        title={`¿Generar una nueva API key para ${pending?.device.name}?`}
        description="La key actual dejará de funcionar de inmediato: el ESP32 no podrá enviar datos hasta que actualices su secrets.h con la nueva."
        confirmLabel="Generar nueva key"
        destructive
        onConfirm={() => pending && rotate.mutate(pending.device)}
      />
      <ConfirmDialog
        open={pending?.kind === 'toggle'}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.device.active ? `¿Desactivar ${pending.device.name}?` : `¿Activar ${pending?.device.name}?`}
        description={
          pending?.device.active
            ? 'Dejará de aceptar datos de su ESP32 y no aparecerá en el monitoreo. Su historial se conserva.'
            : 'Volverá a aceptar datos de su ESP32 y a mostrarse en el monitoreo.'
        }
        confirmLabel={pending?.device.active ? 'Desactivar' : 'Activar'}
        destructive={pending?.device.active}
        onConfirm={() => pending && toggle.mutate(pending.device)}
      />
      <SecretDialog
        open={secret !== null}
        onClose={() => setSecret(null)}
        title={secret?.created ? `${secret.name} registrado` : 'Nueva API key generada'}
        description={
          <>
            Pega esta key en el archivo <code className="font-mono">secrets.h</code> del ESP32 de{' '}
            <strong>{secret?.name}</strong>:
          </>
        }
        secret={secret?.apiKey ?? null}
      >
        <pre className="overflow-x-auto rounded-lg bg-muted/60 p-3 font-mono text-xs">{`#define API_KEY "${secret?.apiKey ?? ''}"`}</pre>
      </SecretDialog>
    </>
  );
}

function DeviceFormDialog({
  editing,
  onClose,
  onCreated,
}: {
  editing: NonNullable<Editing>;
  onClose: () => void;
  onCreated: (name: string, apiKey: string) => void;
}) {
  const queryClient = useQueryClient();
  const initial = editing.mode === 'edit' ? editing.device : null;
  const [name, setName] = useState(initial?.name ?? '');
  const [shed, setShed] = useState(initial?.shed ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (): Promise<Device | { device: Device; apiKey: string }> =>
      editing.mode === 'create'
        ? api<{ device: Device; apiKey: string }>('/devices', { method: 'POST', body: { name: name.trim(), shed: shed.trim() } })
        : api<Device>(`/devices/${editing.device.id}`, { method: 'PATCH', body: { name: name.trim(), shed: shed.trim() } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.devices });
      onClose();
      if ('apiKey' in result) onCreated(result.device.name, result.apiKey);
      else toast.success('Cambios guardados');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No se pudo guardar.'),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError('Escribe un nombre (por ejemplo "Galpón 2").');
    if (!shed.trim()) return setError('Indica el galpón donde estará instalado.');
    mutation.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing.mode === 'create' ? 'Registrar galpón' : `Editar ${initial?.name}`}</DialogTitle>
          <DialogDescription>
            {editing.mode === 'create'
              ? 'Al guardar se genera la API key para su ESP32. Los umbrales inician en 27 / 30 / 32 °C.'
              : 'Cambia cómo se muestra este galpón en el dashboard.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField id="device-name" label="Nombre">
            <Input id="device-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Galpón 2" className="h-11" />
          </FormField>
          <FormField id="device-shed" label="Ubicación" hint="Galpón o área donde está instalado el sensor.">
            <Input id="device-shed" value={shed} onChange={(e) => setShed(e.target.value)} placeholder="Galpón 2 · lado norte" className="h-11" />
          </FormField>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {editing.mode === 'create' ? 'Registrar' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
