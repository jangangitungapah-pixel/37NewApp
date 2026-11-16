import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../../src/app/providers/authSessionContext.js', () => ({
  useAuthSession: () => ({
    member: { uid: 'owner-1', displayName: 'Owner Uji', email: 'owner@37.test' },
    business: { name: 'Studio Uji' },
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
import { ThemeProvider } from '../../src/app/providers/ThemeProvider.jsx';
import { useTheme } from '../../src/app/providers/themeContext.js';
import { DataTable } from '../../src/components/data-display/DataTable.jsx';
import { ConfirmDialog } from '../../src/components/feedback/ConfirmDialog.jsx';
import { FormField } from '../../src/components/forms/FormField.jsx';
import { ThemeToggle } from '../../src/components/navigation/ThemeToggle.jsx';
import { Button } from '../../src/components/ui/Button.jsx';
import { Input } from '../../src/components/ui/Input.jsx';
import {
  applyThemeToDocument,
  normalizeThemeMode,
  resolveEffectiveTheme,
  THEME_MODES,
  THEME_STORAGE_KEY,
} from '../../src/design-system/themes/themeStorage.js';
import { createZodFormConfig, extractFieldErrorMessage } from '../../src/lib/validation/formHelpers.js';
import { useUiStore } from '../../src/stores/useUiStore.js';

const originalMatchMedia = window.matchMedia;
const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollIntoView = Element.prototype.scrollIntoView;

function createMatchMediaStub(initialMatches = false) {
  let matches = initialMatches;
  const listeners = new Set();

  const stub = vi.fn().mockImplementation(() => ({
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_event, cb) => listeners.add(cb),
    removeEventListener: (_event, cb) => listeners.delete(cb),
    addListener: (cb) => listeners.add(cb),
    removeListener: (cb) => listeners.delete(cb),
  }));

  stub.dispatchThemeChange = (nextMatches) => {
    matches = nextMatches;
    for (const cb of listeners) {
      cb({ matches: nextMatches });
    }
  };

  return stub;
}

function ThemeStatusReadout() {
  const { themePreference, resolvedTheme } = useTheme();
  return (
    <div data-testid="theme-readout">
      {themePreference}:{resolvedTheme}
    </div>
  );
}

const sampleSchema = z.object({
  roomName: z.string().min(3, 'Nama studio minimal 3 karakter'),
});

function SampleZodForm({ onValidSubmit }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm(createZodFormConfig(sampleSchema, { roomName: '' }));

  return (
    <form onSubmit={handleSubmit(onValidSubmit)}>
      <FormField
        label="Nama Ruangan"
        required
        error={extractFieldErrorMessage(errors, 'roomName')}
      >
        <Input {...register('roomName')} placeholder="Masukkan nama ruangan" />
      </FormField>
      <Button type="submit" variant="primary">
        Simpan Ruangan
      </Button>
    </form>
  );
}

describe('UI Foundation 2026 Architecture & Components', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    useUiStore.setState({
      themePreference: THEME_MODES.SYSTEM,
      sidebarCollapsed: false,
      mobileDrawerOpen: false,
      commandPaletteOpen: false,
    });
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    globalThis.ResizeObserver = originalResizeObserver;
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('resolves themeStorage preferences and applies document root classes safely without matchMedia', () => {
    window.matchMedia = undefined;

    expect(normalizeThemeMode('invalid')).toBe('system');
    expect(resolveEffectiveTheme('system')).toBe('light');
    expect(resolveEffectiveTheme('dark', false)).toBe('dark');

    applyThemeToDocument('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('switches themes via ThemeToggle, persists in localStorage, and reacts to OS system changes', () => {
    const mm = createMatchMediaStub(false);
    window.matchMedia = mm;

    render(
      <ThemeProvider>
        <ThemeStatusReadout />
        <ThemeToggle mode="segmented" />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme-readout')).toHaveTextContent('system:light');

    act(() => {
      mm.dispatchThemeChange(true);
    });
    expect(screen.getByTestId('theme-readout')).toHaveTextContent('system:dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Terang/i }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(screen.getByTestId('theme-readout')).toHaveTextContent('light:light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Gelap/i }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByTestId('theme-readout')).toHaveTextContent('dark:dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('supports sorting, global filtering, pagination, and empty state in DataTable (TanStack Table v9)', () => {
    const columns = [
      { accessorKey: 'studio', header: 'Studio' },
      { accessorKey: 'rate', header: 'Tarif' },
    ];
    const rows = [
      { studio: 'Room Charlie', rate: 300 },
      { studio: 'Room Alpha', rate: 100 },
      { studio: 'Room Bravo', rate: 200 },
    ];

    render(
      <DataTable
        columns={columns}
        data={rows}
        pageSize={2}
        searchPlaceholder="Cari studio..."
      />
    );

    expect(screen.getByText('Room Charlie')).toBeInTheDocument();
    expect(screen.queryByText('Room Bravo')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Halaman berikutnya/i }));
    expect(screen.getByText('Room Bravo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Halaman sebelumnya/i }));
    fireEvent.click(screen.getByRole('button', { name: /Studio/i }));
    expect(screen.getByText('Room Alpha')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText('Cari studio...');
    fireEvent.change(searchInput, { target: { value: 'Bravo' } });
    expect(screen.getByText('Room Bravo')).toBeInTheDocument();
    expect(screen.queryByText('Room Alpha')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'TidakAdaRoom' } });
    expect(screen.getByText(/Tidak ada data ditemukan/i)).toBeInTheDocument();
  });

  it('validates React Hook Form + Zod schema inside FormField and displays accessible error alert', async () => {
    const handleValid = vi.fn();
    render(<SampleZodForm onValidSubmit={handleValid} />);

    fireEvent.click(screen.getByRole('button', { name: /Simpan Ruangan/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/minimal 3 karakter/i);
    });
    expect(handleValid).not.toHaveBeenCalled();

    const input = screen.getByPlaceholderText(/Masukkan nama ruangan/i);
    fireEvent.change(input, { target: { value: 'Studio Mastering 1' } });
    fireEvent.click(screen.getByRole('button', { name: /Simpan Ruangan/i }));

    await waitFor(() => {
      expect(handleValid).toHaveBeenCalledTimes(1);
    });
    expect(handleValid.mock.calls[0][0]).toEqual({ roomName: 'Studio Mastering 1' });
  });

  it('renders ConfirmDialog with confirm callback and accessible dialog role', () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Hapus Data Studio"
        description="Aksi ini akan menandai studio sebagai arsip."
        confirmLabel="Ya, Hapus"
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText('Hapus Data Studio')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ya, Hapus/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('integrates collapsible sidebar, BreadcrumbTrail, and role-scoped CommandPalette inside PortalShell', () => {
    const FakeIcon = () => null;
    const ownerOnlyNav = [
      { to: '/owner', label: 'Overview', icon: FakeIcon, end: true },
      { to: '/owner/finance', label: 'Settlement & Finance', icon: FakeIcon, end: false },
    ];

    const { container } = render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/owner/finance']}>
          <Routes>
            <Route element={<PortalShell portalLabel="Owner Portal" navItems={ownerOnlyNav} />}>
              <Route path="/owner" element={<div>OWNER_HOME</div>} />
              <Route path="/owner/finance" element={<div>OWNER_FINANCE</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    );

    const breadcrumb = screen.getByRole('navigation', { name: /Breadcrumb/i });
    expect(breadcrumb).toHaveTextContent('Owner Portal');
    expect(breadcrumb).toHaveTextContent('Settlement & Finance');

    const collapseBtn = screen.getByRole('button', { name: /Ciutkan sidebar/i });
    fireEvent.click(collapseBtn);
    expect(container.querySelector('.portal-shell')).toHaveClass('sidebar-collapsed');

    fireEvent.click(screen.getByRole('button', { name: /Buka pencarian cepat/i }));
    expect(screen.getByPlaceholderText(/Cari menu navigasi atau ganti tema/i)).toBeInTheDocument();
    expect(screen.getByText('/owner/finance')).toBeInTheDocument();
    expect(screen.queryByText('/operator/commissions')).not.toBeInTheDocument();
  });
});
