import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils/cn.js';
import { buttonVariants } from './buttonVariants.js';

export const Button = forwardRef(function Button(
  {
    className,
    variant,
    size,
    loading = false,
    disabled = false,
    type = 'button',
    children,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
});
