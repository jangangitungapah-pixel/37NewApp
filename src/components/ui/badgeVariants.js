import { cva } from 'class-variance-authority';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-tight whitespace-nowrap transition-colors',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-secondary text-secondary-foreground',
        primary: 'border-primary/30 bg-accent text-accent-foreground',
        secondary: 'border-border bg-muted text-muted-foreground',
        success: 'border-success/30 bg-success/12 text-success',
        warning: 'border-warning/35 bg-warning/14 text-warning',
        danger: 'border-destructive/30 bg-destructive/12 text-destructive',
        info: 'border-info/30 bg-info/12 text-info',
        outline: 'border-border bg-transparent text-foreground',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);
