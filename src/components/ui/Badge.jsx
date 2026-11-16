import { cn } from '../../lib/utils/cn.js';
import { badgeVariants } from './badgeVariants.js';

export function Badge({ className, variant, children, ...props }) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}
