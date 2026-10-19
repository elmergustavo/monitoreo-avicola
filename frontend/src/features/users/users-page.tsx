import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, MoreHorizontal, Pencil, Plus, UserCheck, UserX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { SecretDialog } from '@/components/secret-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/features/auth/auth-context';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { initials } from '@/lib/initials';
import type { Role, User } from '@/lib/types';

const usersKey = ['users'] as const;
const rolesKey = ['roles'] as const;

type Editing = { mode: 'create' } | { mode: 'edit'; user: User } | null;
type Pending = { kind: 'toggle' | 'reset'; user: User } | null;

export function UsersPage() {
  const { can, user: me } = useAuth();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: usersKey, queryFn: () => api<User[]>('/users') });
  const roles = useQuery({ queryKey: rolesKey, queryFn: () => api<Role[]>('/roles') });
  const [editing, setEditing] = useState<Editing>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [secret, setSecret] = useState<{ email: string; password: string; created: boolean } | null>(null);
  const canManage = can('users.manage');

  const toggleActive = useMutation({
    mutationFn: (user: User) => api<User>(`/users/${user.id}`, { method: 'PATCH', body: { active: !user.active } }),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: usersKey });
      toast.success(user.active ? `${user.name} fue reactivado` : `${user.name} fue desactivado`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar'),
  });

  const resetPassword = useMutation({
    mutationFn: (user: User) => api<{ temporaryPassword: string }>(`/users/${user.id}/reset-password`, { method: 'POST' }),
    onSuccess: (result, user) => {
      void queryClient.invalidateQueries({ queryKey: usersKey });
      setSecret({ email: user.email, password: result.temporaryPassword, created: false });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo restablecer'),
  });

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Quién puede entrar al sistema y con qué rol."
        actions={
          canManage && (
            <Button onClick={() => setEditing({ mode: 'create' })}>
              <Plus aria-hidden="true" /> Nuevo usuario
            </Button>
          )
        }
      />

      {users.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : users.isError ? (
        <p className="text-sm text-destructive">No se pudo cargar la lista de usuarios.</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último acceso</TableHead>
                  {canManage && <TableHead className="w-12 pr-5"><span className="sr-only">Acciones</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.map((user) => (
                  <TableRow key={user.id} className={user.active ? undefined : 'opacity-60'}>
                    <TableCell className="pl-5">
                      <UserIdentity user={user} isMe={user.id === me?.id} />
                    </TableCell>
                    <TableCell>{user.role.name}</TableCell>
                    <TableCell>
                      <UserStatus user={user} />
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular">{formatDateTime(user.lastLoginAt)}</TableCell>
                    {canManage && (
                      <TableCell className="pr-5">
                        <UserActions
                          user={user}
                          isMe={user.id === me?.id}
                          onEdit={() => setEditing({ mode: 'edit', user })}
                          onReset={() => setPending({ kind: 'reset', user })}
                          onToggle={() => setPending({ kind: 'toggle', user })}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {users.data.map((user) => (
              <li key={user.id} className={`rounded-xl border bg-card p-4 ${user.active ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <UserIdentity user={user} isMe={user.id === me?.id} />
                  {canManage && (
                    <UserActions
                      user={user}
                      isMe={user.id === me?.id}
                      onEdit={() => setEditing({ mode: 'edit', user })}
                      onReset={() => setPending({ kind: 'reset', user })}
                      onToggle={() => setPending({ kind: 'toggle', user })}
                    />
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary">{user.role.name}</Badge>
                  <UserStatus user={user} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Último acceso: {formatDateTime(user.lastLoginAt)}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {editing && (
        <UserFormDialog
          editing={editing}
          roles={roles.data ?? []}
          isMe={editing.mode === 'edit' && editing.user.id === me?.id}
          onClose={() => setEditing(null)}
          onCreated={(email, password) => setSecret({ email, password, created: true })}
        />
      )}

      <ConfirmDialog
        open={pending?.kind === 'toggle'}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.user.active ? `¿Desactivar a ${pending.user.name}?` : `¿Reactivar a ${pending?.user.name}?`}
        description={
          pending?.user.active
            ? 'Su sesión se cerrará en todos sus dispositivos y no podrá volver a entrar hasta que lo reactives.'
            : 'Podrá volver a iniciar sesión con su contraseña actual.'
        }
        confirmLabel={pending?.user.active ? 'Desactivar' : 'Reactivar'}
        destructive={pending?.user.active}
        onConfirm={() => pending && toggleActive.mutate(pending.user)}
      />
      <ConfirmDialog
        open={pending?.kind === 'reset'}
        onOpenChange={(open) => !open && setPending(null)}
        title={`¿Restablecer la contraseña de ${pending?.user.name}?`}
        description="Se generará una contraseña temporal, se cerrarán sus sesiones y deberá crear una nueva al entrar."
        confirmLabel="Restablecer"
        onConfirm={() => pending && resetPassword.mutate(pending.user)}
      />
      <SecretDialog
        open={secret !== null}
        onClose={() => setSecret(null)}
        title={secret?.created ? 'Usuario creado' : 'Contraseña restablecida'}
        description={
          <>
            Comparte esta contraseña temporal con <strong>{secret?.email}</strong>. Al entrar se le pedirá crear una propia.
          </>
        }
        secret={secret?.password ?? null}
      />
    </>
  );
}

function UserIdentity({ user, isMe }: { user: User; isMe: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-9">
        <AvatarFallback className="bg-secondary text-xs font-semibold">{initials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium">
          {user.name} {isMe && <span className="text-xs font-normal text-muted-foreground">(tú)</span>}
        </p>
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
      </div>
    </div>
  );
}

function UserStatus({ user }: { user: User }) {
  if (!user.active) return <Badge variant="outline">Inactivo</Badge>;
  if (user.mustChangePassword) {
    return (
      <Badge variant="outline" className="border-warm/40 text-warm">
        Contraseña temporal
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-optimal/40 text-optimal">
      Activo
    </Badge>
  );
}

function UserActions({
  user,
  isMe,
  onEdit,
  onReset,
  onToggle,
}: {
  user: User;
  isMe: boolean;
  onEdit: () => void;
  onReset: () => void;
  onToggle: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10" aria-label={`Acciones para ${user.name}`}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil aria-hidden="true" /> Editar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onReset}>
          <KeyRound aria-hidden="true" /> Restablecer contraseña
        </DropdownMenuItem>
        {!isMe && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onToggle} variant={user.active ? 'destructive' : 'default'}>
              {user.active ? <UserX aria-hidden="true" /> : <UserCheck aria-hidden="true" />}
              {user.active ? 'Desactivar' : 'Reactivar'}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserFormDialog({
  editing,
  roles,
  isMe,
  onClose,
  onCreated,
}: {
  editing: NonNullable<Editing>;
  roles: Role[];
  isMe: boolean;
  onClose: () => void;
  onCreated: (email: string, password: string) => void;
}) {
  const queryClient = useQueryClient();
  const initial = editing.mode === 'edit' ? editing.user : null;
  const [name, setName] = useState(initial?.name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [roleId, setRoleId] = useState(initial?.role.id ?? roles.find((r) => r.key === 'viewer')?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (): Promise<User | { user: User; temporaryPassword: string }> =>
      editing.mode === 'create'
        ? api<{ user: User; temporaryPassword: string }>('/users', { method: 'POST', body: { name, email, roleId } })
        : api<User>(`/users/${editing.user.id}`, {
            method: 'PATCH',
            body: { name, ...(isMe ? {} : { roleId }) },
          }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: usersKey });
      void queryClient.invalidateQueries({ queryKey: rolesKey });
      onClose();
      if ('temporaryPassword' in result) onCreated(result.user.email, result.temporaryPassword);
      else toast.success('Cambios guardados');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No se pudo guardar.'),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError('Escribe el nombre completo.');
    if (editing.mode === 'create' && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Escribe un correo válido.');
    if (!roleId) return setError('Elige un rol.');
    mutation.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing.mode === 'create' ? 'Nuevo usuario' : `Editar a ${initial?.name}`}</DialogTitle>
          <DialogDescription>
            {editing.mode === 'create'
              ? 'Se generará una contraseña temporal que deberá cambiar en su primer ingreso.'
              : 'El correo no se puede cambiar.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField id="user-name" label="Nombre completo">
            <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className="h-11" />
          </FormField>
          <FormField id="user-email" label="Correo electrónico">
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={editing.mode === 'edit'}
              autoComplete="off"
              className="h-11"
            />
          </FormField>
          <FormField id="user-role" label="Rol" hint={isMe ? 'No puedes cambiar tu propio rol.' : undefined}>
            <Select value={roleId} onValueChange={setRoleId} disabled={isMe}>
              <SelectTrigger id="user-role" className="h-11 w-full">
                <SelectValue placeholder="Elige un rol" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {roleId && (
            <p className="text-xs text-muted-foreground">{roles.find((r) => r.id === roleId)?.description}</p>
          )}
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
              {editing.mode === 'create' ? 'Crear usuario' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
