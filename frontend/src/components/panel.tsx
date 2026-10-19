import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Plain surface used for every dashboard block. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('h-full rounded-xl border bg-card p-5 sm:p-6', className)}>{children}</section>;
}

export function PanelTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[13px] font-medium tracking-wide text-muted-foreground uppercase">{children}</h2>
      {aside}
    </div>
  );
}
