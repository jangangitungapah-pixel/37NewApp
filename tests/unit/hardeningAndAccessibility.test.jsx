import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../../src/shared/components/ErrorBoundary.jsx';
import { ModalDialog } from '../../src/shared/components/ModalDialog.jsx';

vi.mock('../../src/app/providers/authSessionContext.js', () => ({
  useAuthSession: () => ({
    member: { uid: 'owner-1', displayName: 'Studio Owner', email: 'owner@37.test' },
    business: { name: '37 Music Studio' },
    isOnline: true,
    fromCache: false,
    error: null,
    logout: vi.fn(),
  }),
}));

vi.mock('../../src/features/notifications/NotificationCenter.jsx', () => ({
  NotificationCenter: () => <div data-testid="notif-bell-stub" />,
}));

import { PortalShell } from '../../src/app/layouts/PortalShell.jsx';

function CrashingChild() {
  throw new Error('Simulasi crash komponen');
}

describe('Phase 08 Resilience, Modal Focus & Accessibility Hardening', () => {
  it('captures unhandled render errors in ErrorBoundary with reload & home recovery actions', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <CrashingChild />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Simulasi crash komponen/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Muat Ulang Aplikasi/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kembali ke Beranda/i })).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('locks scroll when ModalDialog opens, closes cleanly on Escape, and restores body overflow', () => {
    const onClose = vi.fn();
    const { rerender, unmount } = render(
      <ModalDialog open title="Konfirmasi Sesi" description="Deskripsi modal" onClose={onClose}>
        <div>Konten Modal</div>
      </ModalDialog>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <ModalDialog open={false} title="Konfirmasi Sesi" onClose={onClose}>
        <div>Konten Modal</div>
      </ModalDialog>,
    );
    expect(document.body.style.overflow).toBe('');
    unmount();
  });

  it('renders PortalShell semantic landmarks, skip link, and Escape close for mobile nav drawer', () => {
    const FakeIcon = () => null;
    render(
      <MemoryRouter initialEntries={['/owner']}>
        <Routes>
          <Route
            element={
              <PortalShell
                portalLabel="Owner Portal"
                navItems={[{ to: '/owner', label: 'Overview', icon: FakeIcon, end: true }]}
              />
            }
          >
            <Route path="/owner" element={<div>KONTEN_UTAMA</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const skipLink = screen.getByRole('link', { name: /Lewati ke konten utama/i });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('navigation', { name: /Menu Portal/i })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');

    const openMenuBtn = screen.getByRole('button', { name: /Buka menu navigasi/i });
    expect(openMenuBtn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(openMenuBtn);
    expect(openMenuBtn).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(openMenuBtn).toHaveAttribute('aria-expanded', 'false');
  });
});
