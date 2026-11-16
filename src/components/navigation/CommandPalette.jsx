import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '@base-ui/react/dialog';
import { Command } from 'cmdk';
import { Monitor, Moon, Search, Sun } from 'lucide-react';
import { useTheme } from '../../app/providers/themeContext.js';
import { THEME_MODES } from '../../design-system/themes/themeStorage.js';
import { useUiStore } from '../../stores/useUiStore.js';

/**
 * Role-scoped quick navigation & theme command palette (`Ctrl+K` / `Cmd+K`).
 * Only surfaces `navItems` passed from the authenticated portal shell.
 */
export function CommandPalette({ navItems = [], portalLabel = 'Portal' }) {
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const navigate = useNavigate();
  const { setThemePreference } = useTheme();

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(!useUiStore.getState().commandPaletteOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setOpen]);

  const handleNavigate = (to) => {
    setOpen(false);
    navigate(to);
  };

  const handleTheme = (mode) => {
    setThemePreference(mode);
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs transition-opacity" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
          <Dialog.Popup className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none">
            <Dialog.Title className="sr-only">Pencarian Cepat {portalLabel}</Dialog.Title>
            <Dialog.Description className="sr-only">
              Gunakan panah atas/bawah dan Enter untuk berpindah halaman atau mengganti tema.
            </Dialog.Description>

            <Command label={`Command Palette ${portalLabel}`} className="flex flex-col">
              <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
                <Search className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
                <Command.Input
                  placeholder="Cari menu navigasi atau ganti tema..."
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                <kbd className="hidden sm:inline-flex rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  ESC
                </kbd>
              </div>

              <Command.List className="max-h-80 overflow-y-auto p-2">
                <Command.Empty className="py-8 text-center text-xs text-muted-foreground">
                  Tidak ada perintah yang cocok.
                </Command.Empty>

                <Command.Group
                  heading={`Navigasi ${portalLabel}`}
                  className="px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Command.Item
                        key={item.to}
                        value={`${item.label} ${item.to}`}
                        onSelect={() => handleNavigate(item.to)}
                        className="mt-0.5 flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                      >
                        {Icon && <Icon className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />}
                        <span className="flex-1 truncate">{item.label}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {item.to}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>

                <Command.Separator className="my-1.5 h-px bg-border" />

                <Command.Group
                  heading="Tema Tampilan"
                  className="px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  <Command.Item
                    value="tema terang light mode"
                    onSelect={() => handleTheme(THEME_MODES.LIGHT)}
                    className="mt-0.5 flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    <Sun className="size-4 text-primary" aria-hidden="true" />
                    <span>Tema Terang (Light)</span>
                  </Command.Item>
                  <Command.Item
                    value="tema gelap dark mode"
                    onSelect={() => handleTheme(THEME_MODES.DARK)}
                    className="mt-0.5 flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    <Moon className="size-4 text-info" aria-hidden="true" />
                    <span>Tema Gelap (Dark)</span>
                  </Command.Item>
                  <Command.Item
                    value="tema sistem system auto"
                    onSelect={() => handleTheme(THEME_MODES.SYSTEM)}
                    className="mt-0.5 flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    <Monitor className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span>Ikuti Sistem (System)</span>
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
