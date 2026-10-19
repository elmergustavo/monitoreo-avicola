import { BellRing, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import type { AlertRules, Device } from '@/lib/types';
import { useUpdateAlertRules } from './queries';

type RuleKey = keyof AlertRules;

interface RuleField {
  key: RuleKey;
  label: string;
  hint: (device: Device, minutes: number) => string;
  max: number;
}

/** Same limits as the API (UpdateAlertRulesDto). */
const SECTIONS: { title: string; fields: RuleField[] }[] = [
  {
    title: 'Cuándo se abre una alerta',
    fields: [
      {
        key: 'offlineAfterMin',
        label: 'Sin datos',
        hint: (_, m) => `"Galpón sin conexión" si el equipo pasa ${m} min sin reportar.`,
        max: 1440,
      },
      {
        key: 'sustainedHeatMin',
        label: 'Calor sostenido',
        hint: (d, m) => `Si pasa ${m} min seguidos en ${d.settings.tempAlert} °C o más.`,
        max: 240,
      },
      {
        key: 'sustainedColdMin',
        label: 'Frío sostenido',
        hint: (d, m) => `Si pasa ${m} min seguidos bajo ${d.settings.tempMin} °C.`,
        max: 720,
      },
    ],
  },
  {
    title: 'Si nadie la atiende',
    fields: [
      {
        key: 'reminderEveryMin',
        label: 'Recordar cada',
        hint: (_, m) => `Repite el aviso cada ${m} min, hasta 4 veces.`,
        max: 1440,
      },
      {
        key: 'escalateAfterMin',
        label: 'Escalar a los',
        hint: (_, m) => `Las alertas críticas avisan a los encargados a los ${m} min.`,
        max: 1440,
      },
    ],
  },
];

const FIELDS = SECTIONS.flatMap((s) => s.fields);

const toStrings = (rules: AlertRules) =>
  Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, String(v)])) as Record<RuleKey, string>;

function fieldError(field: RuleField, raw: string): string | null {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(value)) return 'Escribe minutos enteros.';
  if (value < 1 || value > field.max) return `Entre 1 y ${field.max} min.`;
  return null;
}

export function AlertRulesDialog({ device }: { device: Device }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() => toStrings(device.alertRules));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const mutation = useUpdateAlertRules(device.id);

  const errors = Object.fromEntries(FIELDS.map((f) => [f.key, fieldError(f, values[f.key])])) as Record<RuleKey, string | null>;
  const hasErrors = Object.values(errors).some(Boolean);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (hasErrors) return;
    const rules = Object.fromEntries(FIELDS.map((f) => [f.key, Number(values[f.key])])) as unknown as AlertRules;
    mutation.mutate(rules, {
      onSuccess: () => {
        toast.success('Tiempos de alerta actualizados', { description: device.name });
        setOpen(false);
      },
      onError: (err) => setServerError(err instanceof ApiError ? err.message : 'No se pudieron guardar los cambios.'),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValues(toStrings(device.alertRules));
          setSubmitted(false);
          setServerError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <BellRing aria-hidden="true" /> Tiempos de alerta
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tiempos de alerta · {device.name}</DialogTitle>
          <DialogDescription>Cuánto espera el sistema antes de avisar y cómo insiste. Todo en minutos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {SECTIONS.map((section) => (
            <fieldset key={section.title} className="space-y-3">
              <legend className="mb-3 text-[13px] font-medium tracking-wide text-muted-foreground uppercase">{section.title}</legend>
              {section.fields.map((field) => {
                const id = `rule-${field.key}`;
                const error = submitted ? errors[field.key] : null;
                const value = Number(values[field.key]);
                return (
                  <div key={field.key} className="grid gap-x-4 gap-y-1 sm:grid-cols-[9rem_1fr] sm:items-start">
                    <Label htmlFor={id} className="sm:pt-3">
                      {field.label}
                    </Label>
                    <div className="space-y-1">
                      <div className="relative w-36">
                        <Input
                          id={id}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={field.max}
                          step={1}
                          value={values[field.key]}
                          onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={`${id}-help`}
                          className="h-11 pr-12 tabular"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground" aria-hidden="true">
                          min
                        </span>
                      </div>
                      <p id={`${id}-help`} className={error ? 'text-sm text-destructive' : 'text-xs text-muted-foreground'}>
                        {error ?? (errors[field.key] ? `Entre 1 y ${field.max} min.` : field.hint(device, value))}
                      </p>
                    </div>
                  </div>
                );
              })}
            </fieldset>
          ))}
          {serverError && (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
