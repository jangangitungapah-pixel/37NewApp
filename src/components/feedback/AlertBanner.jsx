import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/utils/cn.js';

const VARIANT_CONFIG = {
  info: {
    icon: Info,
    boxClass: 'border-info/30 bg-info/10 text-foreground',
    iconClass: 'text-info',
  },
  success: {
    icon: CheckCircle2,
    boxClass: 'border-success/30 bg-success/10 text-foreground',
    iconClass: 'text-success',
  },
  warning: {
    icon: TriangleAlert,
    boxClass: 'border-warning/35 bg-warning/12 text-foreground',
    iconClass: 'text-warning',
  },
  danger: {
    icon: AlertCircle,
    boxClass: 'border-destructive/30 bg-destructive/10 text-foreground',
    iconClass: 'text-destructive',
  },
};

export function AlertBanner({
  variant = 'info',
  title,
  description,
  action,
  role = 'status',
  className,
  children,
}) {
  const cfg = VARIANT_CONFIG[variant] || VARIANT_CONFIG.info;
  const IconComponent = cfg.icon;

  return (
    <div
      role={variant === 'danger' ? 'alert' : role}
      className={cn(
        'flex items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm',
        cfg.boxClass,
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <IconComponent className={cn('mt-0.5 size-4 shrink-0', cfg.iconClass)} aria-hidden="true" />
        <div className="space-y-0.5">
          {title && <div className="font-semibold text-foreground">{title}</div>}
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
          {children}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
