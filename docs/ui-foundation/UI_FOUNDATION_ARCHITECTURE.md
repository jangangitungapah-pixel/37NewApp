# UI Foundation Architecture — 37MusicStudio

Dokumen ini menjelaskan arsitektur frontend **UI Foundation 2026** pada repositori `37MusicStudio` (React 19, Vite 6, JavaScript + JSX, Tailwind CSS v4, `@base-ui/react`, Motion, TanStack Suite, Zustand, Apache ECharts).

## 1. Tujuan & Batas Cakupan

- Menjadikan fondasi antarmuka konsisten, modular, dapat diskalakan untuk Light & Dark Theme, responsif desktop-mobile, serta memenuhi standar aksesibilitas WCAG 2.1 AA dan `prefers-reduced-motion`.
- **Pemisahan Tanggung Jawab Ketat**: UI Foundation hanya mengelola lapisan presentasi, design token, komponen UI generik, state chrome lokal (`useUiStore`), dan konfigurasi query/form. Seluruh logika bisnis, domain model (`src/domain/`), use cases (`src/application/`), repositori Firestore (`src/data/`), aturan keamanan (`firestore.rules`), autentikasi Firebase, dan integrasi media Cloudinary tetap terisolasi dan tidak dimodifikasi.

## 2. Peta Direktori Fondasi UI

```text
index.html                              # Meta color-scheme & script inisialisasi anti-FOUC tema
vite.config.js                          # Plugin @tailwindcss/vite & strategi Rollup manualChunks (< 500 kB)
src/
├── main.jsx                            # Memuat font lokal Geist Sans & Inter, themes.css, globals.css
├── app/
│   ├── bootstrap/App.jsx               # Entry point yang membungkus <AppRouter> di dalam <AppProviders>
│   ├── providers/
│   │   ├── AppProviders.jsx            # Komposisi root: ErrorBoundary -> Query -> MotionConfig -> Theme -> Tooltip -> Auth -> Toaster
│   │   ├── themeContext.js             # React Context & hook useTheme()
│   │   └── ThemeProvider.jsx           # Sinkronisasi tema Light/Dark/System + listener prefers-color-scheme
│   └── layouts/
│       └── PortalShell.jsx             # Shell portal responsif dengan collapsible sidebar, BreadcrumbTrail, CommandPalette, ThemeToggle
├── design-system/
│   ├── tokens/tokens.js                # Registry konstanta tipografi, spacing, radius, surface, motion & helper CSS var reader
│   ├── themes/themeStorage.js          # Utilitas aman penyimpanan & resolusi tema ('37ms-ui-theme')
│   └── motion/presets.js               # Konstanta transisi dan varian Motion standar
├── styles/
│   ├── themes.css                      # Token semantik OKLCH (:root & .dark/[data-theme="dark"]) + bridge kompatibilitas legacy
│   └── globals.css                     # Entrypoint Tailwind CSS v4, @theme inline, @custom-variant dark, @layer base/components, styling .rdp-root
├── lib/
│   ├── utils/cn.js                     # Penggabung class Tailwind aman (clsx + tailwind-merge)
│   ├── query/queryClient.js            # TanStack QueryClient dengan default konservatif ramah kuota Firebase Spark
│   └── validation/formHelpers.js       # Helper konfigurasi React Hook Form + Zod resolver
├── stores/
│   └── useUiStore.js                   # Zustand store untuk state UI murni (tema, sidebarCollapsed, drawer, commandPalette)
└── components/
    ├── ui/                             # Primitif reusable berbasis CVA + @base-ui/react
    ├── motion/                         # Wrapper animasi MotionPrimitives.jsx
    ├── feedback/                       # AppToaster, toast.js (notify), ConfirmDialog, AlertBanner
    ├── navigation/                     # ThemeToggle, BreadcrumbTrail, CommandPalette (cmdk)
    ├── forms/                          # FormField, DatePickerField, ComboboxField, FileUploadDropzone
    └── data-display/                   # DataTable (TanStack Table v9 + Virtual), ChartSurface (ECharts), StatCard, StatusBadge, EmptyState
```

## 3. Hierarki Provider (`AppProviders`)

Urutan pembungkus di `src/app/providers/AppProviders.jsx`:

1. `ErrorBoundary`: menangkap error render React di tingkat root.
2. `QueryClientProvider`: menyediakan `appQueryClient` dengan `staleTime: 60s`, `refetchOnWindowFocus: false` untuk menjaga efisiensi read Firestore paket Spark.
3. `MotionConfig reducedMotion="user"`: menghormati preferensi aksesibilitas gerak perangkat pengguna secara global.
4. `ThemeProvider`: mengatur kelas `.dark` & atribut `data-theme` pada `<html>`.
5. `Tooltip.Provider` (`@base-ui/react/tooltip`): mengelompokkan delay tooltip antar elemen.
6. `AuthSessionProvider`: mempertahankan sesi Firebase Auth & membership Firestore (`includeAuth` dapat dimatikan untuk pengujian terisolasi).
7. `AppToaster`: merender toast `sonner` mengikuti `resolvedTheme`.

## 4. Pemisahan State: Zustand vs TanStack Query vs Domain Hooks

| Jenis State | Solusi | Lokasi | Contoh |
| :--- | :--- | :--- | :--- |
| Preferensi & Chrome UI | **Zustand** | `src/stores/useUiStore.js` | `themePreference`, `sidebarCollapsed`, `mobileDrawerOpen`, `commandPaletteOpen` |
| Server/Async Cache Generik | **TanStack Query** | `src/lib/query/queryClient.js` | Cache data non-listener & query terkontrol di fitur mendatang |
| Realtime Listeners / Domain Ops | **Domain Hooks & Services** | `src/application/`, `src/features/` | `AuthSessionProvider`, `onSnapshot` booking/notifikasi |

## 5. Strategi Build & Optimasi Bundle

`vite.config.js` memisahkan dependency menjadi chunk logis (`react-vendor`, `ui-icons`, `ui-primitives`, `ui-motion`, `ui-forms-data`, `ui-echarts`, `ui-zrender`, `firebase-core`, `firebase-firestore`), sedangkan `ChartSurface.jsx` memuat modul `echarts/*` secara **dynamic import (lazy)** agar bundle inisial aplikasi tetap ringan (`index.js` ~75.5 kB) dan setiap chunk produksi tetap jauh di bawah batas 500 kB tanpa circular warning.
