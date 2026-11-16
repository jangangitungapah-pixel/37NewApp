# Production Deployment & Operations Checklist — 37MusicStudio

- **Target Firebase Project**: `musicstudio37app` (Database `(default)`, Edition `STANDARD`, `locationId: nam5`)
- **Plan Architecture**: Firebase Spark Plan (Auth + Firestore + Hosting) + Cloudinary Restricted Unsigned Upload

---

## 1. Pre-Deploy Safety Checks
1. **Verifikasi Target Project**:
   - Pastikan `.firebaserc` menunjuk `musicstudio37app` (`default: "musicstudio37app"`) dan **jangan pernah** mengubah atau mendeploy ke project Firebase lain pada akun Google Anda.
2. **Keamanan Environment Lokal (`.env.local`)**:
   - Pastikan `.env.local` berisi kredensial web **publik** `musicstudio37app` dan Cloudinary (`VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`).
   - Pastikan `.env.local` **tidak** ter-track Git (`git ls-files .env.local` kosong).
   - **Dilarang keras** menyimpan `CLOUDINARY_API_SECRET`, `FIREBASE_SERVICE_ACCOUNT`, atau private key di `.env*`, `src/`, atau `dist/`.
3. **Cloudinary Upload Preset Verification**:
   - Di Cloudinary Dashboard (`Settings -> Upload -> Upload Presets -> 37studioproper`):
     - Mode: **Unsigned**
     - Allowed Formats: `jpg, jpeg, png, webp`
     - Max File Size: `<= 5 MB`
     - Folder prefix: `37musicstudio`
4. **Build, Test & Emulator Parity**:
   - `npm run lint` (`0 errors, 0 warnings`)
   - `npm run test:unit` (`vitest run --project unit`)
   - `npm run test:rules` (`firebase emulators:exec --only firestore "vitest run --project rules"`)
   - `npm run build` (`vite build`, memastikan 0 chunk `> 500 kB`)

---

## 2. Deployment Command & Cache Policy
Jalankan deployment hanya setelah build & secret scan bersih:
```pwsh
npm run build
firebase deploy --project musicstudio37app --only firestore,hosting
```
Kebijakan header Hosting di [firebase.json](file:///c:/Users/hazel/source/repos/37NewApp/firebase.json):
- `/index.html`: `Cache-Control: no-cache, no-store, must-revalidate` (user langsung menerima hash JS terbaru setiap rilis)
- `/assets/**`: `Cache-Control: public, max-age=31536000, immutable` (hemat kuota bandwidth Spark Hosting)
- `**`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`

---

## 3. Post-Deploy Smoke Test Manual
1. Buka `https://musicstudio37app.web.app` (pastikan HTTP 200 tanpa error console Firebase config).
2. Login sebagai **Owner** -> cek `/owner` Analytics Dashboard (KPI finansial & utilisasi tampil normal, ekspor CSV terunduh bersih).
3. Buka `/owner/bookings` -> buat booking percobaan, ubah status hingga `COMPLETED_PENDING_SETTLEMENT`, lanjutkan settlement pada `/owner/finance` dan pastikan ledger & komisi muncul otomatis.
4. Buka `/owner/gallery` -> unggah foto PNG/JPEG `< 5 MB`, edit caption, uji archive -> filter `Diarsipkan`, lalu hapus permanen file uji secara manual di Cloudinary Console menggunakan `publicId`.
5. Login sebagai **Operator** -> pastikan redirect otomatis ke `/operator`, hanya studio di `assignedStudioIds` yang terlihat, global ledger & studio lain ditolak, notifikasi in-app tersinkron, serta ekspor `/operator` menampilkan komisi pribadi saja.

---

## 4. Rollback & Contingency Procedure
1. **Rollback UI Web**: Melalui Firebase Console (`Hosting -> Release history -> Rollback`) kembali ke versi rilis stabil sebelumnya dalam hitungan detik.
2. **Rollback Security Rules**: Checkout commit tag sebelumnya lalu jalankan `firebase deploy --project musicstudio37app --only firestore:rules`.
3. **Spark Quota Spike**: Jika kuota read mendekati batas harian, arahkan pengguna analitik untuk menggunakan preset `Hari Ini` / `7 Hari Terakhir` (semua query dashboard on-demand dibatasi `limit(250)` dan `<= 90 hari`).
