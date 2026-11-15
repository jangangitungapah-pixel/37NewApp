# ADR-0002: Target Firebase Project & Firestore Database `(default)`

- **Status**: Locked (Phase 01 Addendum, diperbarui 2026-11-15)
- **Tanggal**: 2026-11-15
- **Melengkapi**: [ADR-0001](0001-architecture-lock.md)

---

## 1. Fakta Lingkungan Terverifikasi
Saat project Firebase baru **`musicstudio37app`** diaudit read-only via Firebase CLI (`firebase apps:list`, `firebase firestore:databases:list --project musicstudio37app --json`, `firebase hosting:sites:list`, `firebase firestore:indexes --database "(default)"`), konfigurasi aktif yang teramati adalah:
- **Project ID**: `musicstudio37app` (Web App: `studio37os`, `1:96370125934:web:49eb0cc0ccbcc941cb8a7f`, Hosting: `https://musicstudio37app.web.app`).
- **Firestore Database**: `projects/musicstudio37app/databases/(default)` (dibuat ulang pada `2026-11-15T08:08:22Z`, menggantikan instance named database `default` sebelumnya).
  - **Database ID**: `(default)` (standar Cloud Firestore default database).
  - **Edition**: `STANDARD` (`FIRESTORE_NATIVE`, `freeTier: true`, `locationId: nam5`).
  - **Concurrency Mode**: `PESSIMISTIC`.
  - **Realtime Mode**: `REALTIME_UPDATES_MODE_ENABLED`.

## 2. Konsekuensi Teknis yang Diterapkan
1. **Target Database `(default)`**:
   - Client SDK membaca `VITE_FIREBASE_DATABASE_ID` (default `"(default)"` di `.env.local`, `.env.example`, dan `env.js`) dan memanggil `initializeFirestore(app, {})` / `getFirestore(app)` saat nilainya `"(default)"` (tetap mendukung override named database jika `VITE_FIREBASE_DATABASE_ID !== '(default)'`).
   - `firebase.json` mengikat `"firestore": { "database": "(default)", "rules": "firestore.rules", "indexes": "firestore.indexes.json" }` serta Firestore Emulator standar (`port: 8080`).
2. **Disiplin Indexing untuk Query & `COLLECTION_GROUP`**:
   - Meskipun Firestore Standard Edition menyediakan single-field index otomatis pada scope `COLLECTION`, query `collectionGroup(db, 'members').where('uid', '==', uid)` tetap memerlukan `fieldOverrides` eksplisit untuk `members.uid` pada scope `COLLECTION_GROUP`, serta composite index di `firestore.indexes.json` untuk setiap query multi-field/rentang tanggal pada fase berikutnya.
3. **Transaction & Concurrency Safety**:
   - Semua Firestore transaction (khususnya Phase 03 & 04) tetap mengikuti pola pure read-before-write & idempotent agar aman saat retry otomatis di client maupun emulator.
4. **Environment Separation**:
   - Nilai konfigurasi project disimpan di `.env.local` (di-ignore Git) dan tidak di-hardcode di source code. `.env.example` menyediakan template bersih tanpa nilai project live.
