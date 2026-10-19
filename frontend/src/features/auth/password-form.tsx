import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';

const MIN_LENGTH = 8;

/** Change-password form shared by the forced change screen and the profile page. */
export function PasswordForm({ submitLabel, onDone }: { submitLabel: string; onDone: () => void | Promise<void> }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found: typeof errors = {};
    if (next.length < MIN_LENGTH) found.next = `Usa al menos ${MIN_LENGTH} caracteres.`;
    else if (next === current) found.next = 'Debe ser distinta a la actual.';
    if (confirm !== next) found.confirm = 'Las contraseñas no coinciden.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await api('/auth/me/password', { method: 'PATCH', body: { currentPassword: current, newPassword: next } });
      setCurrent('');
      setNext('');
      setConfirm('');
      await onDone();
    } catch (err) {
      setErrors({ current: err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <FormField id="current-password" label="Contraseña actual" error={errors.current}>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          aria-invalid={errors.current ? true : undefined}
          className="h-11"
        />
      </FormField>
      <FormField id="new-password" label="Nueva contraseña" hint={`Mínimo ${MIN_LENGTH} caracteres.`} error={errors.next}>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-invalid={errors.next ? true : undefined}
          className="h-11"
        />
      </FormField>
      <FormField id="confirm-password" label="Repite la nueva contraseña" error={errors.confirm}>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={errors.confirm ? true : undefined}
          className="h-11"
        />
      </FormField>
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={submitting || !current || !next || !confirm}>
        {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>
    </form>
  );
}
