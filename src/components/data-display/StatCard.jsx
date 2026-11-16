import { cn } from '../../lib/utils/cn.js';
import { Card } from '../ui/Card.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';

const TREND_CLASSES = {
  up: 'text-success',
  down: 'text-destructive',
  neutral: 'text-muted-foreground',
};

export function StatCard({
  title,
  value,
  delta,
  trend = 'neutral',
  hint,
  icon,
  loading = false,
  className,
}) {
  return (
    <Card className={cn('p-4.5 flex flex-col gap-2.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
          {title}
        </span>
        {icon && (
          <span className="flex size-8 items-center justify-center rounded-xl border border-border bg-muted/50 text-primary">
            {icon}
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-8 w-2/3" />
      ) : (
        <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
          {value}
        </div>
      )}

      {(delta || hint) && (
        <div className="flex items-center justify-between gap-2 text-xs">
          {delta ? (
            <span className={cn('font-semibold', TREND_CLASSES[trend] || TREND_CLASSES.neutral)}>
              {delta}
            </span>
          ) : (
            <span />
          )}
          {hint && <span className="text-muted-foreground truncate">{hint}</span>}
        </div>
      )}
    </Card>
  );
}
