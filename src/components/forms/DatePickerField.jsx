import { useMemo, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { format, isValid, parseISO } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { cn } from '../../lib/utils/cn.js';

function normalizeDateValue(value) {
  if (!value) return undefined;
  if (value instanceof Date) {
    return isValid(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Date picker built on React Day Picker v10 + date-fns (`id` locale) + Base UI Popover.
 */
export function DatePickerField({
  id,
  value,
  onChange,
  placeholder = 'Pilih tanggal...',
  disabled = false,
  clearable = true,
  disabledDays,
  className,
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = useMemo(() => normalizeDateValue(value), [value]);

  const formattedLabel = selectedDate
    ? format(selectedDate, 'dd MMM yyyy', { locale: idLocale })
    : placeholder;

  const handleSelect = (nextDate) => {
    onChange?.(nextDate ?? null);
    if (nextDate) {
      setOpen(false);
    }
  };

  return (
    <div className={cn('relative flex items-center', className)}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={
            <button
              id={id}
              type="button"
              disabled={disabled}
              aria-label={ariaLabel}
              className={cn(
                'flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3.5 text-sm shadow-2xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
                selectedDate ? 'text-foreground' : 'text-muted-foreground',
                clearable && selectedDate && 'pr-9'
              )}
            >
              <span className="truncate">{formattedLabel}</span>
              <CalendarIcon className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
            </button>
          }
        />

        <Popover.Portal>
          <Popover.Positioner sideOffset={6} align="start" className="z-50">
            <Popover.Popup className="rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-xl outline-none">
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={handleSelect}
                locale={idLocale}
                disabled={disabledDays}
                showOutsideDays
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      {clearable && selectedDate && !disabled && (
        <button
          type="button"
          onClick={() => onChange?.(null)}
          aria-label="Hapus tanggal"
          className="absolute right-8 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
