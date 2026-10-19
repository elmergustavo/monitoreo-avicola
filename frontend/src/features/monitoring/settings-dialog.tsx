import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import type { Device, Settings } from '@/lib/types';
import { ThermalScale } from './components/thermal-scale';
import { queryKeys } from './queries';

export function SettingsDialog({ device }: { device: Device }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() => toStrings(device.settings));
  const [error, setError] = useState<string | null>(null);

  const parsed = { tempMin: Number(values.tempMin), tempMax: Number(values.tempMax), tempAlert: Number(values.tempAlert) };
  const valid =
    Object.values(parsed).every((v) => Number.isFinite(v)) && parsed.tempMin < parsed.tempMax && parsed.tempMax < parsed.tempAlert;

  const mutation = useMutation({
    mutationFn: (settings: Settings) => api<Device>(`/devices/${device.id}/settings`, { method: 'PATCH', body: settings }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Device[]>(queryKeys.devices, (old) => old?.map((d) => (d.id === updated.id ? updated : d)));
      void queryClient.invalidateQueries({ queryKey: queryKeys.summary(device.id) });
      toast.success('Umbrales actualizados');
      setOpen(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No se pudieron guardar los cambios.'),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!valid) {
      setError('Revisa los valores: mínima < máxima < alerta.');
      return;
    }
    mutation.mutate(parsed);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValues(toStrings(device.settings));
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontal aria-hidden="true" /> Umbrales
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Umbrales de {device.name}</DialogTitle>
          <DialogDescription>Definen cuándo la temperatura se muestra como óptima, calor o alerta.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ['tempMin', 'Mínima'],
                ['tempMax', 'Máxima'],
                ['tempAlert', 'Alerta'],
              ] as const
            ).map(([key, label]) => (
              <FormField key={key} id={key} label={`${label} (°C)`}>
                <Input
                  id={key}
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min={-40}
                  max={125}
                  value={values[key]}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  className="h-11 tabular"
                />
              </FormField>
            ))}
          </div>
          {valid && <ThermalScale value={parsed.tempMin + (parsed.tempMax - parsed.tempMin) / 2} settings={parsed} />}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
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

function toStrings(settings: Settings) {
  return { tempMin: String(settings.tempMin), tempMax: String(settings.tempMax), tempAlert: String(settings.tempAlert) };
}
