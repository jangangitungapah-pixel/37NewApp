# Phase 02 Checkpoint — Business Master Data

- **Status**: SELESAI
- **Tanggal**: 2026-11-15 (Asia/Jakarta, UTC+07:00)
- **Fase**: `02 · Business Master Data`
- **Target Firebase Project**: `musicstudio37app` (Database ID: `(default)`, Edition: `STANDARD`, `locationId: nam5`, `concurrencyMode: PESSIMISTIC`, `freeTier: true`)

---

## 1. Implementation Summary

### A. Domain Layer (`src/domain/`)
1. **Enums & Versioning Constants (`src/domain/enums/roles.js`)**:
   - Menambahkan konstanta domain Phase 02: `STUDIO_STATUS`, `SERVICE_CATEGORY`, `PRICING_MODEL`, `COMMISSION_METHOD`, `COMMISSION_BASIS`, `CUSTOMER_STATUS`, `SETTING_IDS`, `BOOKING_INITIAL_STATUS_POLICY`, `SLOT_GRANULARITY_OPTIONS`, dan `SCHEMA_VERSIONS` untuk `BUSINESS_PROFILE`, `SETTINGS`, `STUDIO`, `SERVICE`, `CUSTOMER`.
2. **Access Policies (`src/domain/policies/accessPolicy.js`)**:
   - Menambahkan helper otorisasi domain `canManageMasterData`, `canManageCustomers`, `canArchiveCustomers`, dan `filterAccessibleStudios`.
3. **Pure Validators & Defaults (`src/domain/validators/masterDataValidators.js`)**:
   - Mengimplementasikan `requireSafeInt`, `parseTimeToMinutes`, `validateOperatingHours` (`closeTime > openTime`), `validateBusinessProfile`, `createDefaultSettingsPayloads` (default `Asia/Jakarta`, `IDR`, jam `10:00–22:00`, `slotGranularityMinutes: 15`, komisi default 10% pada `settled_amount`), `validateSettingsDoc`, `validateStudio`, `validateService` (`configVersion` versi layanan, `basePriceMinor` integer IDR >= 0, `durationPricesMinor` opsional, batas komisi persentase 0..100%), dan `validateCustomer` (normalisasi `nameLower`).
4. **Deterministic Pure Calculators (`src/domain/calculations/`)**:
   - `calculateServicePrice` (`pricingCalculator.js`): kalkulasi harga IDR integer tanpa float error untuk `hourly` (prorated rounded integer), `package`, `fixed_session`, override `durationPricesMinor`, diskon, dan pajak (`Math.round`), mengembalikan frozen price snapshot lengkap beserta `configVersion`.
   - `calculateOperatorCommission` (`commissionCalculator.js`): resolusi aturan komisi efektif (`service_override` mendahului `business_default`), mendukung `percentage`, `fixed_per_booking`, dan `none` pada basis `settled_amount` atau `subtotal`.

### B. Data & Application Layer (`src/data/`, `src/application/`)
1. **Snapshot Mappers & Repositories**:
   - `src/data/mappers/masterDataMappers.js`: memetakan snapshot `profile`, `settings`, `studios`, `services`, dan `customers` melewati validator domain.
   - `src/data/repositories/businessProfileRepository.js`: langganan & upsert atomik `profile/main` (ikut menyinkronkan `name` & `timezone` pada root `businesses/{businessId}`) dan `settings/{business,schedule,pricing,commission,bookingPolicy}` dengan `configVersion` monotonik serta batch inisialisasi default.
   - `src/data/repositories/studioRepository.js`: Owner membaca seluruh studio (bounded `limit(50)`); Operator **hanya** me-query studio dalam `member.assignedStudioIds` menggunakan chunked `where('studioId', 'in', chunkIds)` (`<= 10` per chunk) untuk memenuhi scoping Security Rules.
   - `src/data/repositories/serviceRepository.js`: langganan katalog layanan terurut `[category ASC, name ASC]`, penyimpanan versi (`configVersion + 1`), dan seeding 4 starter services (Rehearsal, Recording, Mixing, Mastering).
   - `src/data/repositories/customerRepository.js`: cursor-paginated read (`fetchCustomersPage`, default `PAGE_SIZE = 20`) dengan prefix search (`nameLower`, `startAt`/`endAt`) dan query indeks komposit `[status ASC, nameLower ASC, __name__ ASC]` agar kuota Spark terjaga tanpa mengunduh histori penuh.
   - `src/data/repositories/teamRepository.js`: langganan `members` untuk Owner dan registrasi/pembaruan `members/{uid}` + `assignedStudioIds` + `permissions`.
