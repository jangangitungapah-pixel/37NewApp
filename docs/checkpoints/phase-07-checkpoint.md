# Phase 07 Checkpoint — Dashboard, Analytics & Spark-Safe Reporting

- **Status**: SELESAI
- **Tanggal**: 2026-11-16 (Asia/Jakarta, UTC+07:00)
- **Fase**: `07 · Dashboard, Analytics & Reporting`
- **Target Firebase Project**: `musicstudio37app` (Database ID: `(default)`, Edition: `STANDARD`, `locationId: nam5`, `concurrencyMode: PESSIMISTIC`, `freeTier: true`)

---

## 1. Implementation Summary

### A. Domain Analytics, Scoping & CSV Exporter (`src/domain/`)
1. **Analytics Privacy Policies ([accessPolicy.js](file:///c:/Users/hazel/source/repos/37NewApp/src/domain/policies/accessPolicy.js))**:
   - Menambahkan `canViewBusinessAnalytics(member)` (khusus Owner aktif), `filterBookingsForAnalytics(member, bookings)` (memfilter `assignedStudioIds` untuk Operator), dan `filterCommissionEntriesForAnalytics(member, entries)` (memfilter `operatorUid === member.uid` untuk Operator).
2. **Deterministic Analytics Calculator ([analyticsCalculator.js](file:///c:/Users/hazel/source/repos/37NewApp/src/domain/calculations/analyticsCalculator.js))**:
   - **Batas Kuota Spark (`MAX_ANALYTICS_RANGE_DAYS = 90`)**: `resolveAnalyticsDateWindow` mendukung preset `Hari Ini`, `7 Hari Terakhir`, `30 Hari Terakhir`, `Bulan Ini (MTD)`, dan `Rentang Kustom <= 90 hari`, serta memvalidasi `startDateKey <= endDateKey`.
   - **Pemisahan Metrik Konsisten**: Menggunakan ulang `computeFinanceSummary` dari [financeMetricsCalculator.js](file:///c:/Users/hazel/source/repos/37NewApp/src/domain/calculations/financeMetricsCalculator.js) untuk memisahkan secara eksplisit `Recognized Revenue (SETTLED)`, `Net Cash Collected` (`Payment Received - Refund + Adjustment/Reversal`), `Outstanding Settlement`, dan `Net Operator Commission`.
   - **Utilisasi Studio & Tren Harian**: `computeDashboardAnalytics` menghitung jam terpakai terhadap kapasitas jam operasional aktual studio/bisnis (`computeDailyOpenMinutes`), rincian metode pembayaran (khusus Owner), layanan populer, antrean harian, dan `bucketTrendPoints` untuk downsampling rentang hingga 90 hari ke <= 31 bar SVG.
   - Untuk Operator, `financeSummary` dikunci menjadi `null`, `paymentMethodBreakdown: []`, dan revenue studio/layanan diset `null` agar kebocoran finansial bisnis mustahil terjadi baik di UI maupun state domain.
3. **Formula-Safe CSV Exporter ([csvExporter.js](file:///c:/Users/hazel/source/repos/37NewApp/src/domain/utils/csvExporter.js))**:
   - `escapeCsvCell` dan `buildCsvDocument` menggunakan standar RFC-4180, UTF-8 BOM (`\uFEFF`) untuk Excel lokal Indonesia, serta menetralkan injeksi rumus (`=`, `+`, `-`, `@`, `\t`, `\r`) pada nilai string.
   - `buildBookingsCsvReport` menyembunyikan kolom nilai kontrak/terbayar saat diekspor oleh Operator; `buildLedgerCsvReport` memblokir total ekspor oleh non-Owner; `buildCommissionCsvReport` menyaring baris komisi strictly per UID untuk Operator.

### B. Bounded Data & Use Case Layer (`src/data/`, `src/application/`)
1. **Bounded One-Shot Repository ([analyticsRepository.js](file:///c:/Users/hazel/source/repos/37NewApp/src/data/repositories/analyticsRepository.js))**:
   - Menggunakan query on-demand `getDocs` (`limit(capLimit + 1)` dengan cap default `250`) alih-alih membuka listener historis jangka panjang pada `bookings`, `ledgerEntries`, dan `commissionEntries`.
   - Mengembalikan `{ items, reachedCap, capLimit }` agar UI segera memperingatkan pengguna bila volume transaksi melewati batas Spark 250 dokumen.
2. **Analytics Use Case ([analyticsUseCases.js](file:///c:/Users/hazel/source/repos/37NewApp/src/application/use-cases/analyticsUseCases.js))**:
   - `loadDashboardAnalyticsUseCase`: memvalidasi akses studio sebelum query, tidak memanggil `fetchLedgerAnalyticsSlice` sama sekali untuk akun Operator (`0` read terlarang), dan menyaring `commissionEntries` bila filter satu studio dipilih.

### C. Portal Dashboard & Visualisasi Ringan (`src/features/dashboard/`, `src/portals/`)
- [MetricTrendChart.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/features/dashboard/components/MetricTrendChart.jsx): grafik batang SVG murni tanpa library chart berat, dilengkapi toggle metrik Owner (`Booking Aktif`, `Recognized Revenue`, `Net Cash Masuk`), focus/hover inspection, serta label aksesibel.
- [StudioUtilizationPanel.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/features/dashboard/components/StudioUtilizationPanel.jsx): progress bar kapasitas jam operasional per studio dan ringkasan booking/cancel/no-show.
- [DashboardOverviewPage.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/features/dashboard/DashboardOverviewPage.jsx): menjadi halaman utama `/owner` ([OwnerRoutes.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/portals/owner/routes/OwnerRoutes.jsx)) dan `/operator` ([OperatorRoutes.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/portals/operator/routes/OperatorRoutes.jsx)), dilengkapi tombol toggle status modul [PhaseFoundationDashboard.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/features/dashboard/PhaseFoundationDashboard.jsx), warning batas Spark 250 dokumen, definisi metrik konsisten, dan tombol ekspor CSV.

---

## 2. Security Rules & Index Impact
- **Tidak ada perubahan diperlukan pada `firestore.rules` dan `firestore.indexes.json`**. Seluruh query Phase 07 memakai composite index yang sudah ada (`bookings [dateKey, startAt]` dan `[studioId, dateKey, startAt]`, `ledgerEntries [dateKey DESC, createdAt DESC]` dan `[studioId, dateKey DESC, createdAt DESC]`, serta `commissionEntries [dateKey DESC, createdAt DESC]` dan `[operatorUid, dateKey DESC, createdAt DESC]`).
- Ditambahkan suite Emulator [phase07.rules.test.js](file:///c:/Users/hazel/source/repos/37NewApp/tests/rules/phase07.rules.test.js) untuk memverifikasi seluruh query analitik Owner & Operator pada Firestore Emulator sekaligus memastikan penolakan keras akses lintas studio / ledger / komisi operator lain.

---

## 3. Known Limitations (Spark Architecture)
1. **Batas Kuota 90 Hari & 250 Dokumen per Slice**: Untuk menjaga paket Spark tanpa server-side pre-aggregation Cloud Functions, rentang analitik dibatasi maksimal 90 hari dan 250 dokumen per jenis koleksi per sekali muat. Bila studio berkembang melebihi 250 booking/transaksi dalam sebulan, pengguna diarahkan menggunakan preset 7 hari atau filter per studio (ditampilkan eksplisit pada banner warning UI, tidak pernah dipotong diam-diam).
2. **Belum Di-deploy Live untuk Phase 07**: Build Phase 07 baru diverifikasi di lokal dan Firestore Emulator sampai instruksi deploy diberikan.

---

## 4. Phase Gate Checklist (Phase 07)
- [x] `npm run lint` (`eslint .`) lulus dengan 0 error & 0 warning
- [x] `npm run test:unit` (`vitest run --project unit`: 10 test files, 50 tests — mencakup `analyticsAndReporting.test.js`) lulus
- [x] `npm run test:rules` (`firebase emulators:exec --only firestore "vitest run --project rules"`: 7 test files, 19 tests — mencakup `phase07.rules.test.js`) lulus tanpa skip
- [x] `npm run build` (`vite build`) lulus bersih tanpa chunk `> 500 kB`
- [x] Pemindaian kebersihan secret/bundle memastikan 0 token/kredensial terlarang di codebase maupun `dist/`
- [x] `README.md`, `docs/checkpoints/phase-07-checkpoint.md`, dan `docs/handoffs/phase-08-handoff-prompt.txt` selesai ditulis
