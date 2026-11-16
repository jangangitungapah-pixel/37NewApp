import { Badge } from '../ui/Badge.jsx';

const STATUS_VARIANT_MAP = {
  active: 'success',
  settled: 'success',
  completed: 'success',
  paid: 'success',
  verified: 'success',
  confirmed: 'info',
  booked: 'info',
  pending: 'warning',
  dp: 'warning',
  unpaid: 'warning',
  suspended: 'warning',
  cancelled: 'danger',
  void: 'danger',
  rejected: 'danger',
  overdue: 'danger',
  error: 'danger',
  inactive: 'secondary',
  draft: 'neutral',
};

export function StatusBadge({ status, label, variant, className }) {
  const key = typeof status === 'string' ? status.trim().toLowerCase() : '';
  const resolvedVariant = variant || STATUS_VARIANT_MAP[key] || 'neutral';
  const displayLabel = label || (status ? String(status) : '—');

  return (
    <Badge variant={resolvedVariant} className={className}>
      {displayLabel}
    </Badge>
  );
}
