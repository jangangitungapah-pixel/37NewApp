import { cn } from '../../lib/utils/cn.js';

export function Label({ className, required = false, children, ...props }) {
  return (
    <label
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground',
        className
      )}
      {...props}
    >
      <span>{children}</span>
      {required && (
        <span className="text-destructive" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}
