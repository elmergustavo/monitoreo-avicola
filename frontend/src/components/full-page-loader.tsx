import { BrandMark } from './brand-mark';

export function FullPageLoader({ message }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center" role="status" aria-live="polite">
      <BrandMark className="size-10 text-primary motion-safe:animate-pulse" />
      <p className={message ? 'text-sm text-muted-foreground' : 'sr-only'}>{message ?? 'Cargando'}</p>
    </div>
  );
}
