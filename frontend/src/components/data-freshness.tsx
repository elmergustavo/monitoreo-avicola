import { useEffect, useState } from 'react';
import { formatAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The ESP32 reports every 30 s; older data is flagged. */
const STALE_AFTER_MS = 2 * 60_000;

export function DataFreshness({ at, className }: { at: number | null; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  if (at === null) return <span className={cn('text-muted-foreground', className)}>Sin lecturas</span>;
  const stale = now - at > STALE_AFTER_MS;
  return (
    <span className={cn('inline-flex items-center gap-1.5', stale ? 'text-warm' : 'text-muted-foreground', className)}>
      <span className={cn('size-1.5 rounded-full', stale ? 'bg-warm' : 'bg-optimal')} aria-hidden="true" />
      {stale ? 'Desconectado · ' : ''}
      <span className="tabular">{formatAgo(at, now)}</span>
    </span>
  );
}
