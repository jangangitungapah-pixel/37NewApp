import { Progress } from '@base-ui/react/progress';
import { cn } from '../../lib/utils/cn.js';

export function ProgressBar({
  value = 0,
  max = 100,
  label,
  showValue = true,
  className,
  indicatorClassName,
}) {
  const safeValue = value === null ? null : Math.min(Math.max(Number(value) || 0, 0), max);

  return (
    <Progress.Root value={safeValue} max={max} className={cn('flex flex-col gap-1.5 w-full', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs">
          {label ? <Progress.Label className="font-medium text-foreground">{label}</Progress.Label> : <span />}
          {showValue && safeValue !== null && (
            <Progress.Value className="font-mono text-muted-foreground" />
          )}
        </div>
      )}
      <Progress.Track className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <Progress.Indicator
          className={cn(
            'h-full rounded-full bg-primary transition-all duration-300 ease-out',
            indicatorClassName
          )}
        />
      </Progress.Track>
    </Progress.Root>
  );
}
