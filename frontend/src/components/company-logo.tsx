import logoUrl from '@/assets/logo-granjas-la-sierra.webp';
import { cn } from '@/lib/utils';

/** Logo of Granjas M.R La Sierra, the company that runs the sheds. */
export function CompanyLogo({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  return (
    <img
      src={logoUrl}
      alt={decorative ? '' : 'Granjas M.R La Sierra'}
      width={384}
      height={384}
      decoding="async"
      className={cn('shrink-0 rounded-lg object-cover ring-1 ring-black/10', className)}
    />
  );
}
