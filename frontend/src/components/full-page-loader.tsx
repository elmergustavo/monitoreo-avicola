import { BrandMark } from './brand-mark';

export function FullPageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Cargando">
      <BrandMark className="size-10 text-primary motion-safe:animate-pulse" />
    </div>
  );
}
