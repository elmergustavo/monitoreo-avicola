import { useEffect, useState } from 'react';
import { formatAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Data older than this is flagged as stale (the ESP32 reports every 30 s). */
const STALE_AFTER_MS = 90_000;

export function LiveIndicator({ lastUpdate }: { lastUpdate: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const stale = lastUpdate === null || now - lastUpdate > STALE_AFTER_MS;

  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="relative flex size-2.5" aria-hidden="true">
        {!stale && (
          <span className="absolute inline-flex size-full rounded-full bg-optimal opacity-60 motion-safe:animate-ping" />
        )}
        <span className={cn('relative inline-flex size-2.5 rounded-full', stale ? 'bg-warm' : 'bg-optimal')} />
      </span>
      <span className="font-medium">{stale ? 'Sin datos recientes' : 'En vivo'}</span>
      {lastUpdate !== null && (
        <span className="hidden font-mono text-xs text-muted-foreground tabular sm:inline">
          {formatAgo(lastUpdate, now)}
        </span>
      )}
    </div>
  );
}
