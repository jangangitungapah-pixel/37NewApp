import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  ShieldCheck,
} from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import { ROLES } from '../../domain/enums/roles.js';

const ROADMAP_PHASES = [
  { phase: '01', name: 'Foundation, Auth & Firestore Security Rules', state: 'active' },
  { phase: '02', name: 'Business Master Data (Studios, Services, Customers, Team)', state: 'active' },
  { phase: '03', name: 'Booking Engine & Deterministic Slot Calendar', state: 'active' },
  { phase: '04', name: 'Session, Settlement, Immutable Ledger & Commission', state: 'active' },
  { phase: '05', name: 'Portal Collaboration, Activity Log & Notifications', state: 'active' },
  { phase: '06', name: 'Gallery & Cloudinary Restricted Unsigned Upload', state: 'active' },
  { phase: '07', name: 'Dashboard Analytics & Spark-Safe Reports', state: 'next' },
  { phase: '08', name: 'Hardening, Accessibility & Production Readiness', state: 'planned' },
];

export function PhaseFoundationDashboard({ portalRole }) {
  const { authUser, member, business, appConfig, activeListenerCount } = useAuthSession();
  const isOwner = portalRole === ROLES.OWNER;

  const quickLinks = isOwner
    ? [
        { to: '/owner/bookings', label: 'Bookings & Calendar' },
        { to: '/owner/finance', label: 'Settlement & Finance' },
        { to: '/owner/activity', label: 'Activity & Alerts' },
        { to: '/owner/gallery', label: 'Gallery & Media' },
        { to: '/owner/studios', label: 'Studios & Rooms' },
        { to: '/owner/services', label: 'Services & Pricing' },
        { to: '/owner/customers', label: 'Customers' },
        { to: '/owner/team', label: 'Team & Access' },
        { to: '/owner/settings', label: 'Settings & Policies' },
      ]
    : [
        { to: '/operator/bookings', label: 'Kalender & Booking' },
        { to: '/operator/commissions', label: 'Komisi Saya' },
        { to: '/operator/activity', label: 'Aktivitas Studio' },
        { to: '/operator/gallery', label: 'Galeri Studio' },
        { to: '/operator/studios', label: 'Studio Ditugaskan' },
        { to: '/operator/services', label: 'Layanan & Tarif' },
        { to: '/operator/customers', label: 'Customers' },
      ];

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <section className="panel" style={{ display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <span className="badge badge-success">
            <ShieldCheck size={14} aria-hidden="true" />
            <span>Phase 06 Gallery &amp; Cloudinary Active</span>
          </span>
          <span className="badge badge-info">
            <Database size={14} aria-hidden="true" />
            <span>
              Firestore: {appConfig.firebase.projectId} / {appConfig.firebase.databaseId}
            </span>
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: '26px', lineHeight: 1.2 }}>
          {isOwner ? 'Owner Portal — Kendali Bisnis & Operasional Studio' : 'Operator Portal — Ruang Kerja Ter-Scope'}
        </h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
          {isOwner
            ? 'Kelola studio, layanan, booking, settlement ledger, aktivitas kolaborasi, akses tim, serta galeri Cloudinary studio dalam satu portal.'
            : 'Portal Operator menampilkan studio yang ditugaskan (`assignedStudioIds`), kalender booking, komisi pribadi, aktivitas tim, dan galeri studio.'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '4px' }}>
          {quickLinks.map((item) => (
            <Link key={item.to} to={item.to} className="btn btn-sm">
              <span>{item.label}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className="grid-3">
        <article className="panel" style={{ display: 'grid', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Bisnis Aktif
          </span>
          <strong style={{ fontSize: '18px' }}>{business?.name || member?.businessId || '-'}</strong>
          <span className="mono" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            ID: {member?.businessId} · {business?.timezone || 'Asia/Jakarta'} · {business?.currency || 'IDR'}
          </span>
        </article>

        <article className="panel" style={{ display: 'grid', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Role & Studio Scope
          </span>
          <strong style={{ fontSize: '18px', textTransform: 'capitalize' }}>
            {member?.role} ({member?.status})
          </strong>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {isOwner
              ? 'Semua studio dalam bisnis'
              : `Assigned studios: ${member?.assignedStudioIds?.length || 0} studio`}
          </span>
        </article>

        <article className="panel" style={{ display: 'grid', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Realtime Listener Scope
          </span>
          <strong style={{ fontSize: '18px' }}>{activeListenerCount} listener aktif</strong>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            UID: <code className="mono">{authUser?.uid}</code>
          </span>
        </article>
      </section>

      <section className="panel" style={{ display: 'grid', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Status Implementasi Modul (Phase Gate)</h2>
          <span className="badge badge-success">
            <CheckCircle2 size={13} aria-hidden="true" />
            <span>Semua Koleksi Phase 01–06 Aktif di Security Rules</span>
          </span>
        </div>

        <div style={{ display: 'grid', gap: '8px' }}>
          {ROADMAP_PHASES.map((item) => (
            <div
              key={item.phase}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-input)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <span className="mono" style={{ fontSize: '12px', color: 'var(--accent-brass)', fontWeight: 700 }}>
                  P{item.phase}
                </span>
                <span style={{ fontSize: '14px' }}>{item.name}</span>
              </div>
              {item.state === 'active' ? (
                <span className="badge badge-success">
                  <CheckCircle2 size={13} aria-hidden="true" />
                  <span>Aktif</span>
                </span>
              ) : (
                <span className="badge">
                  <Clock size={13} aria-hidden="true" />
                  <span>{item.state === 'next' ? 'Fase Berikutnya' : 'Terjadwal'}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
