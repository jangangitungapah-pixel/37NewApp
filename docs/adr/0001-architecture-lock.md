# ADR-0001: Architecture Lock — 37MusicStudio

- **Status**: Locked (Phase 00 Baseline)
- **Tanggal**: 2026-11-15
- **Referensi Utama**: `37MusicStudio_Master_Architecture_Prompt.html` (v1.0)

---

## 1. Konteks & Tujuan
Membangun ulang **37MusicStudio** dari nol sebagai aplikasi web manajemen studio musik yang mendukung banyak studio/room di bawah satu bisnis (serta struktur data yang siap diperluas ke multi-business tanpa kompleksitas multi-tenant berlebihan di v1), dengan **Owner Portal** dan **Operator Portal** yang berkomunikasi melalui satu sumber kebenaran **Cloud Firestore** dalam batas kuota **Firebase Spark**.

---

## 2. Keputusan Arsitektur yang Dikunci

### 2.1 Technology Stack & Batas Infrastruktur (Non-Negotiable)
- **Application**: React + Vite + JavaScript (JSX), struktur modular berbasis fitur.
- **Authentication**: Firebase Authentication (UID sebagai identitas autentikasi utama).
- **Database**: Cloud Firestore (satu-satunya database operasional dan source of truth).
- **Hosting**: Firebase Hosting (penayangan static build SPA; bukan tempat business logic).
- **Gallery Media**: Cloudinary dengan **restricted unsigned upload preset** dan CDN transformation URLs. Metadata Gallery disimpan di Firestore.
- **Plan Limit**: **Firebase Spark plan only**.
- **Dilarang tanpa persetujuan eksplisit**: Firebase Blaze, Cloud Billing, payment method, Cloud Functions, Firebase Storage, Firebase Extensions, Cloud Run, Cloudflare Workers, backend/API berbayar, database kedua, serta penyimpanan API Secret/service account key di client bundle atau repo.

### 2.2 Arsitektur Lapisan & Shared Contracts
Satu aplikasi web tunggal menyajikan dua portal berbasis role (`owner` dan `operator`) yang wajib memakai:
1. **`src/app/`**: Router, Auth/Business providers, route guards (UX only), layouts, bootstrap.
2. **`src/portals/owner/` & `src/portals/operator/`**: Definisi route, layout, dan navigasi spesifik role.
3. **`src/features/*`**: UI, hooks, dan adapter per domain fitur (`auth`, `dashboard`, `calendar`, `bookings`, `studios`, `services`, `customers`, `team`, `finance`, `commissions`, `gallery`, `settings`).
4. **`src/application/`**: Use cases (`createBooking`, `cancelBooking`, `rescheduleBooking`, `startSession`, `completeSession`, `settleBooking`, dll.), workflow orchestration, contracts.
5. **`src/domain/`**: Entities, enums, policies, validators, calculations (pure JS; terlarang mengimpor Firebase SDK atau React UI).
6. **`src/data/`**: Firebase initialization, repositories, schema mappers, scoped queries, listener lifecycle management, dan centralized error mapping (`permission-denied`, `unavailable`, `conflict`, `validation`, `not-found`, `resource-exhausted`).
7. **`src/infrastructure/`**: Cloudinary upload/CDN adapter, logging, env config reader.
8. **`src/shared/`**: Reusable UI components, design tokens/styles, date/timezone/currency helpers, constants.

### 2.3 Firestore Data Model (Tenant-Scoped)
Seluruh data bisnis berada di bawah `businesses/{businessId}/...`, kecuali profil user global:

