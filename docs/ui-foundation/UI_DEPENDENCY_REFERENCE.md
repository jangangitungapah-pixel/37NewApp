# UI Dependency Reference — 37MusicStudio

Referensi seluruh library frontend utama yang terpasang di `package.json`, peran arsitekturalnya, dan aturan pemakaiannya.

## 1. Daftar Dependency Produksi UI

| Package | Versi (`package.json`) | Peran & Kegunaan | Lokasi Konfigurasi / Pemakaian Utama |
| :--- | :--- | :--- | :--- |
| `react` / `react-dom` | `^19.1.0` | Core UI runtime | `src/main.jsx`, `src/app/` |
| `react-router-dom` | `^7.6.1` | Routing portal & role guards eksisting | `src/app/router/` |
| `tailwindcss` | `^4.3.5` | Utility-first styling engine v4 | `src/styles/globals.css` |
| `@tailwindcss/vite` | `^4.3.5` | Plugin Vite native untuk Tailwind v4 | `vite.config.js` |
| `tw-animate-css` | `^1.4.0` | Utilitas animasi CSS ringan kompatibel Tailwind v4 | `src/styles/globals.css` |
| `@base-ui/react` | `^1.9.0` | Primitif UI headless aksesibel (Dialog, AlertDialog, Select, Combobox, Popover, Menu, Switch, Checkbox, Radio, Tabs, Tooltip, Progress) | `src/components/ui/`, `src/components/feedback/`, `src/components/forms/` |
| `lucide-react` | `^1.73.0` | Sistem ikon vektor konsisten | Seluruh komponen & navigasi |
| `class-variance-authority` | `^0.7.1` | Deklarasi varian styling komponen terstruktur (CVA) | `buttonVariants.js`, `badgeVariants.js` |
| `clsx` & `tailwind-merge` | `^2.1.1` / `^3.7.0` | Resolusi & penggabungan class Tailwind tanpa konflik | `src/lib/utils/cn.js` |
| `@fontsource/geist-sans` | `^5.3.0` | Self-hosted primary font `Geist Sans` (400–700) | `src/main.jsx` |
| `@fontsource/inter` | `^5.3.0` | Self-hosted fallback font `Inter` (400–700) | `src/main.jsx` |
| `motion` | `^14.14.0` | Animasi UI deklaratif (`motion/react`) + `MotionConfig` global | `src/app/providers/AppProviders.jsx`, `src/components/motion/MotionPrimitives.jsx` |
| `sonner` | `^2.0.8` | Notifikasi toast adaptif Light/Dark | `src/components/feedback/AppToaster.jsx`, `toast.js` |
| `cmdk` | `^1.1.1` | Command palette pencarian cepat menu & aksi (`Ctrl+K`) | `src/components/navigation/CommandPalette.jsx` |
| `echarts` | `^6.1.0` | Visualisasi grafik modular lazy-loaded (`echarts/core`) | `src/components/data-display/ChartSurface.jsx` |
| `@tanstack/react-table` | `^9.3.1` | Headless data table engine v9 (filter, sort, pagination) | `src/components/data-display/DataTable.jsx` |
| `@tanstack/react-virtual` | `^3.14.26` | Virtualisasi DOM untuk tabel/list dataset besar | `src/components/data-display/DataTable.jsx` |
| `@tanstack/react-query` | `^5.107.1` | Cache state asinkron & query lifecycle management | `src/lib/query/queryClient.js`, `AppProviders.jsx` |
| `zustand` | `^5.1.0` | Client-only UI store (tema, sidebar collapsed, modal chrome) | `src/stores/useUiStore.js` |
| `react-hook-form` | `^7.92.0` | Manajemen formulir berkinerja tinggi | `src/lib/validation/formHelpers.js` |
| `zod` | `^4.6.7` | Validasi skema deklaratif Type-safe JS | `src/lib/validation/formHelpers.js` |
| `@hookform/resolvers` | `^7.0.6` | Adapter penghubung Zod ke React Hook Form | `src/lib/validation/formHelpers.js` |
| `date-fns` & `@date-fns/tz` | `^4.4.0` / `^1.5.0` | Manipulasi & pemformatan tanggal lokal/zona waktu studio (`id`) | `src/components/forms/DatePickerField.jsx` |
| `react-day-picker` | `^10.0.2` | Komponen kalender date picker terintegrasi Base UI Popover | `src/components/forms/DatePickerField.jsx`, `src/styles/globals.css` |

## 2. Catatan Package & Kebijakan Instalasi

- **`@fontsource/geist-sans` vs `geist`**: Paket `geist` resmi mensyaratkan framework `next`, sehingga digunakan `@fontsource/geist-sans` untuk integrasi Vite murni tanpa dependensi eksternal/CDN runtime.
- **Tidak Ada Duplikasi**: Tidak digunakan paket ganda untuk tanggung jawab yang sama (hanya satu ikon library `lucide-react`, satu state store client `zustand`, satu primitif headless `@base-ui/react`, satu engine grafik `echarts`).
- **ECharts Modularity**: Selalu impor via `echarts/core` dan registrasi komponen minimal yang dipakai (`LineChart`, `BarChart`, `PieChart`, `GridComponent`, `TooltipComponent`, `LegendComponent`, `CanvasRenderer`) melalui dynamic import agar tidak membebani bundle inisial.
