import { useInfiniteQuery } from '@tanstack/react-query';
import {
  BellOff,
  Cpu,
  Hand,
  FileDown,
  KeyRound,
  LogIn,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import type { AuditEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 40;

const FILTERS = [
  { value: 'all', label: 'Toda la actividad' },
  { value: 'auth.', label: 'Inicios de sesión' },
  { value: 'user.', label: 'Usuarios' },
  { value: 'role.', label: 'Roles' },
  { value: 'device.', label: 'Galpones' },
  { value: 'report.', label: 'Reportes' },
  { value: 'alert.', label: 'Alertas' },
] as const;

const meta = (entry: AuditEntry, key: string): string | undefined => {
  const value = entry.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
};

function describe(entry: AuditEntry): { icon: LucideIcon; text: string; alert?: boolean } {
  switch (entry.action) {
    case 'auth.login':
      return { icon: LogIn, text: 'Inició sesión' };
    case 'auth.login_failed':
      return { icon: ShieldAlert, text: `Intento fallido de inicio de sesión (${meta(entry, 'email') ?? 'correo desconocido'})`, alert: true };
    case 'auth.logout':
      return { icon: LogOut, text: 'Cerró sesión' };
    case 'auth.password_changed':
      return { icon: KeyRound, text: 'Cambió su contraseña' };
    case 'user.created':
      return { icon: UserPlus, text: `Creó al usuario ${meta(entry, 'email') ?? ''}` };
    case 'user.updated':
      return { icon: UserCog, text: 'Modificó un usuario' };
    case 'user.password_reset':
      return { icon: KeyRound, text: 'Restableció la contraseña de un usuario' };
    case 'role.created':
      return { icon: ShieldCheck, text: `Creó el rol ${meta(entry, 'name') ?? ''}` };
    case 'role.updated':
      return { icon: ShieldCheck, text: 'Modificó un rol' };
    case 'role.deleted':
      return { icon: ShieldCheck, text: `Eliminó el rol ${meta(entry, 'name') ?? ''}` };
    case 'device.created':
      return { icon: Cpu, text: `Registró el galpón ${meta(entry, 'name') ?? ''}` };
    case 'device.updated':
      return { icon: Cpu, text: 'Modificó un galpón' };
    case 'device.key_rotated':
      return { icon: KeyRound, text: 'Generó una nueva API key de un galpón', alert: true };
    case 'device.settings_updated':
      return { icon: SlidersHorizontal, text: 'Cambió los umbrales de temperatura' };
    case 'alert.acknowledged':
      return { icon: Hand, text: `Atendió la alerta ${meta(entry, 'device') ? `de ${meta(entry, 'device')}` : ''}`.trim() };
    case 'alert.resolved':
      return { icon: BellOff, text: `Cerró a mano una alerta ${meta(entry, 'device') ? `de ${meta(entry, 'device')}` : ''}`.trim() };
    case 'device.alert_rules_updated':
      return { icon: SlidersHorizontal, text: 'Cambió los tiempos de alerta de un galpón' };
    case 'report.exported': {
      const format = meta(entry, 'format') === 'xlsx' ? 'Excel' : 'PDF';
      const from = meta(entry, 'from');
      const to = meta(entry, 'to');
      const period = from && to ? (from === to ? ` del ${from}` : ` del ${from} al ${to}`) : '';
      return { icon: FileDown, text: `Descargó un reporte en ${format}${period}` };
    }
    default:
      return { icon: ShieldCheck, text: entry.action };
  }
}

export function AuditPage() {
  const [filter, setFilter] = useState<string>('all');
  const query = useInfiniteQuery({
    queryKey: ['audit', filter],
    queryFn: ({ pageParam }) =>
      api<AuditEntry[]>('/audit-logs', {
        query: { limit: PAGE_SIZE, before: pageParam, action: filter === 'all' ? undefined : filter },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last.at(-1)?.createdAt : undefined),
  });
  const entries = query.data?.pages.flat() ?? [];

  return (
    <>
      <PageHeader
        title="Bitácora"
        description="Historial de inicios de sesión y cambios hechos en el sistema."
        actions={
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-10 w-52" aria-label="Filtrar actividad">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {query.isPending ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : query.isError ? (
        <p className="text-sm text-destructive">No se pudo cargar la bitácora.</p>
      ) : entries.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Sin actividad registrada.</p>
      ) : (
        <ol className="divide-y rounded-xl border bg-card">
          {entries.map((entry) => {
            const { icon: Icon, text, alert } = describe(entry);
            return (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <span
                  className={cn(
                    'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md',
                    alert ? 'bg-warm/15 text-warm' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{entry.user?.name ?? 'Sistema'}</span> · {text}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <time dateTime={entry.createdAt} className="tabular">
                      {formatDateTime(entry.createdAt)}
                    </time>
                    {entry.ip && <span className="font-mono"> · {entry.ip}</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
          </Button>
        </div>
      )}
    </>
  );
}
