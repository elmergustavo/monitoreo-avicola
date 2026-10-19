import { ShieldOff } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export function NoAccess() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <ShieldOff className="size-6" aria-hidden="true" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">Sin acceso</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tu rol no tiene permiso para ver esta sección. Si lo necesitas, pídeselo a un administrador.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/">Volver al inicio</Link>
      </Button>
    </div>
  );
}
