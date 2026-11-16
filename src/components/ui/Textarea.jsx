import { forwardRef } from 'react';
import { cn } from '../../lib/utils/cn.js';

export const Textarea = forwardRef(function Textarea(
  { className, rows = 3, invalid = false, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        'flex min-h-22 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-2xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-destructive focus-visible:ring-destructive',
        className
      )}
      {...props}
    />
  );
});
