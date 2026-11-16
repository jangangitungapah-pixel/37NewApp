# Phase 06 Checkpoint — Gallery & Cloudinary

- **Status**: SELESAI
- **Tanggal**: 2026-11-16 (Asia/Jakarta, UTC+07:00)
- **Fase**: `06 · Gallery & Cloudinary`
- **Target Firebase Project**: `musicstudio37app` (Database ID: `(default)`, Edition: `STANDARD`, `locationId: nam5`, `concurrencyMode: PESSIMISTIC`, `freeTier: true`)

---

## 1. Implementation Summary

### A. Cloudinary Client Infrastructure (`src/infrastructure/cloudinary/cloudinaryClient.js`)
1. **Konfigurasi Publik & Bebas Secret**:
   - Hanya membaca `VITE_CLOUDINARY_CLOUD_NAME` dan `VITE_CLOUDINARY_UPLOAD_PRESET` via `getAppConfig().cloudinary` pada [env.js](file:///c:/Users/hazel/source/repos/37NewApp/src/infrastructure/config/env.js).
   - **API Secret & API Key Cloudinary dilarang keras berada di `.env*`, `src/`, `docs/`, `tests/`, ataupun bundle `dist/`** (sudah diisi di `.env.local` gitignored hanya dengan `cloudName` dan unsigned `uploadPreset` publik).
2. **Pre-Upload Validation & Memory Safety**:
   - `validateImageFileForUpload`: menerima hanya MIME `image/jpeg`, `image/png`, `image/webp` dengan ukuran `> 0` dan `<= 5 MB` (`5 * 1024 * 1024` bytes).
   - `inspectImageDimensions`: membaca resolusi alami gambar di browser dengan blok `try ... finally` agar `URL.revokeObjectURL(objectUrl)` selalu terpanggil baik saat sukses maupun saat gambar rusak/melebihi batas dimensi (`12000px`).
3. **Restricted Unsigned Upload & CDN Delivery**:
   - `uploadImageToCloudinary`: mengirim `POST` `FormData` ke `https://api.cloudinary.com/v1_1/<cloudName>/image/upload` dengan field `file`, `upload_preset`, dan `folder` tersanitasi (`37musicstudio/<businessId>[/<studioId>]`), tanpa mengirimkan user-controlled `public_id` maupun kredensial signed apa pun, serta memverifikasi `secure_url` respons diawali `https://res.cloudinary.com/`.
   - `buildCloudinaryImageUrl`: membentuk URL delivery teroptimasi `f_auto,q_auto,c_<crop>,w_<width>` tanpa menduplikasi segmen transformasi bila URL sudah tertransformasi.

### B. Domain Contracts, Data & Application (`src/domain/`, `src/data/`, `src/application/`)
1. **Domain Enums, Policy & Validators**:
   - [roles.js](file:///c:/Users/hazel/source/repos/37NewApp/src/domain/enums/roles.js): `GALLERY_ASSET_STATUS` (`active`, `archived`), `GALLERY_IMAGE_FORMATS` (`jpg`, `jpeg`, `png`, `webp`), dan `SCHEMA_VERSIONS.GALLERY_ASSET`.
   - [accessPolicy.js](file:///c:/Users/hazel/source/repos/37NewApp/src/domain/policies/accessPolicy.js): `canManageGallery(member)` (Owner atau Operator dengan `permissions.canManageGallery == true`) dan `canArchiveGalleryAsset(member)` (Owner-only).
   - [galleryValidators.js](file:///c:/Users/hazel/source/repos/37NewApp/src/domain/validators/galleryValidators.js): `validateGalleryAssetDoc`, `validateGalleryMetadataInput`, `isValidCloudinarySecureUrl`, dan `sortGalleryAssets` deterministik (`order asc`, `createdAt desc`, `assetId asc`).
2. **Mappers, Repository & Use Cases**:
   - [galleryMappers.js](file:///c:/Users/hazel/source/repos/37NewApp/src/data/mappers/galleryMappers.js) dan [galleryRepository.js](file:///c:/Users/hazel/source/repos/37NewApp/src/data/repositories/galleryRepository.js): `subscribeGalleryAssets` ter-scope (`where('status', ...)` / `where('studioId', ...)` + `limit(60)`), `createGalleryAssetDoc`, `updateGalleryAssetMetadata`, dan `setGalleryAssetArchiveStatus`.
   - [galleryUseCases.js](file:///c:/Users/hazel/source/repos/37NewApp/src/application/use-cases/galleryUseCases.js): `uploadGalleryAssetUseCase`, `retrySaveOrphanGalleryMetadataUseCase` (memulihkan aset yang sudah sukses terunggah ke Cloudinary ketika penyimpanan Firestore gagal tanpa upload ulang), `updateGalleryAssetDetailsUseCase`, dan `setGalleryAssetArchiveStatusUseCase`.

### C. Portal UI & Code Splitting (`src/features/gallery/`, `src/portals/`, `src/app/router/`)
- [GalleryPage.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/features/gallery/GalleryPage.jsx): terpasang di `/owner/gallery` (`Gallery & Media`) dan `/operator/gallery` (`Galeri Studio`), mencakup:
  - Status kesiapan konfigurasi Cloudinary, badge hak akses, serta pengingat eksplisit kebijakan soft-archive vs manual delete CDN di Cloudinary Console.
  - **Orphan Upload Recovery Banner**: menyimpan `publicId`, preview thumbnail, metadata, serta tombol **"Simpan Ulang Metadata ke Firestore"** atau **"Salin Public ID"** saat penyimpanan Firestore gagal setelah upload Cloudinary sukses.
  - Modal Upload dengan preview client-side + pembersihan `URL.revokeObjectURL`, Edit Metadata modal, Soft-Archive / Restore (khusus Owner), Lightbox Preview, serta filter Status (`Aktif`/`Diarsipkan`) dan Studio.
- Route lazy-splitting melalui [lazyNamed.js](file:///c:/Users/hazel/source/repos/37NewApp/src/app/router/lazyNamed.js) dan [RouteSuspense.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/app/router/RouteSuspense.jsx) pada [AppRouter.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/app/router/AppRouter.jsx), [OwnerRoutes.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/portals/owner/routes/OwnerRoutes.jsx), dan [OperatorRoutes.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/portals/operator/routes/OperatorRoutes.jsx) menjaga seluruh chunk produksi jauh di bawah 500 kB.
- [PhaseFoundationDashboard.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/features/dashboard/PhaseFoundationDashboard.jsx) diperbarui menjadi Phase 06 aktif (Phase 07 berikutnya).

---

## 2. Security Rules & Index Impact
1. **`firestore.rules` (Phase 06)**:
   - Membuka `businesses/{businessId}/galleryAssets/{assetId}`:
     - `allow read`: semua anggota aktif bisnis (`hasActiveMembership(businessId)`).
     - `allow create`: hanya `canManageGallery(businessId)` dengan `status == 'active'`, `secureUrl` wajib diawali `https://res.cloudinary.com/`, format tervalidasi (`jpg|jpeg|png|webp`), dimensi/ukuran positif, `uploadedBy == request.auth.uid`, dan `serverTimestamp()` pada `uploadedAt`/`createdAt`/`updatedAt`.
     - `allow update`: menggunakan `MapDiff` (`affectedKeys().hasOnly(...)`) agar seluruh field biner Cloudinary (`publicId`, `secureUrl`, `format`, `width`, `height`, `bytes`, `uploadedBy`, `uploadedAt`, `createdAt`, `businessId`, `assetId`) **immutable**; Operator berizin hanya boleh mengubah `studioId`, `caption`, `altText`, `order`, sementara perubahan `status` (`active` <-> `archived`) dibatasi ketat untuk `isOwner(businessId)`.
     - `allow delete: if false;` (hard delete permanen diblokir di Firestore; pembersihan CDN dilakukan manual di Cloudinary Console).
2. **`firestore.indexes.json`**:
   - Menambahkan composite index `galleryAssets`:
     - `[status ASC, order ASC, createdAt DESC]`
     - `[studioId ASC, status ASC, order ASC, createdAt DESC]`

---

## 3. Known Limitations & Security Advisory (Spark + Unsigned Cloudinary)
1. **Penghapusan Permanen Asset Cloudinary**: Karena arsitektur Spark pure-client tidak menjalankan server/Cloud Function penanda-tangan API Secret, aksi hapus di aplikasi hanya mengarsipkan dokumen Firestore (`status: 'archived'`). Hapus file fisik CDN hanya dilakukan manual di Media Library Cloudinary Console menggunakan `publicId`.
2. **Keamanan Unsigned Upload Preset**: Karena unsigned preset memakai `cloudName` dan nama preset publik pada frontend, pastikan di Cloudinary Dashboard Upload Preset (`37studioproper`) mengaktifkan restriksi: Allowed Formats (`jpg, png, webp`), Max File Size (`<= 5 MB`), folder pembatas `37musicstudio`, dan disarankan merotasi API Secret Cloudinary jika pernah dibagikan pada log/chat sebelumnya (jangan pernah menaruh API Secret di repo/frontend).
3. **Belum Di-deploy Live untuk Phase 06**: Perubahan Rules, Index, dan frontend Phase 06 baru terverifikasi di lokal & Firestore Emulator sampai perintah deploy diminta.

---

## 4. Phase Gate Checklist (Phase 06)
- [x] `npm run lint` (`eslint .`) lulus dengan 0 error & 0 warning
- [x] `npm run test:unit` (`vitest run --project unit`: 9 test files, 44 tests — termasuk `galleryAndCloudinary.test.js`) lulus
- [x] `npm run test:rules` (`firebase emulators:exec --only firestore "vitest run --project rules"`: 6 test files, 18 tests — termasuk `phase06.rules.test.js`, di Firestore Emulator Standard Edition) lulus tanpa skip
- [x] `npm run build` (`vite build`) lulus bersih tanpa peringatan chunk `> 500 kB`
- [x] Pemindaian kebersihan file ter-track & `dist/` memastikan 0 API Secret / key privat terbawa
- [x] `README.md`, `docs/checkpoints/phase-06-checkpoint.md`, dan `docs/handoffs/phase-07-handoff-prompt.txt` selesai ditulis
