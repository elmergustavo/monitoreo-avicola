import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { PERMISSION_INFO, PERMISSION_ORDER } from '@/lib/permissions';
import type { Permission, Role } from '@/lib/types';

const rolesKey = ['roles'] as const;
const ADMIN_KEY = 'admin';

type Editing = { mode: 'create' } | { mode: 'edit'; role: Role } | null;

export function RolesPage() {
  const queryClient = useQueryClient();
  const roles = useQuery({ queryKey: rolesKey, queryFn: () => api<Role[]>('/roles') });
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const remove = useMutation({
    mutationFn: (role: Role) => api(`/roles/${role.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rolesKey });
      toast.success('Rol eliminado');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar'),
  });

  return (
    <>
      <PageHeader
        title="Roles y permisos"
        description="Cada usuario tiene un rol; el rol define qué puede ver y hacer."
        actions={
          <Button onClick={() => setEditing({ mode: 'create' })}>
            <Plus aria-hidden="true" /> Nuevo rol
          </Button>
        }
      />

      {roles.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : roles.isError ? (
        <p className="text-sm text-destructive">No se pudieron cargar los roles.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.data.map((role) => {
            const locked = role.key === ADMIN_KEY;
            return (
              <section key={role.id} className="flex flex-col rounded-xl border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
                      {role.name}
                      {role.isSystem && (
                        <Badge variant="secondary" className="font-sans text-[11px] font-medium">
                          Del sistema
                        </Badge>
                      )}
                    </h2>
                    {role.description && <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>}
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground" title="Usuarios con este rol">
                    <Users className="size-4" aria-hidden="true" />
                    <span className="tabular">{role.userCount}</span>
                    <span className="sr-only">usuarios</span>
                  </span>
                </div>

                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {PERMISSION_ORDER.filter((p) => role.permissions.includes(p)).map((permission) => (
                    <li key={permission}>
                      <Badge variant="outline" className="font-normal">
                        {PERMISSION_INFO[permission].label}
                      </Badge>
                    </li>
                  ))}
                  {role.permissions.length === 0 && <li className="text-sm text-muted-foreground">Sin permisos</li>}
                </ul>

                <div className="mt-auto flex gap-2 pt-5">
                  {locked ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Lock className="size-3.5" aria-hidden="true" /> Tiene todos los permisos y no se puede editar.
                    </p>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setEditing({ mode: 'edit', role })}>
                        <Pencil aria-hidden="true" /> Editar
                      </Button>
                      {!role.isSystem && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(role)}
                          disabled={role.userCount > 0}
                          title={role.userCount > 0 ? 'Cambia de rol a sus usuarios antes de eliminarlo' : undefined}
                        >
                          <Trash2 aria-hidden="true" /> Eliminar
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {editing && <RoleFormDialog editing={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`¿Eliminar el rol ${deleting?.name}?`}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}

function RoleFormDialog({ editing, onClose }: { editing: NonNullable<Editing>; onClose: () => void }) {
  const queryClient = useQueryClient();
  const initial = editing.mode === 'edit' ? editing.role : null;
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [permissions, setPermissions] = useState<Permission[]>(initial?.permissions ?? ['telemetry.read']);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || undefined, permissions };
      return editing.mode === 'create'
        ? api<Role>('/roles', { method: 'POST', body })
        : api<Role>(`/roles/${editing.role.id}`, { method: 'PATCH', body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rolesKey });
      toast.success(editing.mode === 'create' ? 'Rol creado' : 'Rol actualizado');
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No se pudo guardar.'),
  });

  const toggle = (permission: Permission, checked: boolean) =>
    setPermissions((current) => (checked ? [...current, permission] : current.filter((p) => p !== permission)));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError('Escribe un nombre para el rol.');
    mutation.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing.mode === 'create' ? 'Nuevo rol' : `Editar ${initial?.name}`}</DialogTitle>
          <DialogDescription>Los cambios aplican de inmediato a todos los usuarios con este rol.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField id="role-name" label="Nombre">
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </FormField>
          <FormField id="role-description" label="Descripción (opcional)">
            <Input id="role-description" value={description} onChange={(e) => setDescription(e.target.value)} className="h-11" />
          </FormField>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Permisos</legend>
            <div className="divide-y rounded-lg border">
              {PERMISSION_ORDER.map((permission) => {
                const id = `perm-${permission}`;
                return (
                  <label key={permission} htmlFor={id} className="flex cursor-pointer items-start gap-3 p-3 hover:bg-muted/50">
                    <Checkbox
                      id={id}
                      checked={permissions.includes(permission)}
                      onCheckedChange={(checked) => toggle(permission, checked === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-medium">{PERMISSION_INFO[permission].label}</span>
                      <span className="block text-xs text-muted-foreground">{PERMISSION_INFO[permission].description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

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
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
