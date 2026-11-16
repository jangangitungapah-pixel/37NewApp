import { cloneElement, isValidElement, useId } from 'react';
import { cn } from '../../lib/utils/cn.js';
import { Label } from '../ui/Label.jsx';

/**
 * Accessible form field layout wrapper compatible with React Hook Form + Zod.
 */
export function FormField({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  children,
  className,
}) {
  const generatedId = useId();
  const fieldId = htmlFor || generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  const enhancedChild = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id || fieldId,
        'aria-invalid': error ? true : children.props['aria-invalid'],
        'aria-describedby': describedBy || children.props['aria-describedby'],
      })
    : children;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <Label htmlFor={fieldId} required={required}>
          {label}
        </Label>
      )}
      {enhancedChild}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
