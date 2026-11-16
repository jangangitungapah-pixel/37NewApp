import { create } from 'zustand';
import {
  normalizeThemeMode,
  readStoredThemeMode,
  writeStoredThemeMode,
} from '../design-system/themes/themeStorage.js';

const SIDEBAR_STORAGE_KEY = '37ms-ui-sidebar-collapsed';

function readInitialSidebarCollapsed() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? 'true' : 'false');
  } catch {
    // Ignore storage errors
  }
}

/**
 * Client-only UI chrome & preference state.
 * Server state (Firestore documents, bookings, studio data) lives in TanStack Query / domain hooks.
 */
export const useUiStore = create((set) => ({
  themePreference: readStoredThemeMode(),
  sidebarCollapsed: readInitialSidebarCollapsed(),
  mobileDrawerOpen: false,
  commandPaletteOpen: false,

  setThemePreference: (mode) => {
    const normalized = normalizeThemeMode(mode);
    writeStoredThemeMode(normalized);
    set({ themePreference: normalized });
  },

  setSidebarCollapsed: (collapsed) => {
    const next = Boolean(collapsed);
    writeSidebarCollapsed(next);
    set({ sidebarCollapsed: next });
  },

  toggleSidebarCollapsed: () => {
    set((state) => {
      const next = !state.sidebarCollapsed;
      writeSidebarCollapsed(next);
      return { sidebarCollapsed: next };
    });
  },

  setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: Boolean(open) }),
  toggleMobileDrawer: () => set((state) => ({ mobileDrawerOpen: !state.mobileDrawerOpen })),

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: Boolean(open) }),
  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
}));
