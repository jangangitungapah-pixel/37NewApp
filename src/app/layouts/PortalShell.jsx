import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Disc3, LogOut, Menu, X } from 'lucide-react';
import { useAuthSession } from '../providers/authSessionContext.js';
import { NotificationCenter } from '../../features/notifications/NotificationCenter.jsx';
import { ConnectionBanner, StatusAlert } from '../../shared/components/StatusFeedback.jsx';

/**
 * Shared responsive shell layout used by both Owner and Operator portals.
 */
export function PortalShell({ portalLabel, portalBadgeVariant = 'warning', navItems }) {
  const { member, business, isOnline, fromCache, error, logout } = useAuthSession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = () => setDrawerOpen(false);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  return (
    <div className="portal-shell">
      <a href="#main-content" className="skip-link">
        Lewati ke konten utama
      </a>
      <div
        className={`drawer-backdrop ${drawerOpen ? 'open' : ''}`}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      <aside className={`portal-sidebar ${drawerOpen ? 'open' : ''}`} aria-label="Navigasi Portal">
        <div style={{ display: 'grid', gap: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  display: 'grid',
                  placeItems: 'center',
                  background: 'linear-gradient(135deg, var(--accent-brass), var(--accent-mint))',
                  color: 'var(--text-inverse)',
                  flexShrink: 0,
                }}
              >
                <Disc3 size={18} aria-hidden="true" />
              </div>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {business?.name || '37MusicStudio'}
                </strong>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {portalLabel}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="btn mobile-menu-btn"
              style={{ minHeight: '34px', padding: '6px 8px' }}
              onClick={closeDrawer}
              aria-label="Tutup menu navigasi"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="Menu Portal" style={{ display: 'grid', gap: '4px' }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={closeDrawer}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div style={{ display: 'grid', gap: '10px', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'grid', gap: '2px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{member?.displayName}</strong>
            <span style={{ color: 'var(--text-muted)' }}>{member?.email}</span>
          </div>
          <button type="button" className="btn btn-danger" onClick={logout}>
            <LogOut size={16} aria-hidden="true" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      <div className="portal-main">
        <header className="portal-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn mobile-menu-btn"
              onClick={() => setDrawerOpen(true)}
              aria-label="Buka menu navigasi"
              aria-expanded={drawerOpen}
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            <span className={`badge badge-${portalBadgeVariant}`}>{portalLabel}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <NotificationCenter />
            <span className="badge">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </header>

        <main id="main-content" className="portal-content" tabIndex={-1}>
          <ConnectionBanner isOnline={isOnline} fromCache={fromCache} />
          {error && (
            <div style={{ marginBottom: '16px' }}>
              <StatusAlert variant="danger" title="Peringatan Sesi" message={error.message} />
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
