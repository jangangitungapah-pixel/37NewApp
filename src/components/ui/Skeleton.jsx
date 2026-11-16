import { cn } from '../../lib/utils/cn.js';

export function Skeleton({ className, ...props }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-xl bg-muted/80', className)}
      {...props}
    />
  );
}
