# UI Theme Guidelines — 37MusicStudio

Aplikasi mendukung penuh **Light Mode**, **Dark Mode**, dan **System Mode** tanpa flash tema saat halaman dimuat ulang (zero-FOUC).

## 1. Mekanisme Theme Architecture

1. **Inisialisasi Pra-Render (`index.html`)**:
   Skrip inline sinkron di `<head>` membaca key `localStorage('37ms-ui-theme')`, mendeteksi `prefers-color-scheme: dark` bila mode bernilai `'system'` (atau belum disetel), lalu menetapkan kelas `.dark`, atribut `data-theme="light|dark"`, `document.documentElement.style.colorScheme`, serta `<meta name="theme-color">` sebelum React mount.
2. **State & Persistensi (`themeStorage.js` & `useUiStore.js`)**:
   Preferensi tersimpan pada `useUiStore` (`themePreference: 'light' | 'dark' | 'system'`) melalui helper aman `readStoredThemeMode` & `writeStoredThemeMode` agar tidak melempar error di environment sandbox/private mode.
3. **Reaktivitas Runtime (`ThemeProvider.jsx`)**:
   - Mendengarkan perubahan `window.matchMedia('(prefers-color-scheme: dark)')` secara aman (termasuk fallback jika API tidak tersedia di test runner).
   - Menghitung `resolvedTheme` (`'light' | 'dark'`) dan menyinkronkan DOM via `applyThemeToDocument(resolvedTheme)`.
   - Mengekspos hook `useTheme()` (`src/app/providers/themeContext.js`).

## 2. Selector Tailwind v4 & CSS

`src/styles/globals.css` mendefinisikan:

```css
@custom-variant dark (&:where(.dark, .dark *, [data-theme='dark'], [data-theme='dark'] *));
```

Artinya Anda dapat menggunakan modifier `dark:...` maupun utility semantik tanpa modifier karena warna dasar (`bg-card`, `text-foreground`, `border-border`, dst.) sudah otomatis bertukar nilai saat `.dark` aktif.

## 3. Aturan Integrasi Grafik, Pihak Ketiga & Toast

- **Toast (`Sonner`)**: `AppToaster.jsx` meneruskan `theme={resolvedTheme}` ke `<Toaster>` sehingga warna toast selalu cocok dengan tema aktif.
- **Kalender (`React Day Picker v10`)**: Variabel `--rdp-*` ditimpa di `src/styles/globals.css` menggunakan token OKLCH (`var(--primary)`, `var(--accent)`, `var(--muted-foreground)`).
- **Grafik (`ChartSurface.jsx`)**: Membaca `resolvedTheme` untuk memilih konfigurasi warna kanvas, tooltip, label teks, dan grid garis pemisah yang kontras di Light Mode maupun Dark Mode.

## 4. Checklist Parity Tema untuk Fitur Baru

- Uji visual komponen pada **kedua mode** (Light & Dark) sebelum selesai.
- Hindari warna latar gelap statis (seperti `rgba(13, 18, 28, ...)` atau teks `#ffd0d0`) pada elemen inline style.
- Gunakan `var(--surface-standard)` / `bg-muted/40` untuk kotak informasi nested, serta `var(--destructive)` / `text-destructive` untuk peringatan gagal/pembatalan.
