import { cn } from '@/lib/utils';

/** Radio group shown as pill buttons (wraps on narrow screens). */
export function ChoiceChips<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: T;
  options: Array<{ key: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.key}
            className={cn(
              'relative inline-flex h-10 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors',
              'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
              value === option.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card hover:border-foreground/25 hover:bg-muted/60',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.key}
              checked={value === option.key}
              onChange={() => onChange(option.key)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