2. **Use Cases (`src/application/use-cases/masterDataUseCases.js`)**:
   - Penjagaan offline (`isOnline === false` memblokir write master data), otorisasi role/permission (`assertOwnerAuthority`, `canManageCustomers`, `canArchiveCustomers`), dan pencegahan self-demotion/self-suspend oleh Owner aktif (`saveTeamMemberUseCase`).

### C. Shared UI, Features & Portal Routing
- **Shared Utilities & Components (`src/shared/`)**: `formatters.js` (`formatIdr`, `formatOperatingHours`, `parseDurationOptionsInput`), `useRegistrySubscription.js` (terhubung ke `subscriptionRegistry`), `ModalDialog.jsx`, dan komponen UI di `src/shared/styles/global.css`.
- **Feature Pages (`src/features/`)**:
  - `studios/StudiosPage.jsx` (Owner CRUD non-delete + toggle status; Operator read-only studio yang ditugaskan)
  - `services/ServicesPricingPage.jsx` (Owner CRUD katalog layanan, pricing model, override durasi, simulasi tarif & komisi real-time, seed 4 layanan awal; Operator read-only + simulator tarif)
  - `customers/CustomersPage.jsx` (cursor pagination `20/halaman`, filter Active/Archived, search prefix, Owner archive/restore non-delete; Operator terbatas sesuai permission `canManageCustomers` dan hanya status `active`)
  - `team/TeamManagementPage.jsx` (Owner-only: manajemen role, status, penugasan studio `assignedStudioIds`, permission flags, panduan penautan UID Spark)
  - `settings/BusinessSettingsPage.jsx` (Owner-only: tab Profil Bisnis & 5 dokumen konfigurasi tervalidasi + inisialisasi default sekali klik)
  - Pembaruan `auth/OnboardingBusinessPage.jsx` (tombol `Salin UID` untuk alur penautan tim Spark) dan `dashboard/PhaseFoundationDashboard.jsx`.
- **Routing & Navigation**:
  - Owner Portal (`src/portals/owner/`): `/owner/studios`, `/owner/services`, `/owner/customers`, `/owner/team`, `/owner/settings`, `/owner/profile`.
  - Operator Portal (`src/portals/operator/`): `/operator/studios`, `/operator/services`, `/operator/customers`, `/operator/profile` (tanpa menu `Team` maupun `Settings`).

---

## 2. Security Rules & Index Impact
1. **`firestore.rules` (Phase 02)**:
   - Membuka akses tervalidasi untuk `businesses/{businessId}/profile/main` (`get` anggota aktif; `create`/`update` Owner; `list`/`delete` false).
   - Membuka `businesses/{businessId}/settings/{settingId}` hanya untuk 5 ID valid (`business`, `schedule`, `pricing`, `commission`, `bookingPolicy`), penegakan integer/jam/batas persen dan `configVersion >= resource.data.configVersion`, `delete: false`.
   - Membuka `businesses/{businessId}/studios/{studioId}` dengan scoping ketat: Owner penuh (`delete: false`); Operator **hanya** `get` & `list` apabila `studioId in currentMember(businessId).assignedStudioIds`, tanpa hak create/update/delete.
   - Membuka `businesses/{businessId}/services/{serviceId}` (`get`/`list` anggota aktif; Owner create/update tervalidasi integer IDR & `configVersion` monotonik; Operator read-only; `delete: false`).
   - Membuka `businesses/{businessId}/customers/{customerId}` (`Owner` + Operator berizin `canManageCustomers == true`; Operator dilarang membuat/mengubah status ke `archived`; `delete: false`).
   - **Subkoleksi Phase 03+ Tetap Terkunci (`allow read, write: if false;`)**: `bookings`, `bookingSlots`, `ledgerEntries`, `commissionEntries`, `galleryAssets`, `activityLogs`, `notifications`.
