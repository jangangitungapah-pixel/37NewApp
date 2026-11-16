import { Popover } from '@base-ui/react/popover';
import { cn } from '../../lib/utils/cn.js';

export function PopoverMenu({
  open,
  onOpenChange,
  trigger,
  children,
  side = 'bottom',
  align = 'start',
  sideOffset = 8,
  className,
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
          <Popover.Popup
            className={cn(
              'rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-xl outline-none',
              className
            )}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
