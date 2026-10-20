import { BellRing, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ApiError } from '@/lib/api';
import type { AlertRules, Device } from '@/lib/types';
import { useUpdateAlertRules } from './queries';

type RuleKey = Exclude<keyof AlertRules, 'irrigationSensor'>;

interface RuleField {
  key: RuleKey;
  label: string;
  hint: (device: Device, minutes: number) => string;
  max: number;
}

/** Same limits as the API (UpdateAlertRulesDto). */
const SECTIONS: { title: string; irrigation?: boolean; fields: RuleField[] }[] = [
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
    title: 'Riego',
    irrigation: true,
    fields: [
      {
        key: 'heatNoIrrigationMin',
        label: 'Calor sin riego',
        hint: (d, m) => `Si pasa ${m} min en ${d.settings.tempAlert} °C o más y el riego no se enciende.`,
        max: 120,
      },
      {
        key: 'prolongedIrrigationMin',
        label: 'Riego prolongado',
        hint: (_, m) => `Si el riego queda encendido más de ${m} min seguidos.`,
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
const IRRIGATION_KEYS = new Set<RuleKey>(SECTIONS.filter((s) => s.irrigation).flatMap((s) => s.fields.map((f) => f.key)));

const toStrings = (rules: AlertRules) =>
  Object.fromEntries(FIELDS.map((f) => [f.key, String(rules[f.key])])) as Record<RuleKey, string>;

function fieldError(field: RuleField, raw: string): string | null {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(value)) return 'Escribe minutos enteros.';
  if (value < 1 || value > field.max) return `Entre 1 y ${field.max} min.`;
  return null;
}

export function AlertRulesDialog({ device }: { device: Device }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() => toStrings(device.alertRules));
  const [irrigationSensor, setIrrigationSensor] = useState(device.alertRules.irrigationSensor);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const mutation = useUpdateAlertRules(device.id);

  // Irrigation timings are ignored while the shed has no detector, so they cannot block saving.
  const skipped = (key: RuleKey) => !irrigationSensor && IRRIGATION_KEYS.has(key);
  const errors = Object.fromEntries(
    FIELDS.map((f) => [f.key, skipped(f.key) ? null : fieldError(f, values[f.key])]),
  ) as Record<RuleKey, string | null>;
  const hasErrors = Object.values(errors).some(Boolean);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (hasErrors) return;
    const minutes = Object.fromEntries(
      FIELDS.map((f) => [f.key, skipped(f.key) ? device.alertRules[f.key] : Number(values[f.key])]),
    ) as Record<RuleKey, number>;
    const rules: AlertRules = { ...minutes, irrigationSensor };
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
          setIrrigationSensor(device.alertRules.irrigationSensor);
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
              {section.irrigation && (
                <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="rule-irrigationSensor">Tiene detector de riego</Label>
                    <p id="rule-irrigationSensor-help" className="text-xs text-muted-foreground">
                      {irrigationSensor
                        ? 'El ESP32 avisa cuándo se enciende el riego.'
                        : 'Sin detector, estas dos alertas quedan apagadas para no dar falsas alarmas.'}
                    </p>
                  </div>
                  <Switch
                    id="rule-irrigationSensor"
                    checked={irrigationSensor}
                    onCheckedChange={setIrrigationSensor}
                    aria-describedby="rule-irrigationSensor-help"
                    className="mt-0.5"
                  />
                </div>
              )}
              {section.fields.map((field) => {
                const disabled = skipped(field.key);
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
                          disabled={disabled}
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