```text
firestore/
├── users/{uid}                         # displayName, email, photoURL (tanpa permission bisnis)
└── businesses/{businessId}/
    ├── profile/main                    # Business profile, timezone (default Asia/Jakarta), status
    ├── members/{uid}                   # role, status, assignedStudioIds, permissions, createdAt, updatedAt
    ├── studios/{studioId}              # name, code, status, timezone, operatingHours, slotGranularityMinutes
    ├── services/{serviceId}            # Rehearsal, Recording, Mixing, Mastering; durationOptions, pricingModel, active
    ├── customers/{customerId}          # Data customer ter-scope bisnis
    ├── bookings/{bookingId}            # studioId, customerId, serviceId, operatorUid, startAt, endAt, status, priceSnapshot, commissionSnapshot
    ├── bookingSlots/{slotId}           # ID deterministik: {studioId}__{localYYYYMMDD}__{bucketIndex}; 1 booking aktif per slot
    ├── ledgerEntries/{entryId}         # Immutable financial ledger; ID deterministik; koreksi via adjustment/reversal
    ├── commissionEntries/{id}          # Immutable operator commission; ID deterministik per booking & jenis komisi
    ├── galleryAssets/{assetId}         # publicId, secureUrl, format, width, height, bytes, caption, altText, order, status, uploadedBy, uploadedAt
    ├── activityLogs/{eventId}          # Append-only audit/business events dengan operationId
    ├── notifications/{id}              # In-app notifications per recipientUid
    └── settings/
        ├── business
        ├── schedule
        ├── pricing
        ├── commission
        └── bookingPolicy
```

