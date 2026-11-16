import { Toaster } from 'sonner';
import { useTheme } from '../../app/providers/themeContext.js';

export function AppToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      theme={resolvedTheme}
      position="bottom-right"
      richColors
      closeButton
      visibleToasts={4}
      toastOptions={{
        classNames: {
          toast:
            'rounded-xl border border-border bg-popover text-popover-foreground shadow-lg font-sans',
          title: 'text-sm font-semibold text-foreground',
          description: 'text-xs text-muted-foreground',
          actionButton:
            'rounded-lg bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-1',
          cancelButton:
            'rounded-lg bg-secondary text-secondary-foreground text-xs font-medium px-2.5 py-1',
          closeButton: 'border border-border bg-card text-muted-foreground hover:text-foreground',
        },
      }}
    />
  );
}
