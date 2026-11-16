import { useMemo } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '../../lib/utils/cn.js';

/**
 * Searchable single-select Combobox backed by @base-ui/react/combobox.
 * Accepts options in `{ value, label, disabled? }` shape and exposes scalar `value` via `onValueChange`.
 */
export function ComboboxField({
  id,
  options = [],
  value,
  onValueChange,
  placeholder = 'Cari atau pilih...',
  emptyText = 'Tidak ada opsi cocok.',
  disabled = false,
  className,
  'aria-label': ariaLabel,
}) {
  const selectedItem = useMemo(
    () => options.find((item) => item.value === value) ?? null,
    [options, value]
  );

  return (
    <Combobox.Root
      items={options}
      value={selectedItem}
      onValueChange={(nextItem) => onValueChange?.(nextItem ? nextItem.value : null)}
      disabled={disabled}
      isItemEqualToValue={(item, current) => item?.value === current?.value}
    >
      <div
        className={cn(
          'flex h-10 w-full items-center rounded-xl border border-input bg-background px-3 shadow-2xs focus-within:ring-2 focus-within:ring-ring focus-within:border-ring',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
      >
        <Combobox.Input
          id={id}
          aria-label={ariaLabel}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
        {selectedItem && !disabled && (
          <Combobox.Clear
            aria-label="Bersihkan pilihan"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="size-3.5" aria-hidden="true" />
          </Combobox.Clear>
        )}
        <Combobox.Trigger
          aria-label="Buka daftar pilihan"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ChevronDown className="size-4" aria-hidden="true" />
        </Combobox.Trigger>
      </div>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} align="start" className="z-50">
          <Combobox.Popup className="min-w-56 max-h-68 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl outline-none">
            <Combobox.Empty className="py-6 text-center text-xs text-muted-foreground">
              {emptyText}
            </Combobox.Empty>
            <Combobox.List className="flex flex-col gap-0.5">
              {(item) => (
                <Combobox.Item
                  key={String(item.value)}
                  value={item}
                  disabled={item.disabled}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm text-popover-foreground outline-none select-none data-[highlighted]:bg-muted data-[selected]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
                >
                  <span>{item.label}</span>
                  <Combobox.ItemIndicator className="text-primary">
                    <Check className="size-4" aria-hidden="true" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
