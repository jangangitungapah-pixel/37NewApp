# Phase 05 Checkpoint — Portal Collaboration & Notifications

- **Status**: SELESAI
- **Tanggal**: 2026-11-16 (Asia/Jakarta, UTC+07:00)
- **Fase**: `05 · Portal Collaboration & Notifications`
- **Target Firebase Project**: `musicstudio37app` (Database ID: `(default)`, Edition: `STANDARD`, `locationId: nam5`, `concurrencyMode: PESSIMISTIC`, `freeTier: true`)

---

## 1. Implementation Summary

### A. Domain Contracts (`src/domain/`)
1. **Notification Enums (`src/domain/enums/roles.js`)**:
   - Menambahkan `NOTIFICATION_TYPE` (`BOOKING_CREATED`, `BOOKING_CONFIRMED`, `BOOKING_STARTED`, `BOOKING_COMPLETED`, `BOOKING_CANCELLED`, `BOOKING_RESCHEDULED`, `BOOKING_SETTLED`, `SETTLEMENT_REVIEW_REQUIRED`, `TEAM_ASSIGNMENT_UPDATED`), `NOTIFICATION_CHANNEL.IN_APP`, dan `SCHEMA_VERSIONS.NOTIFICATION`.
2. **Notification Validators & Selectors (`src/domain/validators/notificationValidators.js`)**:
   - `buildNotificationId`: ID deterministik `${type}__${eventKey}__${recipientUid}` untuk mencegah notifikasi duplikat saat operasi diulang.
   - `validateNotificationDoc`: melarang recipient wildcard (`*`/`all`), memvalidasi `actionPath` wajib berupa rute portal internal (`/owner...` atau `/operator...`), serta membatasi panjang `title` (`<=120`) & `message` (`<=300`).
   - `countUnreadNotifications`, `filterNotificationsByReadState`.

### B. Data & Application Layer (`src/data/`, `src/application/`)
1. **Mappers & Repository (`notificationMappers.js`, `notificationRepository.js`)**:
   - `subscribeMyNotifications`: listener realtime ter-scope `where('recipientUid', '==', uid)`, `orderBy('createdAt', 'desc')`, bounded `limit(30)`.
   - `subscribeBusinessActivityTimeline`: Owner mengambil maks `40` `activityLogs` terbaru bisnis; Operator **hanya** mengambil event studio dalam `assignedStudioIds` melalui chunked `where('studioId', 'in', chunkIds)` (`limit(25)` per chunk).
   - `dispatchNotificationBatch`, `markNotificationAsRead` (mengupdate `readAt: serverTimestamp()`), dan `markAllNotificationsAsRead`.
2. **Use Cases & Non-Blocking Cross-Portal Dispatch (`notificationUseCases.js`)**:
   - `dispatchNotificationSafeUseCase`: dipanggil **setelah** transaksi utama berhasil (`bookingUseCases.js`, `financeUseCases.js`, `masterDataUseCases.js`) sehingga kegagalan notifikasi sekunder tidak pernah membatalkan/mengkorupsi data utama booking/settlement.
   - `markNotificationReadUseCase` & `markAllNotificationsReadUseCase`: validasi penerima & offline block.
   - **Desain Target Notifikasi Spark-Safe**: Operator menargetkan `business.ownerUid` (tersedia pada root dokumen `businesses/{businessId}` tanpa membuka akses daftar semua `members` ke Operator), sedangkan Owner menargetkan `operatorUid` / `createdBy` booking atau anggota tim yang ditugaskan.

### C. Cross-Portal Collaboration UI (`src/features/notifications/`)
- [NotificationCenter.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/features/notifications/NotificationCenter.jsx): terpasang di topbar [PortalShell.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/app/layouts/PortalShell.jsx) untuk **Owner Portal** & **Operator Portal**, menyediakan badge unread realtime, filter Semua/Belum Dibaca, mark-as-read, mark-all-read, deep-link ke halaman target, popover responsif mobile/desktop, Escape/click-outside close, serta pembersihan listener via `SubscriptionRegistry`.
- [ActivityTimelinePage.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/features/notifications/ActivityTimelinePage.jsx): tersedia di `/owner/activity` (`Activity & Alerts`) dan `/operator/activity` (`Aktivitas Studio`) dengan filter entitas & studio, retry sinkronisasi, dan banner stale cache offline.

---

## 2. Security Rules & Index Impact
1. **`firestore.rules` (Phase 05)**:
   - Membuka `businesses/{businessId}/notifications/{notificationId}`:
     - `allow get, list`: **hanya** anggota aktif yang `resource.data.recipientUid == request.auth.uid` (Operator maupun Owner tidak dapat mengintip notifikasi akun lain).
     - `allow create`: wajib `readAt == null`, `recipientUid` ada dalam `members` bisnis (`exists(memberPath(...))`), dan Operator hanya diperbolehkan mengirim tipe event booking pada studio yang ada di `assignedStudioIds` (tidak dapat memalsukan notifikasi settlement atau perubahan tim).
     - `allow update`: hanya `recipientUid == request.auth.uid` dan **hanya** melalui `MapDiff` `affectedKeys().hasOnly(['readAt'])` dengan nilai `request.time`.
     - `allow delete: if false;`.
   - **`galleryAssets/{assetId}` tetap dikunci `allow read, write: if false;`** hingga Phase 06.
2. **`firestore.indexes.json`**:
   - Menambahkan composite index `notifications`: `[recipientUid ASC, createdAt DESC]` dan `[recipientUid ASC, readAt ASC, createdAt DESC]`.

---

## 3. Known Limitations (Spark-Only & Scoping Phase 05)
1. **Operator -> Owner Notification Target**: Karena Operator tidak diizinkan membaca koleksi lengkap `members`, aksi Operator yang membuat/menyelesaikan booking mengirimkan in-app notification kepada `business.ownerUid` (owner utama bisnis). Penugasan ke multi-operator lain tetap dikoordinasikan melalui kalender realtime & penugasan studio oleh Owner.
2. **Channel In-App Only**: Tanpa Cloud Functions/SMTP backend di paket Spark, tidak ada pengiriman push notification FCM background atau email transaksional eksternal.
3. **Belum Di-deploy ke Live**: Build Phase 05 baru tervalidasi lokal dan di Firestore Emulator `STANDARD` edition.

---

## 4. Phase Gate Checklist (Phase 05)
- [x] `npm run lint` (`eslint .`) lulus dengan 0 error & 0 warning
- [x] `npm run test:unit` (`vitest run --project unit`: 8 test files, 35 tests — mencakup `notificationValidatorsAndUseCases.test.js`) seluruhnya lulus
- [x] `npm run test:rules` (`firebase emulators:exec --only firestore "vitest run --project rules"`: 5 test files, 17 tests pada Standard Edition Emulator — mencakup `phase05.rules.test.js`) seluruhnya lulus
- [x] `npm run build` (`vite build`) berhasil membangun bundle produksi bersih tanpa error
- [x] `README.md`, `docs/checkpoints/phase-05-checkpoint.md`, dan `docs/handoffs/phase-06-handoff-prompt.txt` selesai ditulis
