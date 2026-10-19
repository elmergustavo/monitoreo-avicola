import { useLiveStatus } from '@/features/monitoring/live-context';
import { cn } from '@/lib/utils';

const LABEL = {
  open: 'En vivo',
  connecting: 'Conectando…',
  reconnecting: 'Reconectando…',
  off: 'Sin conexión',
} as const;

/** Connection state of the real-time channel. */
export function LiveIndicator() {
  const { status } = useLiveStatus();
  const live = status === 'open';
  return (
    <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
      <span className="relative flex size-2.5" aria-hidden="true">
        {live && <span className="absolute inline-flex size-full rounded-full bg-optimal opacity-60 motion-safe:animate-ping" />}
        <span className={cn('relative inline-flex size-2.5 rounded-full', live ? 'bg-optimal' : 'bg-warm')} />
      </span>
      <span className="font-medium">{LABEL[status]}</span>
    </div>
  );
}
