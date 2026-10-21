import { KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { CompanyLogo } from '@/components/company-logo';
import { Button } from '@/components/ui/button';
import { useAuth } from './auth-context';
import { PasswordForm } from './password-form';

/** Shown right after logging in with a temporary password. */
export function ChangePasswordPage() {
  const { user, reloadUser, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <CompanyLogo className="size-11 rounded-xl" />
        <span className="mt-6 flex size-11 items-center justify-center rounded-xl bg-warm/15 text-warm">
          <KeyRound className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">Crea tu contraseña</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Hola {user?.name.split(' ')[0]}. Entraste con una contraseña temporal; elige una propia para continuar.
        </p>
        <div className="mt-8">
          <PasswordForm
            submitLabel="Guardar y continuar"
            onDone={async () => {
              await reloadUser();
              toast.success('Contraseña actualizada');
              navigate('/', { replace: true });
            }}
          />
        </div>
        <Button variant="link" className="mt-4 px-0 text-muted-foreground" onClick={() => void logout()}>
          Salir
        </Button>
      </div>
    </main>
  );
}
