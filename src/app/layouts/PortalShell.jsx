import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Disc3, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import { BreadcrumbTrail } from '../../components/navigation/BreadcrumbTrail.jsx';
import { CommandPalette } from '../../components/navigation/CommandPalette.jsx';
import { ThemeToggle } from '../../components/navigation/ThemeToggle.jsx';
import { FadeIn } from '../../components/motion/MotionPrimitives.jsx';
import { NotificationCenter } from '../../features/notifications/NotificationCenter.jsx';
import { ConnectionBanner, StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { useUiStore } from '../../stores/useUiStore.js';
import { useAuthSession } from '../providers/authSessionContext.js';

/**
 * Shared responsive shell layout used by both Owner and Operator portals.
 */
export function PortalShell({ portalLabel, portalBadgeVariant = 'warning', navItems }) {
  const { member, business, isOnline, fromCache, error, logout } = useAuthSession();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);

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
    <div className={`portal-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <a href="#main-content" className="skip-link">
        Lewati ke konten utama
      </a>
      <div
        className={`drawer-backdrop ${drawerOpen ? 'open' : ''}`}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      <aside className={`portal-sidebar ${drawerOpen ? 'open' : ''}`} aria-label="Navigasi Portal">
        <div className="grid gap-4.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="grid size-8.5 shrink-0 place-items-center rounded-xl text-primary-foreground"
                style={{
                  background: 'linear-gradient(135deg, var(--primary), var(--success))',
                }}
              >
                <Disc3 size={18} aria-hidden="true" />
              </div>
              <div className="sidebar-label min-w-0">
                <strong className="block truncate text-sm text-foreground">
                  {business?.name || '37MusicStudio'}
                </strong>
                <span className="block text-[11px] text-muted-foreground">{portalLabel}</span>
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

          <nav aria-label="Menu Portal" className="grid gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={closeDrawer}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  <Icon size={17} className="shrink-0" aria-hidden="true" />
                  <span className="sidebar-label truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="grid gap-2.5 border-t border-border pt-3.5">
          <div className="sidebar-account grid gap-0.5 text-xs text-muted-foreground">
            <strong className="truncate text-foreground">{member?.displayName}</strong>
            <span className="truncate">{member?.email}</span>
          </div>
          <button
            type="button"
            className="btn btn-danger"
            onClick={logout}
            title={sidebarCollapsed ? 'Keluar' : undefined}
          >
            <LogOut size={16} className="shrink-0" aria-hidden="true" />
            <span className="sidebar-label">Keluar</span>
          </button>
        </div>
      </aside>

      <div className="portal-main">
        <header className="portal-topbar">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              className="btn mobile-menu-btn"
              onClick={() => setDrawerOpen(true)}
              aria-label="Buka menu navigasi"
              aria-expanded={drawerOpen}
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-sm desktop-collapse-btn"
              onClick={toggleSidebarCollapsed}
              aria-label={sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
              title={sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={15} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={15} aria-hidden="true" />
              )}
            </button>
            <span className={`badge badge-${portalBadgeVariant} shrink-0`}>{portalLabel}</span>
            <BreadcrumbTrail portalLabel={portalLabel} navItems={navItems} className="hidden md:flex ml-1" />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="Buka pencarian cepat"
              className="inline-flex h-8.5 items-center gap-2 rounded-xl border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground shadow-2xs transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <Search className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Cari menu...</span>
              <kbd className="hidden lg:inline rounded border border-border bg-muted px-1 py-0.2 font-mono text-[10px]">
                Ctrl+K
              </kbd>
            </button>
            <ThemeToggle mode="compact" />
            <NotificationCenter />
            <span className="badge hidden sm:inline-flex">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </header>

        <main id="main-content" className="portal-content" tabIndex={-1}>
          <ConnectionBanner isOnline={isOnline} fromCache={fromCache} />
          {error && (
            <div style={{ marginBottom: '16px' }}>
              <StatusAlert variant="danger" title="Peringatan Sesi" message={error.message} />
            </div>
          )}
          <FadeIn key={location.pathname}>
            <Outlet />
          </FadeIn>
        </main>
      </div>

      <CommandPalette navItems={navItems} portalLabel={portalLabel} />
    </div>
  );
}
