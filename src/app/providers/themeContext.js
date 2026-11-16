import { createContext, useContext } from 'react';
import { THEME_MODES } from '../../design-system/themes/themeStorage.js';

export const ThemeContext = createContext({
  themePreference: THEME_MODES.SYSTEM,
  resolvedTheme: 'light',
  systemPrefersDark: false,
  setThemePreference: () => {},
  cycleTheme: () => {},
});

/**
 * Returns active theme preference (`light | dark | system`), resolved effective theme (`light | dark`),
 * OS preference state, and theme update actions.
 */
export function useTheme() {
  return useContext(ThemeContext);
}
