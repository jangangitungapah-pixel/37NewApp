import { AlertCircle, CheckCircle2, WifiOff } from 'lucide-react';

/**
 * Displays inline feedback banner (danger | warning | success).
 * Uses both icon and text so meaning never depends solely on color.
 */
export function StatusAlert({ variant = 'warning', title, message }) {
  if (!message) {
    return null;
  }
  const Icon = variant === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div className={`alert alert-${variant}`} role={variant === 'danger' ? 'alert' : 'status'}>
      <Icon size={18} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
      <div style={{ display: 'grid', gap: '2px' }}>
        {title && <strong>{title}</strong>}
        <span>{message}</span>
      </div>
    </div>
  );
}

/**
 * Explicit banner shown when browser is offline or Firestore reads come from stale cache.
 */
export function ConnectionBanner({ isOnline, fromCache }) {
  if (isOnline && !fromCache) {
    return null;
  }

  return (
    <div className="alert alert-warning" role="status" style={{ marginBottom: '16px' }}>
      <WifiOff size={18} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
      <div>
        <strong>{!isOnline ? 'Offline Mode:' : 'Cache Stale:'}</strong>{' '}
        {!isOnline
          ? 'Koneksi internet terputus. Data yang tampil berasal dari cache lokal dan operasi transaksi kritis ditahan sampai koneksi pulih.'
          : 'Menampilkan salinan cache sementara sambil menunggu sinkronisasi server Firestore.'}
      </div>
    </div>
  );
}

/**
 * Stable loading skeleton matching portal layout dimensions.
 */
export function SessionLoadingSkeleton({ label = 'Memverifikasi sesi & keanggotaan Firestore...' }) {
  return (
    <main className="auth-page" aria-busy="true" aria-live="polite">
      <section className="panel auth-card" style={{ display: 'grid', gap: '16px' }}>
        <div className="skeleton" style={{ height: '24px', width: '48%' }} />
        <div className="skeleton" style={{ height: '16px', width: '85%' }} />
        <div className="skeleton" style={{ height: '84px', width: '100%' }} />
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>{label}</p>
      </section>
    </main>
  );
}
