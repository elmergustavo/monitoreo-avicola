import { CompanyLogo } from './company-logo';

export function FullPageLoader({ message }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center" role="status" aria-live="polite">
      <CompanyLogo className="size-16 rounded-2xl motion-safe:animate-pulse" decorative />
      <p className={message ? 'text-sm text-muted-foreground' : 'sr-only'}>{message ?? 'Cargando'}</p>
    </div>
  );
}
