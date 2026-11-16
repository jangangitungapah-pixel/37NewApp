# Phase 0 Repository Audit — Premium UI Foundation 2026 (`37MusicStudio`)

- **Tanggal Audit**: 2026-11-16
- **Commit Acuan Sebelum Perubahan**: `222854409c8f9a52f89d90c1a9d1a050dba3daed`
- **Target Scope**: Audit arsitektur frontend, dependencies, styling, routing, theme, komponen UI, dan integrasi backend untuk merancang migrasi ke **Premium UI Foundation 2026** tanpa merusak fitur bisnis, logika domain, Firebase Auth/Firestore, Cloudinary, maupun Security Rules.

---

## 1. Inventaris Arsitektur Eksisting

| Area | Kondisi Eksisting | Lokasi File Utama |
| :--- | :--- | :--- |
| **Runtime & Bundler** | React `^19.1.0`, React DOM `^19.1.0`, Vite `^6.3.5`, `@vitejs/plugin-react ^4.5.0`, ESM + JSX murni | [package.json](file:///c:/Users/hazel/source/repos/37NewApp/package.json), [vite.config.js](file:///c:/Users/hazel/source/repos/37NewApp/vite.config.js) |
| **Routing & Portals** | `react-router-dom ^7.6.1`, split route lazy loading (`lazyNamed`, `RouteSuspense`), `OwnerRoutes` (`/owner/*`) & `OperatorRoutes` (`/operator/*`), guard `RouteGuards.jsx` | [AppRouter.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/app/router/AppRouter.jsx), [PortalShell.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/app/layouts/PortalShell.jsx) |
| **Styling & Design System** | CSS kustom manual unlayered, token warna hex/rgba dark-only (`Acoustic Obsidian`), belum ada Tailwind CSS v4, belum ada OKLCH tokens | [tokens.css](file:///c:/Users/hazel/source/repos/37NewApp/src/shared/styles/tokens.css), [global.css](file:///c:/Users/hazel/source/repos/37NewApp/src/shared/styles/global.css), [main.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/main.jsx) |
| **Theme Engine** | **Belum ada** — `index.html` hardcode `<meta name="color-scheme" content="dark" />`, belum mendukung Light/Dark/System mode | [index.html](file:///c:/Users/hazel/source/repos/37NewApp/index.html) |
| **UI Components** | Hanya komponen dasar minimal: `ErrorBoundary`, `ModalDialog`, `StatusFeedback` (`StatusAlert`, `ConnectionBanner`, `SessionLoadingSkeleton`), ikon `lucide-react ^0.511.0`, serta chart SVG custom ringan | [ModalDialog.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/shared/components/ModalDialog.jsx), [ErrorBoundary.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/shared/components/ErrorBoundary.jsx) |
| **State & Server Data** | `AuthSessionProvider` (React Context) + `SubscriptionRegistry` & `useRegistrySubscription` (Firestore `onSnapshot` scoped), tanpa TanStack Query / Zustand client store | [AuthSessionProvider.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/app/providers/AuthSessionProvider.jsx), [useRegistrySubscription.js](file:///c:/Users/hazel/source/repos/37NewApp/src/shared/hooks/useRegistrySubscription.js) |
| **Forms, Tables, Motion** | Form HTML terkelola manual dengan `useState`, tabel HTML polos, tanpa React Hook Form/Zod, tanpa TanStack Table/Virtual, tanpa Motion engine, tanpa Toast/Command Palette | `src/features/*` |
| **Backend & Security (Immutable)** | Firebase Auth, Cloud Firestore (`firestore.rules`, `firestore.indexes.json`), Cloudinary unsigned client adapter, seluruh domain validators & use-cases | `src/domain/`, `src/data/`, `src/application/`, `src/infrastructure/` |

---

## 2. Identifikasi Dependensi, Konflik & Strategi Reuse

1. **Dependensi Dipertahankan (Reuse)**:
   - `react ^19.1.0`, `react-dom ^19.1.0`
   - `react-router-dom ^7.6.1` (routing tetap utuh)
   - `lucide-react ^0.511.0` (ikon utama)
   - `firebase ^11.9.1` (backend adapter tidak disentuh)
   - `eslint ^9.27.0`, `vitest ^3.1.4`, `@testing-library/react ^16.3.0`, `@firebase/rules-unit-testing ^4.0.1`
2. **Evaluasi Kompatibilitas React 19 & Vite 6 (Pra-Instalasi)**:
   - `@base-ui-components/react` hanya tersedia rilis prarilis (`1.0.0-rc.0`) — **ditolak** sesuai aturan menghindari paket beta/rc. Sebagai gantinya dipilih paket resmi stabil **`@base-ui/react` (`1.9.0`)** dengan dukungan `react ^19`, beserta `date-fns ^4.0.0` dan `@date-fns/tz`.
   - `tailwindcss ^4.3.5` + `@tailwindcss/vite ^4.3.5` (resmi mendukung Vite `^6`).
   - `motion` (`14.14.0`), `sonner` (`2.0.8`), `cmdk` (`1.1.1`), `react-hook-form` (`7.92.0`), `zod` (`4.6.7`), `@hookform/resolvers` (`7.0.6`), `@tanstack/react-table` (`9.3.1`), `@tanstack/react-virtual` (`3.14.26`), `@tanstack/react-query` (`5.107.1`), `zustand` (`5.1.0`), `echarts` (`6.1.0`), `react-day-picker` (`10.0.2`), `clsx`, `tailwind-merge`, `class-variance-authority`, `tw-animate-css`.
   - Paket opsional berat seperti `gsap` dan `FullCalendar` **tidak dipasang dulu** karena Motion + CSS transitions serta grid kalender domain eksisting sudah memenuhi kebutuhan arsitektur saat ini tanpa menambah beban bundle.
3. **Konflik CSS yang Harus Diatasi**:
   - `src/shared/styles/global.css` saat ini bersifat **unlayered** (`*, .btn, .panel, .field-input, ...`) dan memakai nilai hex/rgba dark-only yang keras.
   - Di Tailwind CSS v4, style unlayered mengalahkan `@layer utilities`. Karena itu, stylesheet terpusat baru (`src/styles/themes.css` + `src/styles/globals.css`) akan membungkus reset ke `@layer base`, memindahkan kompatibilitas class legacy ke `@layer components`, dan menjembatani seluruh variabel legacy (`--bg-canvas`, `--text-primary`, dll.) ke token **OKLCH Dual-Theme** agar halaman fitur lama otomatis mendukung **Light Mode**, **Dark Mode**, dan **System Mode** dengan aman.
4. **Komponen & Infrastruktur yang Tetap Utuh**:
   - Tidak mengubah `src/domain/`, `src/data/`, `src/application/`, `src/infrastructure/`, `firestore.rules`, `firestore.indexes.json`, rute portal, maupun kontrak autentikasi/membership.