Standar wajib setiap dokumen inti: `schemaVersion`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy` (memakai `serverTimestamp()` untuk waktu audit), serta enum terdokumentasi.

### 2.4 Security Model & Authorization Boundary
- **Deny-by-default Firestore Security Rules** disimpan sebagai source-controlled artifact (`firestore.rules`) bersama `firestore.indexes.json` dan `firebase.json`.
- **Identity & Membership**: User terautentikasi harus memiliki dokumen `businesses/{businessId}/members/{request.auth.uid}` berstatus aktif. User dilarang mengubah `role`, `status`, atau `assignedStudioIds` miliknya sendiri.
- **Role Scope**:
  - **Owner**: Akses penuh seluruh studio, master data, settings, member/role, settlement, ledger, laporan, dan gallery dalam `businessId`-nya.
  - **Operator**: Terbatas pada `assignedStudioIds`; hanya membaca data operasional yang diperlukan; hanya melihat komisi & notifikasi milik sendiri; tidak punya akses ubah pricing/commission/business settings atau settlement by default; akses Gallery mengikuti flag permission eksplisit.
- **Validasi Rules**: Cek `request.auth.uid`, active membership, role, `assignedStudioIds`, field allowlist, tipe data, status transition yang sah, dan hubungan atomik (`getAfter()` dengan tetap menjaga document access calls di bawah limit Firestore Rules).

### 2.5 Booking Engine & Concurrency Invariants
- **Slot Deterministik**: Menggunakan `bookingSlots/{slotId}` berbasis `studioId + tanggal lokal (timezone bisnis, default Asia/Jakarta) + time bucket`.
- **Granularitas & Jam Operasional**: `slotGranularityMinutes` configurable (baseline default **`15` menit**, jam operasional default **`10:00–22:00`** `Asia/Jakarta`).
- **Atomic Read-Before-Write Transaction**: Dalam satu Firestore transaction:
  1. Baca seluruh dokumen `bookingSlots` yang mencakup durasi booking (plus buffer bila aktif) terlebih dahulu.
  2. Verifikasi tidak ada slot terpakai oleh booking aktif.
  3. Tulis dokumen `bookings/{bookingId}`, seluruh `bookingSlots/{slotId}`, dan `activityLogs/{eventId}` secara atomik.
- **Transaction Safety**: Callback transaction wajib pure & idempotent (tanpa mutasi state React atau side effect eksternal selama retry). UI baru menampilkan state terkonfirmasi **setelah commit sukses**.
- **Lifecycle State Machine**:
  - `PENDING_CONFIRMATION` -> `CONFIRMED` | `CANCELLED`
  - `CONFIRMED` -> `IN_PROGRESS` | `CANCELLED`
  - `IN_PROGRESS` -> `COMPLETED_PENDING_SETTLEMENT` | `CANCELLED`
  - `COMPLETED_PENDING_SETTLEMENT` -> `SETTLED` | `SETTLEMENT_REVIEW`
  - `SETTLEMENT_REVIEW` -> `SETTLED`
- **Cancel & Reschedule**: Pembatalan melepaskan slot secara atomik bersama update status & `activityLogs`. Reschedule memvalidasi dan mengunci slot baru sekaligus melepas slot lama secara atomik (atau melalui alur aman terdokumentasi bila melewati batas transaksi aman).
- **Offline Policy**: Critical writes (confirm booking, cancel yang melepas slot, reschedule, complete session yang berdampak finansial, settlement) **wajib ditolak** ketika koneksi offline.

### 2.6 Finance, Settlement & Commission Invariants
- **Snapshot Rule**: `priceSnapshot` dan `commissionSnapshot` dibekukan saat booking dikonfirmasi sehingga perubahan tarif/komisi di masa depan tidak memengaruhi booking historis.
- **Integer Money**: Semua nominal uang disimpan dan dihitung sebagai integer (`amountMinor` = rupiah bulat untuk `IDR`, tanpa floating-point).
- **Immutability & Idempotency**: `ledgerEntries` dan `commissionEntries` memakai ID deterministik berbasis `bookingId` + jenis entry dan **tidak dapat diedit/dihapus**. Koreksi wajib membuat entry `adjustment` atau `reversal` yang mereferensikan entry asal.
- **Settlement Authority**: Default hanya dilakukan oleh **Owner**.

### 2.7 Portal Collaboration & Spark Quota Policy
- Portal tidak saling memanggil API; sinkronisasi antar-perangkat terjadi melalui Firestore realtime listeners yang **ter-scope** (`businessId`, `studioId`, status, rentang tanggal, kepemilikan user) dan selalu unsubscribe saat unmount/logout.
- Histori & laporan memakai query paginated berbasis cursor (`limit` + `startAfter`), bukan listener koleksi penuh.

### 2.8 Gallery & Cloudinary Policy
- Upload dari browser hanya memakai **restricted unsigned upload preset** (allowed formats: JPEG/PNG/WebP, disallow user-defined public ID, folder bisnis/studio terstruktur).
- Client validation (ukuran file, dimensi, MIME) berfungsi untuk UX, bukan security boundary.
- Jika upload Cloudinary sukses tetapi penyimpanan metadata Firestore gagal, UI wajib menampilkan **orphan upload state** dengan aksi retry simpan metadata dan instruksi pembersihan manual di Cloudinary Console.
- Penghapusan di aplikasi bersifat soft delete (`status: 'archived'`); penghapusan permanen aset dilakukan manual melalui Cloudinary Console.

---

## 3. Baseline Keputusan Operasional Awal (Dapat Direview Sebelum Phase 02/03)
1. **Business Scope Awal**: Single-business aktif saat login (tetap memakai struktur multi-business-ready `businesses/{businessId}`).
2. **Mata Uang**: `IDR` integer rupiah penuh.
3. **Initial Booking Status**: Dukung flag kebijakan di `settings/bookingPolicy` (default `CONFIRMED` saat dibuat staff terotorisasi, tetap mempertahankan path `PENDING_CONFIRMATION` di state machine dan Rules).
4. **Recurring Booking**: Ditunda setelah alur single booking, cancel, dan reschedule atomik stabil (Phase 03 fokus ke transaksi slot single booking terlebih dahulu).
5. **Default Operator Permission**: Kelola booking & customer operasional di `assignedStudioIds`, mulai/selesaikan sesi; tanpa hak diskon, ubah pricing/commission/business settings, atau settlement; akses Gallery berbasis permission flag member.
6. **Firebase Project Target**: **Project Firebase baru** (bukan `music-studio-2`, `music-studio-f69d8`, `studio-proper`, `studioflutter37`, atau `jadwalshifting-fd32b`).
