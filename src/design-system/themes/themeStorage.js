export const THEME_STORAGE_KEY = '37ms-ui-theme';

export const THEME_MODES = Object.freeze({
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
});

const VALID_MODES = new Set(Object.values(THEME_MODES));

/**
 * Normalizes theme mode input into `'light' | 'dark' | 'system'`.
 * @param {unknown} value
 * @returns {'light' | 'dark' | 'system'}
 */
export function normalizeThemeMode(value) {
  return VALID_MODES.has(value) ? value : THEME_MODES.SYSTEM;
}

/**
 * Reads persisted theme preference safely without throwing in restricted storage environments.
 */
export function readStoredThemeMode() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return THEME_MODES.SYSTEM;
  }
  try {
    return normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return THEME_MODES.SYSTEM;
  }
}

/**
 * Persists theme preference cleanly in `localStorage`.
 * @param {'light' | 'dark' | 'system'} mode
 */
export function writeStoredThemeMode(mode) {
  const normalized = normalizeThemeMode(mode);
  if (typeof window === 'undefined' || !window.localStorage) {
    return normalized;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage quota or sandbox errors
  }
  return normalized;
}

/**
 * Evaluates current OS preference safely (returns false in non-browser/jsdom environments without matchMedia).
 * @returns {boolean}
 */
export function getSystemPrefersDark() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return Boolean(window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch {
    return false;
  }
}

/**
 * Resolves effective `'light' | 'dark'` theme from user preference and OS setting.
 * @param {'light' | 'dark' | 'system'} mode
 * @param {boolean} [systemPrefersDark]
 * @returns {'light' | 'dark'}
 */
export function resolveEffectiveTheme(mode, systemPrefersDark = getSystemPrefersDark()) {
  const normalized = normalizeThemeMode(mode);
  if (normalized === THEME_MODES.DARK) {
    return 'dark';
  }
  if (normalized === THEME_MODES.LIGHT) {
    return 'light';
  }
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * Synchronizes document root class, `data-theme`, `color-scheme`, and browser `<meta name="theme-color">`.
 * @param {'light' | 'dark'} resolvedTheme
 */
export function applyThemeToDocument(resolvedTheme) {
  if (typeof document === 'undefined') {
    return;
  }
  const effective = resolvedTheme === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  root.classList.toggle('dark', effective === 'dark');
  root.setAttribute('data-theme', effective);
  root.style.colorScheme = effective;

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', effective === 'dark' ? '#0e1118' : '#fafafb');
  }
}
