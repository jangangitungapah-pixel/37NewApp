import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils/cn.js';

/**
 * Accessible dual-theme select primitive built on @base-ui/react/select.
 */
export function SelectField({
  value,
  defaultValue,
  onValueChange,
  options = [],
  placeholder = 'Pilih opsi...',
  disabled = false,
  className,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) {
  const labelMap = new Map(options.map((opt) => [String(opt.value), opt.label]));

  return (
    <Select.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          'inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3.5 text-sm text-foreground shadow-2xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
          className
        )}
      >
        <Select.Value placeholder={placeholder}>
          {(selected) =>
            selected !== null && selected !== undefined && labelMap.has(String(selected))
              ? labelMap.get(String(selected))
              : selected ?? placeholder
          }
        </Select.Value>
        <Select.Icon className="text-muted-foreground shrink-0">
          <ChevronDown className="size-4" aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-50">
          <Select.Popup className="min-w-48 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none">
            <Select.List className="flex flex-col gap-0.5">
              {options.map((option) => (
                <Select.Item
                  key={String(option.value)}
                  value={option.value}
                  disabled={option.disabled}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm text-popover-foreground outline-none select-none data-[highlighted]:bg-muted data-[selected]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="text-primary">
                    <Check className="size-4" aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
