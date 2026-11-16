import { AlertDialog } from '@base-ui/react/alert-dialog';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils/cn.js';
import { Button } from '../ui/Button.jsx';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  variant = 'danger',
  loading = false,
  onConfirm,
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs transition-opacity duration-150" />
        <AlertDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <AlertDialog.Popup className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl outline-none">
            <div className="flex items-start gap-3.5">
              <div
                className={cn(
                  'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border',
                  variant === 'danger'
                    ? 'border-destructive/30 bg-destructive/12 text-destructive'
                    : 'border-primary/30 bg-accent text-accent-foreground'
                )}
              >
                <AlertTriangle className="size-4.5" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <AlertDialog.Title className="text-base font-semibold text-foreground">
                  {title}
                </AlertDialog.Title>
                {description && (
                  <AlertDialog.Description className="text-sm text-muted-foreground">
                    {description}
                  </AlertDialog.Description>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <AlertDialog.Close
                render={
                  <Button variant="outline" size="sm" disabled={loading}>
                    {cancelLabel}
                  </Button>
                }
              />
              <Button
                variant={variant === 'danger' ? 'danger' : 'primary'}
                size="sm"
                loading={loading}
                onClick={() => onConfirm?.()}
              >
                {confirmLabel}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
