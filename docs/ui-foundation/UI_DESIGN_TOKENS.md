# UI Design Tokens — 37MusicStudio

Sistem token **37MusicStudio Design System 2026** menggunakan ruang warna **OKLCH** untuk konsistensi persepsi kecerahan antara Light Mode (**Daylight Studio**) dan Dark Mode (**Acoustic Obsidian**).

Sumber kebenaran token:
- CSS Custom Properties: [`src/styles/themes.css`](../../src/styles/themes.css)
- Mapping `@theme inline` Tailwind v4: [`src/styles/globals.css`](../../src/styles/globals.css)
- Konstanta JS & helper pembacaan: [`src/design-system/tokens/tokens.js`](../../src/design-system/tokens/tokens.js)

## 1. Core Semantic Color Tokens

| Token CSS | Utility Tailwind v4 | Light (`:root`) | Dark (`.dark` / `[data-theme="dark"]`) | Peran |
| :--- | :--- | :--- | :--- | :--- |
| `--background` | `bg-background` | `oklch(0.985 0.003 95)` | `oklch(0.145 0.016 260)` | Kanvas dasar aplikasi |
| `--foreground` | `text-foreground` | `oklch(0.18 0.015 260)` | `oklch(0.955 0.008 255)` | Teks utama kontras tinggi |
| `--card` | `bg-card` | `oklch(1 0 0)` | `oklch(0.195 0.02 258)` | Permukaan kartu & panel utama |
| `--card-foreground` | `text-card-foreground` | `oklch(0.18 0.015 260)` | `oklch(0.955 0.008 255)` | Teks di atas `--card` |
| `--popover` | `bg-popover` | `oklch(1 0.002 95)` | `oklch(0.21 0.022 258)` | Menu dropdown, dialog, datepicker, command palette |
| `--primary` | `bg-primary` / `text-primary` | `oklch(0.56 0.145 68)` | `oklch(0.8 0.135 78)` | Aksen utama hangat (Studio Brass/Gold) |
| `--primary-foreground` | `text-primary-foreground` | `oklch(0.99 0.003 95)` | `oklch(0.16 0.02 260)` | Teks kontras di atas tombol/badge `--primary` |
| `--secondary` | `bg-secondary` | `oklch(0.945 0.008 250)` | `oklch(0.245 0.022 256)` | Tombol/elemen sekunder netral |
| `--muted` | `bg-muted` | `oklch(0.945 0.007 250)` | `oklch(0.24 0.02 256)` | Latar halus, input track, header tabel |
| `--muted-foreground` | `text-muted-foreground` | `oklch(0.47 0.018 255)` | `oklch(0.75 0.02 252)` | Label, caption, teks sekunder |
| `--accent` | `bg-accent` | `oklch(0.94 0.025 78)` | `oklch(0.8 0.135 78 / 0.14)` | Highlight hover/selected & active nav link |
| `--destructive` | `bg-destructive` / `text-destructive` | `oklch(0.55 0.21 25)` | `oklch(0.68 0.19 22)` | Aksi berbahaya, error validasi, status batal |
| `--border` | `border-border` | `oklch(0.89 0.008 250)` | `oklch(0.88 0.02 250 / 0.12)` | Garis pemisah & border kartu standar |
| `--input` | `border-input` | `oklch(0.91 0.008 250)` | `oklch(0.88 0.02 250 / 0.16)` | Border kontrol input/select |
| `--ring` | `ring-ring` | `oklch(0.58 0.145 68)` | `oklch(0.8 0.135 78)` | Outline focus-visible |

## 2. Semantic Status & Chart Tokens

- `--success` (`bg-success/12 text-success`)
- `--warning` (`bg-warning/14 text-warning`)
- `--info` (`bg-info/12 text-info`)
- `--chart-1` s.d. `--chart-5`: terhubung dengan palet semantik (`--primary`, `--info`, `--success`, ungu komplementer, `--warning`).

## 3. Spatial Surface, Radius, Shadow & Z-Index Scale

- **Surface Hierarchy**: `--surface-standard`, `--surface-elevated`, `--surface-floating`, `--surface-glass`, `--surface-interactive`.
- **Radius**: `--radius-sm` (`0.5rem`), `--radius-md` (`0.75rem`), `--radius-lg` (`1rem`), `--radius-xl` (`1.375rem`), `--radius-full` (`9999px`).
- **Elevation**: `--shadow-sm`, `--shadow-card`, `--shadow-overlay`, `--shadow-glass`.
- **Z-Index**: `--z-sticky` (`20`), `--z-drawer` (`40`), `--z-popover` (`50`), `--z-modal` (`60`), `--z-toast` (`80`).

## 4. Typography & Motion Tokens

- **Primary Font**: `'Geist Sans'` (`@fontsource/geist-sans` bobot 400–700).
- **Fallback Font**: `'Inter'` (`@fontsource/inter` bobot 400–700), `system-ui`, `sans-serif`.
- **Scale JS (`TYPOGRAPHY_TOKENS.scale`)**: `xs` (`0.75rem`), `sm` (`0.8125rem`), `base` (`0.9375rem`), `lg` (`1.125rem`), `xl` (`1.375rem`), `2xl` (`1.625rem`).
- **Motion (`MOTION_TOKENS`)**: `fastMs: 140`, `standardMs: 220`, `slowMs: 360`, `easeStandard: [0.22, 1, 0.36, 1]`.

## 5. Compatibility Bridge (Legacy CSS Vars)

`src/styles/themes.css` memetakan variabel fitur eksisting (`--bg-canvas`, `--bg-surface`, `--bg-input`, `--border-subtle`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent-brass`, `--status-*`) langsung ke token semantik OKLCH agar halaman fitur Phase 01–08 langsung beradaptasi di kedua tema tanpa refactor besar.
