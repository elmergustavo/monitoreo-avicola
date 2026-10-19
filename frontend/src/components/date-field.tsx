import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} className="h-11" />
    </div>
  );
}
