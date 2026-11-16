import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils/cn.js';

const SIZE_CLASSES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Composable Base UI Dialog modal primitive with full Light/Dark token contrast,
 * Esc-to-close, backdrop dismissal, and accessible Title/Description bindings.
 */
export function DialogModal({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  closeLabel = 'Tutup dialog',
  children,
  footer,
  className,
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs transition-opacity duration-150" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <Dialog.Popup
            className={cn(
              'w-full rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl outline-none',
              SIZE_CLASSES[size] || SIZE_CLASSES.md,
              className
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                {title && (
                  <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">
                    {title}
                  </Dialog.Title>
                )}
                {description && (
                  <Dialog.Description className="text-sm text-muted-foreground">
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

            {children && <div className="mt-4">{children}</div>}
            {footer && <div className="mt-5 flex items-center justify-end gap-2.5">{footer}</div>}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
