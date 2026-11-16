import { cn } from '../../lib/utils/cn.js';

const VARIANT_CLASSES = {
  default: 'bg-card text-card-foreground border border-border shadow-xs',
  elevated: 'bg-card text-card-foreground border border-border shadow-md',
  glass:
    'bg-card/80 backdrop-blur-md text-card-foreground border border-border/80 shadow-sm',
  subtle: 'bg-muted/50 text-card-foreground border border-border/80',
};

export function Card({ className, variant = 'default', ...props }) {
  return (
    <div
      className={cn('rounded-2xl transition-colors', VARIANT_CLASSES[variant] || VARIANT_CLASSES.default, className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1.5 p-5 pb-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return (
    <h3
      className={cn('text-base font-semibold tracking-tight text-foreground', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-2', className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return (
    <div
      className={cn('flex items-center justify-between gap-3 border-t border-border/70 px-5 py-3.5', className)}
      {...props}
    />
  );
}
