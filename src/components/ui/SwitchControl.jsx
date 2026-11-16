import { Switch } from '@base-ui/react/switch';
import { cn } from '../../lib/utils/cn.js';

export function SwitchControl({
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
    <div className={cn('flex items-center justify-between gap-3', className)}>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
              {label}
            </label>
          )}
          {description && <span className="text-xs text-muted-foreground">{description}</span>}
        </div>
      )}
      <Switch.Root
        id={id}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)}
        className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[checked]:border-primary data-[checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Switch.Thumb className="block size-4.5 rounded-full bg-card shadow-xs transition-transform duration-150 translate-x-0 data-[checked]:translate-x-5" />
      </Switch.Root>
    </div>
  );
}
