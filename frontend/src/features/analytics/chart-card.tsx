import { ChartNoAxesColumn, Lightbulb } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ChartCardProps {
  title: string;
  description?: ReactNode;
  /** One sentence that says what the chart shows, in plain words. */
  insight?: ReactNode;
  actions?: ReactNode;
  isPending: boolean;
  isError: boolean;
  /** True while new filters load over the previous data. */
  isRefreshing?: boolean;
  isEmpty?: boolean;
  emptyText?: string;
  /** Reserved height so the page does not jump while loading. */
  minHeight?: string;
  className?: string;
  children: ReactNode;
}

export function ChartCard({
  title,
  description,
  insight,
  actions,
  isPending,
  isError,
  isRefreshing,
  isEmpty,
  emptyText = 'No hay datos en este periodo.',
  minHeight = 'min-h-80',
  className,
  children,
}: ChartCardProps) {
  return (
    <section className={cn('flex h-full flex-col rounded-xl border bg-card p-5 sm:p-6', className)} aria-busy={isPending || isRefreshing}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>

      <div className={cn('relative flex flex-1 flex-col', minHeight)}>
        {isPending ? (
          <Skeleton className="flex-1 rounded-lg" />
        ) : isError ? (
          <p className="m-auto text-sm text-destructive">No se pudo cargar esta gráfica.</p>
        ) : isEmpty ? (
          <p className="m-auto flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
            <ChartNoAxesColumn className="size-6" aria-hidden="true" />
            {emptyText}
          </p>
        ) : (
          <div className={cn('flex flex-1 flex-col transition-opacity duration-200', isRefreshing && 'opacity-50')}>{children}</div>
        )}
      </div>

      {insight && !isPending && !isError && !isEmpty && (
        <p className="mt-4 flex gap-2 border-t pt-4 text-sm">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-warm" aria-hidden="true" />
          <span>{insight}</span>
        </p>
      )}
    </section>
  );
}
