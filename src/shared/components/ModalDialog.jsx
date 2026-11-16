import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Accessible overlay dialog rendered above Sticky/Drawer chrome with Esc-to-close,
 * background scroll lock, unique heading ID, and focus restoration on close.
 */
export function ModalDialog({ open, title, description, onClose, children }) {
  const titleId = useId();
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-panel" style={{ display: 'grid', gap: '16px' }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h2 id={titleId} style={{ margin: 0, fontSize: '18px' }}>
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Tutup dialog">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
