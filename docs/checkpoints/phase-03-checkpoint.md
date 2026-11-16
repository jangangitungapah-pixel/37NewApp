# Phase 03 Checkpoint — Booking Engine & Calendar

- **Status**: SELESAI
- **Tanggal**: 2026-11-16 (Asia/Jakarta, UTC+07:00)
- **Fase**: `03 · Booking Engine & Calendar`
- **Target Firebase Project**: `musicstudio37app` (Database ID: `(default)`, Edition: `STANDARD`, `locationId: nam5`, `concurrencyMode: PESSIMISTIC`, `freeTier: true`)

---

## 1. Implementation Summary

### A. Domain Layer (`src/domain/`)
1. **Booking State Machine & Enums (`src/domain/enums/roles.js`)**:
   - Menambahkan konstanta fase booking: `BASE_SLOT_BUCKET_MINUTES` (`15`), `BOOKING_STATUS` (`PENDING_CONFIRMATION`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED_PENDING_SETTLEMENT`, `SETTLEMENT_REVIEW`, `SETTLED`, `CANCELLED`, `NO_SHOW`), `BLOCKING_BOOKING_STATUSES`, `BOOKING_SLOT_STATUS` (`active`, `released`), `BOOKING_SLOT_KIND` (`session`, `buffer`), `ACTIVITY_EVENT_TYPE`, `ACTIVITY_ENTITY_TYPE`, serta `SCHEMA_VERSIONS` (`BOOKING`, `BOOKING_SLOT`, `ACTIVITY_LOG`).
2. **Access Policy (`src/domain/policies/accessPolicy.js`)**:
   - Menambahkan helper otorisasi `canManageBookings`, `canOperateStudioBooking`, dan `canApplyBookingDiscount` (mewajibkan `canManageBookings` & `assignedStudioIds` untuk Operator, serta `allowOperatorDiscount && canApplyDiscount` untuk diskon Operator).
3. **Timezone-Safe Slot Generator (`src/domain/calculations/slotGenerator.js`)**:
   - Konversi kalender IANA timezone murni tanpa library eksternal (`zonedDateTimeToDate`, `formatDateKeyInTimeZone`, `getTodayDateKey`, `getWeekDateKeys`, `addDaysToDateKey`, `isValidDateKey`).
   - Kunci slot deterministik per bucket 15 menit: `formatSlotId(studioId, dateKey, bucketIndex)` menghasilkan `${studioId}__${dateKey}__${bucketIndexPadded}` (`00..95`), mendukung `bufferMinutes` studio yang terikat hingga jam tutup (`closeTime`) serta granularitas pilihan `15 | 30 | 60` menit.
4. **Booking, Slot & Activity Validators (`src/domain/validators/bookingValidator.js`)**:
   - `PHASE03_BOOKING_TRANSITIONS`, `assertValidBookingTransition`, `assertBookingNotInPast` (dengan walk-in grace window `15` menit), `buildValidatedNewBookingPayload` (menangkap `studioSnapshot`, `serviceSnapshot` termasuk `configVersion`, `customerSnapshot`, `priceSnapshot` via `calculateServicePrice`, dan `commissionSnapshot` via `calculateOperatorCommission`), `validateBookingDoc`, `validateBookingSlotDoc`, dan `validateActivityLogDoc`.

### B. Data & Application Layer (`src/data/`, `src/application/`)
1. **Booking Mappers & Atomic Transaction Repository**:
   - `src/data/mappers/bookingMappers.js`: `mapBookingSnapshot`, `mapBookingSlotSnapshot`, `mapActivityLogSnapshot`.
   - `src/data/repositories/bookingRepository.js`:
     - `createBookingTransaction`: membaca booking ref dan **seluruh** slot refs sebelum menulis, memblokir konflik dengan `booking/slot-conflict`, lalu menulis `bookings/{bookingId}`, `bookingSlots/{slotId}` (`active`), dan `activityLogs/{eventId}` (`booking.created`) secara atomik dalam satu `runTransaction` tanpa side effect React.
     - `transitionBookingStatusTransaction`: transisi valid (`CONFIRMED`, `IN_PROGRESS`, `COMPLETED_PENDING_SETTLEMENT`, `CANCELLED`, `NO_SHOW`), melepaskan `bookingSlots` (`status: 'released'`, `bookingId: null`) secara atomik pada `CANCELLED`/`NO_SHOW`, dan mencatat `activityLogs` deterministik.
     - `rescheduleBookingTransaction`: membaca union `oldSlotIds ∪ newSlotIds`, mengecek seluruh bucket baru sebelum menulis, melepaskan slot lama di luar jadwal baru, menjaga overlap slot milik sendiri, mengklaim slot baru, menaikkan `rescheduleCount`, dan menulis `activityLogs` dalam satu `runTransaction`.
     - Query scoped & hemat kuota: `subscribeBookingsInRange` (Operator wajib memfilter `studioId ==` atau chunked `in` atas `assignedStudioIds` + rentang `dateKey`), `subscribeActiveSlotsForStudioDay` (maks 100 doc), dan `subscribeBookingActivityLogs` (`where studioId ==`, maks 25 doc).
2. **Use Cases (`src/application/use-cases/bookingUseCases.js`)**:
   - `createBookingUseCase`, `transitionBookingStatusUseCase` (mewajibkan `reason` minimal 3 karakter pada Cancel/No-Show), dan `rescheduleBookingUseCase` (mematuhi `allowSameDayReschedule` untuk Operator serta mempertahankan `priceSnapshot` historis jika durasi tidak berubah).

### C. Responsive Calendar UI & Portal Routes
- **Booking UI (`src/features/bookings/`)**:
  - `BookingCalendarPage.jsx` + `global.css`:
    - **Desktop View (`.calendar-desktop-view`)**: grid rentang tanggal/studio sebagai kolom dan jam operasional sebagai baris, filter studio & status, klik sel kosong untuk booking cepat.
    - **Mobile View (`.calendar-mobile-view`, <= 768px)**: layout khusus mobile (date pill strip 7 hari, quick slot chips terisi/bebas, dan agenda card kronologis tanpa mengecilkan tabel desktop).
  - `CreateBookingModal.jsx`: pilihan studio/tanggal/jam/layanan/durasi, quick-add customer aktif, live quote `priceSnapshot` & `commissionSnapshot`, deteksi konflik realtime, serta blokir offline eksplisit.
  - `BookingDetailModal.jsx`: detail snapshot historis, aksi lifecycle (`Konfirmasi`, `Mulai Sesi`, `Selesaikan Sesi` -> `COMPLETED_PENDING_SETTLEMENT`, `Reschedule` atomik, `No-Show`, `Cancel` + alasan), dan timeline audit `activityLogs`.
- **Portal Navigation & Routes**:
  - Owner Portal: `/owner/bookings` (`Bookings & Calendar`).
  - Operator Portal: `/operator/bookings` (`Kalender & Booking`, hanya studio yang ditugaskan).

---

## 2. Security Rules & Index Impact
1. **`firestore.rules` (Phase 03)**:
   - Membuka akses tervalidasi untuk `businesses/{businessId}/bookings/{bookingId}`, `businesses/{businessId}/bookingSlots/{slotId}`, dan `businesses/{businessId}/activityLogs/{eventId}`:
     - `bookings`: Owner penuh (`delete: false`); Operator ter-scope ke `assignedStudioIds` & `canManageBookings`; diskon Operator ditolak Rules apabila `settings/pricing.allowOperatorDiscount != true` atau `canApplyDiscount != true`; perubahan `priceSnapshot`/`commissionSnapshot` di luar reschedule durasi ditolak; transisi `SETTLEMENT_REVIEW` / `SETTLED` **masih ditolak** sampai Phase 04.
     - `bookingSlots`: ID deterministik divalidasi langsung di Rules (`slotId == studioId + '__' + dateKey + '__' + bucket`); mendukung `get` slot non-eksisten Operator via `slotId.split('__')[0] in assignedStudioIds`; melarang penimpaan slot `active` milik booking lain; `delete: false`.
     - `activityLogs`: append-only (`allow update, delete: if false`), read di-scope ke `studioId`.
   - **Subkoleksi Phase 04+ Tetap Terkunci (`allow read, write: if false;`)**: `ledgerEntries`, `commissionEntries`, `galleryAssets`, `notifications`.
   - Penyesuaian minor pada test assertion masa depan di `tests/rules/phase01.rules.test.js` dan `tests/rules/phase02.rules.test.js` untuk koleksi Phase 03 (`bookings`, `bookingSlots`, `activityLogs`) yang kini dibuka secara sah, sementara koleksi Phase 04+ tetap diuji terkunci `if false`.
2. **`firestore.indexes.json`**:
   - Menambahkan composite index `bookings` (`[dateKey, startAt]`, `[studioId, dateKey, startAt]`, `[studioId, status, dateKey, startAt]`), `bookingSlots` (`[status, dateKey, bucketIndex]`, `[studioId, status, dateKey, bucketIndex]`), dan `activityLogs` (`[studioId, entityType, entityId, createdAt DESC]`, `[studioId, createdAt DESC]`).

---

## 3. Known Limitations (Spark-Only & Phase 03 Boundaries)
1. **Belum Ada Deployment Live ke `musicstudio37app`**: Rules, index, dan aplikasi baru diuji di Firestore Emulator `STANDARD` edition.
2. **Keuangan & Settlement Menunggu Phase 04**: Sesi selesai berhenti pada status `COMPLETED_PENDING_SETTLEMENT`; belum menulis `ledgerEntries` maupun `commissionEntries`.
3. **Notifikasi Cross-Portal Menunggu Phase 05**: Sinkronisasi kalender realtime antar portal sudah berjalan melalui Firestore listeners, sedangkan bell/unread notifications disiapkan pada Phase 05.
4. **Reschedule Lintas Studio**: Mengubah studio untuk sebuah booking tidak dilakukan melalui `reschedule` in-place (karena `studioId` bersifat immutable pada `bookings` di Rules); gunakan Cancel + Booking Baru bila perlu memindah studio.

---

## 4. Phase Gate Checklist (Phase 03)
- [x] `npm run lint` (`eslint .`) lulus dengan 0 error & 0 warning
- [x] `npm run test:unit` (`vitest run --project unit`: 6 test files, 26 tests — termasuk `bookingSlotAndValidator.test.js`) seluruhnya lulus
- [x] `npm run test:rules` (`firebase emulators:exec --only firestore "vitest run --project rules"`: 3 test files, 13 tests pada Standard Edition Emulator — mencakup `phase03.rules.test.js` dengan concurrent two-client race test & 32-slot long session test) seluruhnya lulus
- [x] `npm run build` (`vite build`) berhasil membangun bundle produksi bersih tanpa error
- [x] `README.md`, `docs/checkpoints/phase-03-checkpoint.md`, dan `docs/handoffs/phase-04-handoff-prompt.txt` selesai ditulis
