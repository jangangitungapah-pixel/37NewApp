# ADR-0002: Target Firebase Project & Firestore Enterprise Named Database (`default`)

- **Status**: Locked (Phase 01 Addendum)
- **Tanggal**: 2026-11-15
- **Melengkapi**: [ADR-0001](0001-architecture-lock.md)

---

## 1. Fakta Lingkungan Terverifikasi
Saat project Firebase baru **`musicstudio37app`** diaudit read-only via Firebase CLI (`firebase apps:list`, `firebase firestore:databases:list`, `firebase hosting:sites:list`, `firebase firestore:indexes`), teramati konfigurasi berikut:
- **Project ID**: `musicstudio37app` (Web App: `studio37os`, `1:96370125934:web:49eb0cc0ccbcc941cb8a7f`, Hosting: `https://musicstudio37app.web.app`).
- **Firestore Database**: `projects/musicstudio37app/databases/default`
  - **Database ID**: `default` (**tanpa tanda kurung**, bukan `(default)`).
  - **Edition**: `ENTERPRISE` (`freeTier: true`, `locationId: asia-southeast2`).
  - **Concurrency Mode**: `OPTIMISTIC`.
  - **Data Access Mode**: `FIRESTORE_NATIVE` (`firestoreDataAccessMode: DATA_ACCESS_MODE_ENABLED`, `realtimeUpdatesMode: REALTIME_UPDATES_MODE_ENABLED`).

## 2. Konsekuensi Teknis yang Diterapkan Sejak Phase 01
1. **Explicit Database ID**:
   - Memanggil `getFirestore(app)` tanpa parameter `databaseId` mencari `(default)` dan gagal (`404 NOT_FOUND` pada `musicstudio37app`).
   - Client SDK wajib memakai `VITE_FIREBASE_DATABASE_ID` (default `"default"` di `.env.local` / `.env.example`) dan memanggil `initializeFirestore(app, settings, databaseId)` / `getFirestore(app, databaseId)` bila `databaseId !== '(default)'`.
   - `firebase.json` mengikat `"firestore": { "database": "default", "edition": "enterprise", ... }` dan `"emulators.firestore.edition": "enterprise"`.
2. **Disiplin Indexing pada Enterprise Edition**:
   - Firestore Enterprise Edition **tidak membuat single-field index otomatis**. Query tanpa index berjalan sebagai full collection scan dan memboroskan Read Units pada free tier.
   - Setiap query lintas-koleksi atau filter pada fase-fase berikutnya wajib disertai definisi index eksplisit di `firestore.indexes.json` dan memakai `__name__` saat deterministic sort order dibutuhkan.
3. **Optimistic Concurrency & Retry-Safe Transactions**:
   - Karena `concurrencyMode` adalah `OPTIMISTIC`, callback Firestore transaction (Phase 03 & 04) harus murni read-before-write, idempotent, dan bebas side effect eksternal agar aman saat retry otomatis.
4. **Environment Separation**:
   - Nilai konfigurasi project disimpan di `.env.local` (di-ignore Git) dan tidak di-hardcode di source code. `.env.example` menyediakan template bersih tanpa nilai project live.
