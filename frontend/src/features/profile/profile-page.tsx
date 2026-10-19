import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Panel, PanelTitle } from '@/components/panel';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { PasswordForm } from '@/features/auth/password-form';
import { NotificationSettingsSection } from '@/features/notifications/notification-settings';
import { formatDateTime } from '@/lib/dates';
import { PERMISSION_INFO, PERMISSION_ORDER } from '@/lib/permissions';

export function ProfilePage() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <>
      <PageHeader
        title="Mi perfil"
        actions={
          <Button variant="outline" onClick={() => void logout()}>
            <LogOut aria-hidden="true" /> Cerrar sesión
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle>Cuenta</PanelTitle>
          <dl className="space-y-4 text-sm">
            <Row label="Nombre" value={user.name} />
            <Row label="Correo" value={user.email} />
            <Row label="Rol" value={user.role.name} />
            <Row label="Último inicio de sesión" value={formatDateTime(user.lastLoginAt)} />
          </dl>
          <p className="mt-6 mb-2 text-sm text-muted-foreground">Lo que puedes hacer</p>
          <ul className="flex flex-wrap gap-1.5">
            {PERMISSION_ORDER.filter((p) => user.permissions.includes(p)).map((p) => (
              <li key={p}>
                <Badge variant="outline" className="font-normal">
                  {PERMISSION_INFO[p].label}
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelTitle>Cambiar contraseña</PanelTitle>
          <p className="mb-5 text-sm text-muted-foreground">Se cerrará tu sesión en los demás dispositivos.</p>
          <PasswordForm submitLabel="Cambiar contraseña" onDone={() => void toast.success('Contraseña actualizada')} />
        </Panel>
      </div>
      <section aria-labelledby="notifications-title" className="mt-10">
        <h2 id="notifications-title" className="font-display text-xl font-semibold tracking-tight">
          Notificaciones
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">Recibe las alertas de los galpones en tu celular.</p>
        <NotificationSettingsSection />
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium break-all sm:text-right">{value}</dd>
    </div>
  );
}
