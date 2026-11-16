import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils/cn.js';

export function DrawerSheet({
  open,
  onOpenChange,
  title,
  description,
  side = 'right',
  closeLabel = 'Tutup panel',
  children,
  footer,
  className,
}) {
  const isLeft = side === 'left';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs transition-opacity" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex">
          <Dialog.Popup
            className={cn(
              'fixed top-0 bottom-0 z-50 flex w-full max-w-md flex-col border-border bg-card p-6 text-card-foreground shadow-2xl outline-none',
              isLeft ? 'left-0 border-r' : 'right-0 border-l',
              className
            )}
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
              <div className="space-y-1">
                {title && (
                  <Dialog.Title className="text-base font-semibold text-foreground">
                    {title}
                  </Dialog.Title>
                )}
                {description && (
                  <Dialog.Description className="text-xs text-muted-foreground">
                    {description}
                  </Dialog.Description>
                )}
              </div>
              <Dialog.Close
                aria-label={closeLabel}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto py-4">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
                {footer}
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
