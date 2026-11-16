import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 ease-out cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-sm hover:brightness-105 active:scale-[0.98]',
        secondary:
          'bg-secondary text-secondary-foreground border border-border hover:bg-accent/60 active:scale-[0.98]',
        outline:
          'border border-border bg-card text-foreground shadow-xs hover:bg-muted/70 active:scale-[0.98]',
        ghost: 'text-foreground hover:bg-muted/80 hover:text-foreground',
        danger:
          'bg-destructive text-destructive-foreground shadow-xs hover:brightness-105 active:scale-[0.98]',
        success:
          'bg-success text-success-foreground shadow-xs hover:brightness-105 active:scale-[0.98]',
      },
      size: {
        xs: 'h-7 rounded-lg px-2.5 text-xs',
        sm: 'h-8 rounded-lg px-3 text-xs',
        md: 'h-10 px-4 py-2 text-sm',
        lg: 'h-11 px-5 text-sm',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'md',
    },
  }
);
