# Phase 00 — Discovery & Repository Audit

- **Tanggal Audit**: 2026-11-15 (Asia/Jakarta, UTC+07:00)
- **Workspace Target**: `c:\Users\hazel\source\repos\37NewApp`
- **Sumber Requirement**: `c:\Users\hazel\Downloads\37MusicStudio_Master_Architecture_Prompt.html` (Version 1.0, 15 November 2026) — diperiksa via pembacaan dokumen penuh dan verifikasi render penuh di Chrome (`127.0.0.1:9222`, 17 section dan 7 diagram Mermaid tanpa error).

---

## 1. Audit Repository Lokal Awal

| Item | Kondisi Awal Terverifikasi | Catatan |
| :--- | :--- | :--- |
| Isi direktori `37NewApp` | Kosong (`0` file, `0` subdirektori) pada pemeriksaan `14:03` | Greenfield clean start; tidak ada legacy code, `package.json`, `firebase.json`, atau `.firebaserc`. |
| Git status & remote | Pada `14:03` belum berupa Git repo; pada `14:16:59` user menginisialisasi `main` (`5829d22`, `first commit`) dengan remote `origin` (`https://github.com/jangangitungapah-pixel/37NewApp.git`) | `5829d22` sempat melacak `firebase-debug.log` (log CLI lokal). Di Phase 00 file tersebut di-untrack via `git rm --cached` + `.gitignore` tanpa menulis ulang history `origin/main`. |
| Konfigurasi Git global | `user.name=jangangitungapah-pixel`, `user.email=jangangitungapah@gmail.com` | Terbaca dari `C:/Users/hazel/.gitconfig`. |

---

## 2. Audit Toolchain & Runtime Lokal

| Tool / Runtime | Versi Terverifikasi | Kesiapan untuk Rebuild |
| :--- | :--- | :--- |
| **Node.js** | `v24.19.0` | Siap untuk React + Vite + Vitest/testing toolchain. |
| **npm** | `11.17.0` | Siap untuk package management & scripts. |
| **Git** | `2.55.0.windows.3` | Siap untuk version control lokal. |
| **Firebase CLI** | `15.28.1` | Login aktif sebagai `marsicprod@gmail.com`. |
| **Java (JDK)** | `26` (`2026-03-17`) | Siap untuk menjalankan Firebase Local Emulator Suite (Firestore & Auth Rules testing). |
| **Python** | `3.14.3` | Tersedia di environment. |
| **Flutter / Dart** | Tidak terpasang | Bukan bagian dari stack target. |

---

## 3. Audit Read-Only Firebase Projects pada Akun Aktif

Audit read-only dijalankan terhadap daftar project Firebase pada akun `marsicprod@gmail.com` tanpa mengubah pengaturan, rules, indexes, maupun data apa pun.

| Project ID | Display Name | Apps Terdaftar | Firestore `(default)` | Hosting Sites | Custom Composite Indexes | Status untuk `37NewApp` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `jadwalshifting-fd32b` | Jadwalshifting | Tidak diaudit lebih lanjut | Tidak diaudit lebih lanjut | Tidak diaudit lebih lanjut | Tidak diaudit lebih lanjut | **DO NOT TOUCH** |
| `music-studio-2` | 37 Music Studio 2 | 1 Web App (`37 Music Studio`) | `asia-southeast2`, `FIRESTORE_NATIVE`, `freeTier: true` | `music-studio-2.web.app`, `tigatujuhmusicstudio.web.app` | `0` indexes | **DO NOT TOUCH** (project eksisting) |
| `music-studio-f69d8` | 37 Music Studio | 1 Web App (`37 Music Studio`) | `asia-southeast2`, `FIRESTORE_NATIVE`, `freeTier: true` | `music-studio-f69d8.web.app` | `0` indexes | **DO NOT TOUCH** (project eksisting) |
| `studio-proper` | 37 studio proper | 1 Web App (`37studioproper-web`) | `nam5`, `FIRESTORE_NATIVE`, `freeTier: true` | `studio-37.web.app`, `studio-proper.web.app` | `3` indexes (`customerFollowUpEvents`, `customerFollowUpTasks`) | **DO NOT TOUCH** (project eksisting) |
| `studioflutter37` | 37studioflutter | 4 Apps (Android, iOS, Windows, Web) | `asia-southeast2`, `FIRESTORE_NATIVE`, `freeTier: true` | `studioflutter37.web.app` | Tidak diaudit | **DO NOT TOUCH** (project eksisting) |

### Keputusan Project Firebase (Arahan Eksplisit User)
- User menginstruksikan secara eksplisit bahwa **`37NewApp` akan menggunakan project Firebase yang BARU dan TIDAK memakai project eksisting mana pun** di atas.
- Seluruh project eksisting di atas ditandai **out-of-scope / preserved untouched** agar data, konfigurasi, maupun layanan produksi/eksperimen yang ada di dalamnya tetap aman sepenuhnya.

---

## 4. Aset yang Dipertahankan vs Ketergantungan Baru

- **Aset yang dipertahankan di repo `37NewApp`**: Tidak ada aset legacy karena direktori awal kosong.
- **Aset eksternal yang dilindungi**: Kelima project Firebase eksisting pada akun `marsicprod@gmail.com` tidak boleh ditargetkan untuk deploy, penghapusan data, atau perubahan rules/indexes.
- **Binding eksternal yang dibutuhkan pada/menjelang integrasi live (Phase 01+)**:
  1. Pembuatan/pemilihan **Firebase Project ID baru** (untuk `.firebaserc` alias `default`/dev-prod separation dan konfigurasi Web App SDK di `.env.local`).
  2. Konfigurasi **Cloudinary** (`VITE_CLOUDINARY_CLOUD_NAME` dan `VITE_CLOUDINARY_UPLOAD_PRESET` tipe *unsigned* dengan pembatasan format & disallow custom public ID, tanpa API Secret).
  3. Untuk validasi lokal Phase 01–08 sebelum project Firebase baru terikat, arsitektur menggunakan konfigurasi terisolasi via `.env.example` / `.env.local` dan **Firebase Local Emulator Suite** (Auth + Firestore Emulator dengan project ID lokal demo/emulator) agar Rules, transaksi, dan isolasi tenant dapat diuji secara deterministik tanpa menyentuh project live mana pun.
