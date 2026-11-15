import { useState } from 'react';
import { Disc3, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import {
  registerOwnerWorkspaceUseCase,
  signInUseCase,
} from '../../application/use-cases/sessionUseCases.js';
import { mapFirebaseError } from '../../data/firebase/errorMapper.js';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';

export function LoginPage() {
  const { isOnline, appConfig, refreshMembership } = useAuthSession();
  const [mode, setMode] = useState('login'); // 'login' | 'register_owner'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    if (!isOnline) {
      setErrorMessage('Koneksi internet sedang terputus. Autentikasi membutuhkan koneksi aktif.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signInUseCase({ email, password });
      } else {
        await registerOwnerWorkspaceUseCase({
          email,
          password,
          displayName,
          businessName,
        });
        refreshMembership();
      }
    } catch (error) {
      const mapped = mapFirebaseError(error);
      setErrorMessage(mapped.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="panel auth-card" style={{ display: 'grid', gap: '18px' }}>
        <header style={{ display: 'grid', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span className="badge badge-warning">
              <Disc3 size={14} aria-hidden="true" />
              <span>37MusicStudio</span>
            </span>
            <span className="badge mono" style={{ fontSize: '11px' }}>
              {appConfig.firebase.projectId} ({appConfig.firebase.databaseId})
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: '24px', lineHeight: 1.2 }}>
            {mode === 'login' ? 'Masuk ke Portal Studio' : 'Setup Bisnis Owner Baru'}
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
            {mode === 'login'
              ? 'Autentikasi via Firebase Auth; akses Owner atau Operator ditentukan dari membership Firestore.'
              : 'Buat akun Owner pertama beserta workspace bisnis baru di Firestore secara atomik.'}
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }} role="tablist" aria-label="Mode autentikasi">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`btn ${mode === 'login' ? 'btn-primary' : ''}`}
            onClick={() => {
              setMode('login');
              setErrorMessage('');
            }}
            disabled={submitting}
          >
            <LogIn size={16} aria-hidden="true" />
            <span>Masuk</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register_owner'}
            className={`btn ${mode === 'register_owner' ? 'btn-primary' : ''}`}
            onClick={() => {
              setMode('register_owner');
              setErrorMessage('');
            }}
            disabled={submitting}
          >
            <UserPlus size={16} aria-hidden="true" />
            <span>Owner Baru</span>
          </button>
        </div>

        <StatusAlert variant="danger" title="Autentikasi Gagal" message={errorMessage} />

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }} noValidate>
          {mode === 'register_owner' && (
            <>
              <div className="field">
                <label className="field-label" htmlFor="owner-display-name">
                  Nama Lengkap Owner
                </label>
                <input
                  id="owner-display-name"
                  type="text"
                  className="field-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Contoh: Hazel Marsic"
                  autoComplete="name"
                  required
                  disabled={submitting}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="owner-business-name">
                  Nama Studio / Bisnis
                </label>
                <input
                  id="owner-business-name"
                  type="text"
                  className="field-input"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Contoh: 37 Music Studio"
                  required
                  disabled={submitting}
                />
              </div>
            </>
          )}

          <div className="field">
            <label className="field-label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@studio.com"
              autoComplete="email"
              required
              disabled={submitting}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="auth-password">
              Kata Sandi
            </label>
            <input
              id="auth-password"
              type="password"
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              disabled={submitting}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={submitting || !isOnline}>
            {submitting
              ? 'Memproses sesi...'
              : mode === 'login'
                ? 'Masuk & Verifikasi Membership'
                : 'Buat Akun Owner & Bisnis'}
          </button>
        </form>

        <footer style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
          <ShieldCheck size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span>Role dan izin studio divalidasi oleh Firestore Security Rules (deny-by-default).</span>
        </footer>
      </section>
    </main>
  );
}
