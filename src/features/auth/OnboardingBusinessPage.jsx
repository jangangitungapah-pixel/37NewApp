import { useState } from 'react';
import { Building2, Check, Copy, LogOut } from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import { createInitialBusinessUseCase } from '../../application/use-cases/sessionUseCases.js';
import { mapFirebaseError } from '../../data/firebase/errorMapper.js';
import { ThemeToggle } from '../../components/navigation/ThemeToggle.jsx';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';

/**
 * Shown when Firebase Auth succeeds, but no `businesses/{id}/members/{uid}` exists yet.
 * Operators waiting for Owner invitation should sign out; studio Owners can bootstrap a business.
 */
export function OnboardingBusinessPage() {
  const { authUser, isOnline, logout, refreshMembership } = useAuthSession();
  const [businessName, setBusinessName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copiedUid, setCopiedUid] = useState(false);

  async function handleCopyUid() {
    if (!authUser?.uid || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(authUser.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    } catch {
      // Clipboard blocked on insecure contexts
    }
  }

  async function handleCreateBusiness(event) {
    event.preventDefault();
    setErrorMessage('');
    if (!isOnline) {
      setErrorMessage('Operasi pembuatan bisnis membutuhkan koneksi internet aktif.');
      return;
    }

    setSubmitting(true);
    try {
      await createInitialBusinessUseCase({ user: authUser, businessName });
      refreshMembership();
    } catch (error) {
      const mapped = mapFirebaseError(error);
      setErrorMessage(mapped.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="panel auth-card" style={{ display: 'grid', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
          <div className="badge badge-info" style={{ width: 'fit-content' }}>
            <Building2 size={14} aria-hidden="true" />
            <span>Keanggotaan Bisnis Belum Ditemukan</span>
          </div>
          <ThemeToggle mode="compact" />
        </div>
        <h1 style={{ margin: 0, fontSize: '22px' }}>Belum Terhubung ke Studio</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
          Akun <code className="mono">{authUser?.email}</code> belum terdaftar pada dokumen{' '}
          <code className="mono">businesses/&#123;id&#125;/members</code>. Jika Anda Operator, minta Owner mendaftarkan UID Anda terlebih dahulu.
        </p>

        <div className="alert" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <strong>UID Anda:</strong> <code className="mono">{authUser?.uid}</code>
          </div>
          <button type="button" className="btn btn-sm" onClick={handleCopyUid}>
            {copiedUid ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            <span>{copiedUid ? 'Tersalin' : 'Salin UID'}</span>
          </button>
        </div>

        <StatusAlert variant="danger" title="Gagal Membuat Bisnis" message={errorMessage} />

        <form onSubmit={handleCreateBusiness} style={{ display: 'grid', gap: '12px' }}>
          <div className="field">
            <label className="field-label" htmlFor="onboarding-business-name">
              Atau Buat Bisnis Baru sebagai Owner
            </label>
            <input
              id="onboarding-business-name"
              type="text"
              className="field-input"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Nama Studio Musik Anda"
              required
              disabled={submitting}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting || !isOnline}>
            {submitting ? 'Membuat Bisnis...' : 'Buat Bisnis & Masuk Owner Portal'}
          </button>
        </form>

        <button type="button" className="btn" onClick={logout} disabled={submitting}>
          <LogOut size={16} aria-hidden="true" />
          <span>Keluar & Bersihkan Sesi</span>
        </button>
      </section>
    </main>
  );
}
