import { Checkbox } from '@base-ui/react/checkbox';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils/cn.js';

export function CheckboxControl({
  id,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled = false,
  label,
  description,
  className,
  'aria-label': ariaLabel,
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex items-start gap-2.5 cursor-pointer select-none',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <Checkbox.Root
        id={id}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={ariaLabel}
        className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-md border border-border-strong bg-background text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[checked]:border-primary data-[checked]:bg-primary"
      >
        <Checkbox.Indicator className="flex items-center justify-center">
          <Check className="size-3.5 stroke-[2.5]" aria-hidden="true" />
        </Checkbox.Indicator>
      </Checkbox.Root>
      {(label || description) && (
        <span className="flex flex-col">
          {label && <span className="text-sm font-medium text-foreground">{label}</span>}
          {description && <span className="text-xs text-muted-foreground">{description}</span>}
        </span>
      )}
    </label>
  );
}
