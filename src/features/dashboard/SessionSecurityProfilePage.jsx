import { Shield } from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';

/**
 * Displays verified Firebase Auth + Firestore Membership boundary details for the signed-in user.
 */
export function SessionSecurityProfilePage() {
  const { authUser, userProfile, member, business, appConfig, activeListenerCount } = useAuthSession();

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <section className="panel" style={{ display: 'grid', gap: '8px' }}>
        <div className="badge badge-info" style={{ width: 'fit-content' }}>
          <Shield size={14} aria-hidden="true" />
          <span>Identity & Membership Contract</span>
        </div>
        <h1 style={{ margin: 0, fontSize: '22px' }}>Profil Akun & Batas Akses</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
          Profil global berada di <code className="mono">users/&#123;uid&#125;</code> tanpa izin bisnis; role dan akses studio selalu dievaluasi dari{' '}
          <code className="mono">businesses/&#123;businessId&#125;/members/&#123;uid&#125;</code>.
        </p>
      </section>

      <section className="grid-2">
        <article className="panel" style={{ display: 'grid', gap: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '16px' }}>Identitas Global (`users/{'{uid}'}`)</h2>
          <dl style={{ margin: 0, display: 'grid', gap: '8px', fontSize: '13px' }}>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Firebase UID</dt>
              <dd style={{ margin: '2px 0 0' }} className="mono">
                {authUser?.uid}
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Nama Tampilan</dt>
              <dd style={{ margin: '2px 0 0' }}>{userProfile?.displayName || authUser?.displayName || '-'}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Email</dt>
              <dd style={{ margin: '2px 0 0' }}>{userProfile?.email || authUser?.email}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Target Database</dt>
              <dd style={{ margin: '2px 0 0' }} className="mono">
                {appConfig.firebase.projectId} / {appConfig.firebase.databaseId} ({appConfig.appEnv})
              </dd>
            </div>
          </dl>
        </article>

        <article className="panel" style={{ display: 'grid', gap: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '16px' }}>Membership & Scope (`members/{'{uid}'}`)</h2>
          <dl style={{ margin: 0, display: 'grid', gap: '8px', fontSize: '13px' }}>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Business</dt>
              <dd style={{ margin: '2px 0 0' }}>
                {business?.name || '-'} (<code className="mono">{member?.businessId}</code>)
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Role & Status</dt>
              <dd style={{ margin: '2px 0 0' }}>
                <strong style={{ textTransform: 'capitalize' }}>{member?.role}</strong> — {member?.status}
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Assigned Studio IDs</dt>
              <dd style={{ margin: '2px 0 0' }} className="mono">
                {member?.role === 'owner'
                  ? 'ALL_STUDIOS (Owner)'
                  : member?.assignedStudioIds?.length
                    ? member.assignedStudioIds.join(', ')
                    : '(Belum ada studio ditugaskan)'}
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Active Subscriptions</dt>
              <dd style={{ margin: '2px 0 0' }}>{activeListenerCount} scoped listener</dd>
            </div>
          </dl>
        </article>
      </section>
    </div>
  );
}
