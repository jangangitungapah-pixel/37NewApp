import { Inbox } from 'lucide-react';
import { cn } from '../../lib/utils/cn.js';

export function EmptyState({
  icon,
  title = 'Belum ada data',
  description,
  action,
  className,
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center',
        className
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground shadow-2xs">
        {icon || <Inbox className="size-5" aria-hidden="true" />}
      </div>
      <div className="max-w-sm space-y-1">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
