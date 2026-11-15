import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Accessible overlay dialog rendered above Sticky/Drawer chrome with Esc-to-close.
 */
export function ModalDialog({ open, title, description, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-panel" style={{ display: 'grid', gap: '16px' }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h2 id="modal-dialog-title" style={{ margin: 0, fontSize: '18px' }}>
              {title}
            </h2>
            {description && (
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
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
