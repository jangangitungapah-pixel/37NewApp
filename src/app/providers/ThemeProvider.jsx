import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  THEME_MODES,
  applyThemeToDocument,
  getSystemPrefersDark,
  normalizeThemeMode,
  resolveEffectiveTheme,
} from '../../design-system/themes/themeStorage.js';
import { useUiStore } from '../../stores/useUiStore.js';
import { ThemeContext } from './themeContext.js';

const THEME_CYCLE_ORDER = [THEME_MODES.LIGHT, THEME_MODES.DARK, THEME_MODES.SYSTEM];

export function ThemeProvider({ children, forcedTheme }) {
  const themePreference = useUiStore((state) => state.themePreference);
  const setStoredThemePreference = useUiStore((state) => state.setThemePreference);
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (event) => {
      setSystemPrefersDark(Boolean(event.matches));
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }

    return undefined;
  }, []);

  const effectivePreference = forcedTheme ? normalizeThemeMode(forcedTheme) : themePreference;

  const resolvedTheme = useMemo(
    () => resolveEffectiveTheme(effectivePreference, systemPrefersDark),
    [effectivePreference, systemPrefersDark]
  );

  useEffect(() => {
    applyThemeToDocument(resolvedTheme);
  }, [resolvedTheme]);

  const setThemePreference = useCallback(
    (nextMode) => {
      setStoredThemePreference(nextMode);
    },
    [setStoredThemePreference]
  );

  const cycleTheme = useCallback(() => {
    const idx = THEME_CYCLE_ORDER.indexOf(themePreference);
    const next = THEME_CYCLE_ORDER[(idx + 1) % THEME_CYCLE_ORDER.length];
    setStoredThemePreference(next);
  }, [setStoredThemePreference, themePreference]);

  const value = useMemo(
    () => ({
      themePreference: effectivePreference,
      resolvedTheme,
      systemPrefersDark,
      setThemePreference,
      cycleTheme,
    }),
    [effectivePreference, resolvedTheme, systemPrefersDark, setThemePreference, cycleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
