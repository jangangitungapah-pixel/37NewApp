import { Tooltip } from '@base-ui/react/tooltip';
import { cn } from '../../lib/utils/cn.js';

export function TooltipHint({
  content,
  children,
  side = 'top',
  sideOffset = 6,
  className,
}) {
  if (!content) {
    return children;
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side={side} sideOffset={sideOffset} className="z-50">
          <Tooltip.Popup
            className={cn(
              'rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-md outline-none',
              className
            )}
          >
            {content}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
