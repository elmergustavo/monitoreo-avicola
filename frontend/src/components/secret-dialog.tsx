import { Check, Copy, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Shows a secret (temporary password, API key) once, with a copy button. */
export function SecretDialog({
  open,
  onClose,
  title,
  description,
  secret,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  secret: string | null;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked; the value is still selectable.
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/60 p-2 pl-3">
          <code className="min-w-0 flex-1 font-mono text-sm break-all select-all">{secret}</code>
          <Button type="button" variant="outline" size="sm" onClick={() => void copy()} aria-live="polite">
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
        <p className="flex items-start gap-2 text-sm text-warm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Solo se muestra esta vez. Guárdalo o compártelo de forma segura antes de cerrar.
        </p>
        {children}
        <DialogFooter>
          <Button onClick={onClose}>Listo, ya lo guardé</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
