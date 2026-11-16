import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { cn } from '../../lib/utils/cn.js';

export function RadioGroupControl({
  value,
  defaultValue,
  onValueChange,
  options = [],
  orientation = 'vertical',
  disabled = false,
  name,
  className,
  'aria-label': ariaLabel,
}) {
  return (
    <RadioGroup
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
      name={name}
      aria-label={ariaLabel}
      className={cn(
        'flex gap-2.5',
        orientation === 'horizontal' ? 'flex-row flex-wrap' : 'flex-col',
        className
      )}
    >
      {options.map((option) => (
        <label
          key={String(option.value)}
          className={cn(
            'inline-flex items-start gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-muted/40',
            (disabled || option.disabled) && 'cursor-not-allowed opacity-50'
          )}
        >
          <Radio.Root
            value={option.value}
            disabled={option.disabled}
            className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[checked]:border-primary"
          >
            <Radio.Indicator className="size-2 rounded-full bg-primary" />
          </Radio.Root>
          <span className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{option.label}</span>
            {option.description && (
              <span className="text-xs text-muted-foreground">{option.description}</span>
            )}
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
