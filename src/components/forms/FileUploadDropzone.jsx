import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { cn } from '../../lib/utils/cn.js';

/**
 * Accessible file drag-and-drop input foundation.
 * Upload transport (e.g. existing Cloudinary gallery service) remains handled by the calling feature.
 */
export function FileUploadDropzone({
  id,
  accept = 'image/*',
  multiple = false,
  maxSizeBytes = 10 * 1024 * 1024,
  disabled = false,
  onFilesSelected,
  onValidationError,
  title = 'Tarik & lepas file di sini, atau klik untuk memilih',
  hint = 'Mendukung gambar hingga 10 MB',
  className,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const oversized = files.find((file) => maxSizeBytes && file.size > maxSizeBytes);
    if (oversized) {
      const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(1);
      onValidationError?.(`Ukuran "${oversized.name}" melebihi batas maksimum ${maxMb} MB.`);
      return;
    }

    onFilesSelected?.(multiple ? files : [files[0]]);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) {
          handleFiles(event.dataTransfer?.files);
        }
      }}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/35 px-5 py-7 text-center transition-colors cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        dragging && 'border-primary bg-accent/50',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-2xs">
        <UploadCloud className="size-5" aria-hidden="true" />
      </div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
