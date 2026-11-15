import { Wrench } from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';

export function ConfigErrorScreen() {
  const { missingEnvKeys } = useAuthSession();

  return (
    <main className="auth-page">
      <section className="panel auth-card" style={{ display: 'grid', gap: '16px' }}>
        <div className="badge badge-warning" style={{ width: 'fit-content' }}>
          <Wrench size={14} aria-hidden="true" />
          <span>Konfigurasi Environment Belum Lengkap</span>
        </div>
        <h1 style={{ margin: 0, fontSize: '22px' }}>Setup `.env.local` Diperlukan</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
          Aplikasi tidak memakai credential hardcoded di source code. Salin <code className="mono">.env.example</code> menjadi{' '}
          <code className="mono">.env.local</code> dan isi konfigurasi Web App Firebase Anda.
        </p>
        {missingEnvKeys.length > 0 && (
          <div className="alert alert-danger">
            <div>
              <strong>Variabel yang belum terisi:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                {missingEnvKeys.map((key) => (
                  <li key={key} className="mono">
                    {key}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
