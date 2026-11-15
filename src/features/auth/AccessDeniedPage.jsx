import { LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';

export function AccessDeniedPage() {
  const { authUser, member, error, logout, refreshMembership } = useAuthSession();

  const statusText = member?.status
    ? `Status keanggotaan Anda saat ini: "${member.status}". Hanya anggota berstatus "active" yang dapat mengakses portal.`
    : error?.message || 'Anda tidak memiliki izin keanggotaan aktif untuk mengakses bisnis ini.';

  return (
    <main className="auth-page">
      <section className="panel auth-card" style={{ display: 'grid', gap: '16px' }}>
        <div className="badge badge-danger" style={{ width: 'fit-content' }}>
          <ShieldAlert size={14} aria-hidden="true" />
          <span>Access Denied</span>
        </div>
        <h1 style={{ margin: 0, fontSize: '22px' }}>Akses Portal Ditolak</h1>
        <StatusAlert variant="danger" title="Penegakan Keamanan & Keanggotaan" message={statusText} />

        {authUser && (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'grid', gap: '4px' }}>
            <div>
              <strong>Email:</strong> {authUser.email}
            </div>
            <div>
              <strong>UID:</strong> <code className="mono">{authUser.uid}</code>
            </div>
            {member?.businessId && (
              <div>
                <strong>Business ID:</strong> <code className="mono">{member.businessId}</code>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={refreshMembership}>
            <RefreshCw size={16} aria-hidden="true" />
            <span>Cek Ulang Akses</span>
          </button>
          <button type="button" className="btn btn-danger" onClick={logout}>
            <LogOut size={16} aria-hidden="true" />
            <span>Keluar & Tutup Listener</span>
          </button>
        </div>
      </section>
    </main>
  );
}
