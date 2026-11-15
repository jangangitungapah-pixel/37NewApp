# Phase 01 Checkpoint — Application Foundation & Firebase Security

- **Status**: SELESAI
- **Tanggal**: 2026-11-15 (Asia/Jakarta, UTC+07:00)
- **Fase**: `01 · Application Foundation & Firebase Security`
- **Target Firebase Project**: `musicstudio37app` (Database ID: `(default)`, Edition: `STANDARD`, `locationId: nam5`, `concurrencyMode: PESSIMISTIC`, `freeTier: true`)

---

## 1. Implementation Summary
1. **Modular React + Vite + JavaScript Scaffold (`src/`)**:
   - Menyusun arsitektur berlapis sesuai Section 11 Master Prompt: `app/`, `portals/{owner,operator}/`, `features/{auth,dashboard}/`, `domain/{enums,policies,validators}/`, `application/use-cases/`, `data/{firebase,mappers,repositories,subscriptions}/`, `infrastructure/{config,logging}/`, dan `shared/{components,styles}/`.
   - Menambahkan ErrorBoundary, ConnectionBanner (deteksi `offline` & `fromCache` stale), SessionLoadingSkeleton, serta UI shell responsif (sidebar desktop + drawer mobile).
2. **Firebase Initialization & Environment Separation**:
   - Memisahkan konfigurasi melalui `.env.example` (template bersih) dan `.env.local` (gitignored, terhubung ke Web App `studio37os` milik `musicstudio37app`).
   - Menargetkan database Firestore `(default)` melalui `VITE_FIREBASE_DATABASE_ID=(default)` (`initializeFirestore(app, {})` / `getFirestore(app)` + `firebase.json` `"database": "(default)"`), plus dukungan opt-in Firebase Local Emulator Suite & App Check.
   - Mendokumentasikan addendum teknis pada [ADR-0002](../../docs/adr/0002-firestore-target-database.md).
3. **Identity, Membership, Guards & Clean Logout**:
   - Memisahkan profil global `users/{uid}` (dilarang mengandung permission bisnis) dari membership bisnis `businesses/{businessId}/members/{uid}`.
   - Implementasi bootstrap atomik bisnis awal + founder Owner (`writeBatch`), route guards UX (`RequireActiveRole`, `RedirectIfAuthenticated`, `RequireSessionStatus`, `RootRedirect`), dan `SubscriptionRegistry` terpusat untuk memastikan seluruh Firestore listener di-unsubscribe sinkron saat logout/unmount.
4. **Deny-by-Default Firestore Security Rules & Indexes**:
   - Menulis `firestore.rules` dengan catch-all deny-by-default, validasi field allowlist/tipe/timestamp (`request.time`), atomic business bootstrap via `getAfter()`, proteksi self-elevation Operator & self-demotion Owner, serta mengunci seluruh subkoleksi Phase 02+ (`if false`) sampai fase masing-masing dikerjakan.
   - Menulis `firestore.indexes.json` mencakup composite index `members` dan `fieldOverrides` `COLLECTION_GROUP` untuk `members.uid` agar query `collectionGroup('members')` berjalan tanpa kegagalan missing index.

---

## 2. Data, Security Rules & Index Impact
- **File Rules & Indexes Ditambahkan di Repo**: `firebase.json`, `.firebaserc` (`default -> musicstudio37app`), `firestore.rules`, `firestore.indexes.json`.
- **Deployment Status**: **Belum di-deploy ke Firebase live** (sesuai Rule 6: dilarang deploy ke production tanpa persetujuan eksplisit). Seluruh validasi Rules dijalankan secara lokal pada Firestore Emulator (`Standard Edition`, database `(default)`).
- **Project Eksisting**: Tidak ada project Firebase eksisting yang disentuh atau diubah.

---

## 3. Known Limitations & Prasyarat Sebelum Uji Live
1. **Belum Ada Deployment Rules/Hosting ke `musicstudio37app`**: File rules, index, dan hosting siap di repo, namun belum pernah di-`firebase deploy` ke project live.
2. **Authentication Providers di Firebase Console**: Sebelum melakukan login/registrasi live pada `musicstudio37app`, pastikan provider **Email/Password** sudah diaktifkan di Firebase Console (`Authentication -> Sign-in method`).
3. **Modul Operasional Phase 02–07 Belum Dibuka**: Subkoleksi `studios`, `services`, `customers`, `bookings`, `bookingSlots`, `ledgerEntries`, `commissionEntries`, `galleryAssets`, `activityLogs`, `notifications`, dan `settings` sengaja masih dikunci (`allow read, write: if false;`) dan belum memiliki UI/use case pada Phase 01.
4. **Cloudinary Env**: `VITE_CLOUDINARY_CLOUD_NAME` dan `VITE_CLOUDINARY_UPLOAD_PRESET` masih kosong sampai Phase 06.

---

## 4. Phase Gate Status & Readiness ke Phase 02
- [x] `eslint .` lulus dengan 0 error & 0 warning
- [x] Unit test (`vitest --project unit`: domain validators, access policy, SubscriptionRegistry teardown, error mapper, route guards) seluruhnya lulus
- [x] Firestore Rules Emulator test (`vitest --project rules` di Firestore Emulator) seluruhnya lulus
- [x] `npm run build` produksi Vite berhasil tanpa chunk warning/error
- [x] Tidak ada API Secret atau service account key di repository maupun hasil build `dist/`
- [x] Dokumentasi checkpoint Phase 01 & handoff prompt Phase 02 tersedia
