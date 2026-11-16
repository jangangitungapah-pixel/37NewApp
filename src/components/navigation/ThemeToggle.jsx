import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../app/providers/themeContext.js';
import { THEME_MODES } from '../../design-system/themes/themeStorage.js';
import { cn } from '../../lib/utils/cn.js';

const MODE_OPTIONS = [
  { value: THEME_MODES.LIGHT, label: 'Terang', icon: Sun },
  { value: THEME_MODES.DARK, label: 'Gelap', icon: Moon },
  { value: THEME_MODES.SYSTEM, label: 'Sistem', icon: Monitor },
];

/**
 * Dual-theme switcher supporting Light, Dark, and OS System modes.
 */
export function ThemeToggle({ mode = 'segmented', className }) {
  const { themePreference, resolvedTheme, setThemePreference, cycleTheme } = useTheme();

  if (mode === 'compact') {
    const ActiveIcon =
      themePreference === THEME_MODES.SYSTEM ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;
    const activeLabel =
      MODE_OPTIONS.find((item) => item.value === themePreference)?.label || 'Sistem';

    return (
      <button
        type="button"
        onClick={cycleTheme}
        aria-label={`Ubah tema tampilan (saat ini: ${activeLabel})`}
        title={`Tema: ${activeLabel} (klik untuk ganti)`}
        className={cn(
          'inline-flex h-8.5 items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-muted cursor-pointer',
          className
        )}
      >
        <ActiveIcon className="size-3.5 text-primary" aria-hidden="true" />
        <span>{activeLabel}</span>
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Pilihan tema tampilan"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-xl border border-border bg-muted/70 p-0.5',
        className
      )}
    >
      {MODE_OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = themePreference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setThemePreference(option.value)}
            aria-pressed={selected}
            title={`Tema ${option.label}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer',
              selected
                ? 'bg-card text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