2. **`firestore.indexes.json`**:
   - Menambahkan composite index `COLLECTION` untuk:
     - `studios`: `[status ASC, name ASC]`
     - `services`: `[category ASC, name ASC]` dan `[active ASC, category ASC, name ASC]`
     - `customers`: `[status ASC, nameLower ASC, __name__ ASC]`
   - Mempertahankan index `members` (`COLLECTION` & `COLLECTION_GROUP`) dan `fieldOverrides` `members.uid` `COLLECTION_GROUP`.
3. **Deployment Status**:
   - **Belum di-deploy ke Firebase live (`musicstudio37app`)** sesuai aturan larangan deploy otomatis. Seluruh uji Rules dijalankan terhadap Firebase Firestore Emulator (`--database-edition standard`, database `(default)`).

---

## 3. Known Limitations (Spark-Only & Scoping Phase 02)
1. **Onboarding Anggota Tim via UID (Spark Plan)**: Tanpa Cloud Functions atau Firebase Admin SDK, Owner tidak dapat membuat akun Auth/password untuk staf lain dari client tanpa memutus sesi aktif. Alur yang didukung: staf mendaftar/login di `/login`, menyalin Firebase Auth UID dari halaman `OnboardingBusinessPage`, lalu Owner menautkan UID tersebut beserta studio & permission di `/owner/team`.
2. **Inisialisasi Profile & Settings Awal**: Bootstrap bisnis awal di `membershipRepository.js` tetap membuat `businesses/{id}` + `members/{uid}`; dokumen `profile/main` dan 5 `settings/*` dapat diinisialisasi oleh Owner dari `/owner/settings` (atau otomatis saat pertama membuka/menyimpan konfigurasi).
3. **Pencarian Customer Berbasis Prefix**: Tanpa mesin search eksternal atau unduhan koleksi penuh, pencarian customer memakai prefix `nameLower` (`startAt`/`endAt` pada status aktif/arsip).
4. **Booking, Kalender & Keuangan Belum Dibuka**: Pembuatan booking, lock slot anti-double-booking, ledger, komisi tercatat, notifikasi, dan galeri tetap dikunci dan menunggu Phase 03–06.

---

## 4. Phase Gate Checklist (Phase 02)
- [x] `npm run lint` (`eslint .`) lulus dengan 0 error & 0 warning
- [x] `npm run test:unit` (`vitest run --project unit`: 5 test files, 21 tests — mencakup `masterDataValidatorsAndCalculations.test.js`, `accessPolicy.test.js`, `routeGuards.test.jsx`, `envConfig.test.js`, `sessionTeardown.test.js`) seluruhnya lulus
- [x] `npm run test:rules` (`firebase emulators:exec --only firestore "vitest run --project rules"`: 2 test files, 9 tests pada Standard Edition Emulator — mencakup `phase01.rules.test.js` & `phase02.rules.test.js`) seluruhnya lulus
- [x] `npm run build` (`vite build`) berhasil membangun bundle produksi bersih tanpa warning/error
- [x] `README.md`, `docs/checkpoints/phase-02-checkpoint.md`, dan `docs/handoffs/phase-03-handoff-prompt.txt` selesai ditulis
