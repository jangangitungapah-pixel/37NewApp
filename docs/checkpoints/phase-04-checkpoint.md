# Phase 04 Checkpoint — Session, Settlement, Ledger & Commission

- **Status**: SELESAI
- **Tanggal**: 2026-11-16 (Asia/Jakarta, UTC+07:00)
- **Fase**: `04 · Session, Settlement, Ledger & Commission`
- **Target Firebase Project**: `musicstudio37app` (Database ID: `(default)`, Edition: `STANDARD`, `locationId: nam5`, `concurrencyMode: PESSIMISTIC`, `freeTier: true`)

---

## 1. Implementation Summary

### A. Domain Layer (`src/domain/`)
1. **Enums & Financial Contracts (`src/domain/enums/roles.js`)**:
   - Menambahkan `PAYMENT_METHOD` (`cash`, `transfer`, `qris`, `card`, `other`), `LEDGER_ENTRY_TYPE` (`PAYMENT_RECEIVED`, `REFUND`, `ADJUSTMENT`, `REVERSAL`), `LEDGER_DIRECTION` (`inflow`, `outflow`), `COMMISSION_ENTRY_TYPE` (`EARNED`, `ADJUSTMENT`, `REVERSAL`), `COMMISSION_DIRECTION` (`credit`, `debit`), `COMMISSION_ENTRY_STATUS` (`RECORDED`, `ADJUSTED`, `REVERSED`), serta `ACTIVITY_EVENT_TYPE` / `ACTIVITY_ENTITY_TYPE` dan `SCHEMA_VERSIONS` untuk `LEDGER_ENTRY` & `COMMISSION_ENTRY`.
2. **Access Policies (`src/domain/policies/accessPolicy.js`)**:
   - Menambahkan `canSettleBookings` (strictly Owner-only secara default Spark policy), `canViewBusinessLedger` (Owner-only), dan `canViewCommissionEntry` (Owner semua; Operator hanya miliknya via `entry.operatorUid === member.uid`).
3. **Booking Transitions & Financial Validators (`src/domain/validators/`)**:
   - Memperbarui `bookingValidator.js` (`BOOKING_TRANSITIONS`) agar mengizinkan transisi settlement `COMPLETED_PENDING_SETTLEMENT -> SETTLEMENT_REVIEW | SETTLED` dan `SETTLEMENT_REVIEW -> SETTLED`, mendukung metadata `settlement`, serta `entityType` log keuangan (`ledger_entry`, `commission_entry`).
   - Menambahkan `financeValidators.js`: ID deterministik (`buildSettlementPaymentEntryId` -> `settlement_payment__${bookingId}`, `buildEarnedCommissionEntryId` -> `commission_earned__${bookingId}`, `buildLedgerReversalEntryId`, `buildCommissionReversalEntryId`), `validateSettlementInput`, `validateLedgerEntryDoc` (wajib integer IDR >= 0 dan mewajibkan `relatedEntryId` + `reason` >= 3 karakter pada `ADJUSTMENT`/`REVERSAL`/`REFUND`), dan `validateCommissionEntryDoc`.
4. **Pure Commission & KPI Calculators (`src/domain/calculations/financeMetricsCalculator.js`)**:
   - `computeSettlementCommissionSnapshot`: menghitung komisi settlement final dari aturan historis `booking.commissionSnapshot` (`method`, `rateOrValue`, `basis`) sehingga perubahan master settings tidak menimpa deal lama.
   - `computeFinanceSummary`: memisahkan dengan tegas 6+ metrik keuangan (`recognizedRevenueMinor`, `paymentReceivedMinor`, `refundTotalMinor`, `netAdjustmentMinor`, `netCashCollectedMinor`, `outstandingBalanceMinor`, `netCommissionMinor` + `commissionByOperator`) tanpa mencampur booking pending/cancelled dengan revenue settled.

### B. Data & Application Layer (`src/data/`, `src/application/`)
1. **Mappers & Atomic Finance Repository (`financeMappers.js`, `financeRepository.js`)**:
   - `settleBookingTransaction`: membaca `booking`, `settlement_payment__${bookingId}`, dan `commission_earned__${bookingId}` di awal `runTransaction` untuk idempotensi/anti-duplikasi, lalu atomik memperbarui booking -> `SETTLED` + menulis `ledgerEntries`, `commissionEntries`, dan `activityLogs` dalam satu transaction.
   - `requestSettlementReviewTransaction`: memindahkan `COMPLETED_PENDING_SETTLEMENT -> SETTLEMENT_REVIEW` beserta alasan koreksi.
   - `recordLedgerAdjustmentTransaction` & `recordCommissionAdjustmentTransaction`: append-only koreksi (`REFUND`, `ADJUSTMENT`, dan deterministic `REVERSAL`) tanpa mengedit atau menghapus catatan historis.
   - Queries ter-scope: `subscribeSettlementQueue` (limit 60), `subscribeLedgerEntriesInRange` (Owner, filter tanggal + studio), dan `subscribeCommissionEntriesInRange` (Operator **wajib** `where('operatorUid', '==', member.uid)`).
2. **Use Cases (`src/application/use-cases/financeUseCases.js`)**:
   - `settleBookingUseCase`, `requestSettlementReviewUseCase`, `recordLedgerAdjustmentUseCase`, `recordCommissionAdjustmentUseCase` dengan penjagaan offline block (`network/offline-write-blocked`) dan authority Owner (`authz/owner-settlement-only`).

### C. Finance & Commission UI (`src/features/finance/`, Portals)
- Owner Portal (`/owner/finance`): [FinanceSettlementPage.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/features/finance/FinanceSettlementPage.jsx), [SettleBookingModal.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/features/finance/SettleBookingModal.jsx), [AdjustmentModal.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/features/finance/AdjustmentModal.jsx) + tautan cepat dari [BookingDetailModal.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/features/bookings/BookingDetailModal.jsx).
- Operator Portal (`/operator/commissions`): [OperatorCommissionsPage.jsx](file:///c:/Users/hazel/source/repos/37NewApp/src/features/finance/OperatorCommissionsPage.jsx) menampilkan komisi pribadi ter-scope tanpa eksposur ledger kas studio.

---

## 2. Security Rules & Index Impact
1. **`firestore.rules` (Phase 04)**:
   - Membuka `businesses/{businessId}/ledgerEntries/{entryId}` (Owner read/create; `relatedEntryId` diverifikasi `exists(...)`; `allow update, delete: if false`) dan `businesses/{businessId}/commissionEntries/{entryId}` (Owner read/create; Operator hanya read milik `operatorUid == request.auth.uid`; `allow update, delete: if false`).
   - Memperketat `bookings/{bookingId}` `allow update` memakai `MapDiff` (`diff(resource.data).affectedKeys().hasOnly(...)`) agar tetap jauh di bawah batas 1.000 ekspresi runtime Firestore sekaligus memaksa `existsAfter(...)` pada `ledgerEntries` & `commissionEntries` saat transisi menuju `SETTLED` (Owner-only).
   - Memperluas `activityLogs` untuk `booking.settled`, `booking.settlement_review`, `ledger.adjusted`, `commission.adjusted` khusus Owner, while keeping `galleryAssets` and `notifications` strictly locked (`allow read, write: if false;`).
2. **`firestore.indexes.json`**:
   - Menambahkan composite index `bookings` (`[status, dateKey DESC, startAt DESC]`), `ledgerEntries` (`[dateKey DESC, createdAt DESC]`, `[studioId, dateKey DESC, createdAt DESC]`, `[bookingId, createdAt DESC]`), dan `commissionEntries` (`[dateKey DESC, createdAt DESC]`, `[operatorUid, dateKey DESC, createdAt DESC]`, `[bookingId, createdAt DESC]`).

---

## 3. Residual Risk & Spark Plan Boundaries
1. **Perhitungan Client Tanpa Backend (`Spark-Only Residual Risk`)**: Karena tidak memakai Cloud Functions/server tepercaya, Security Rules memvalidasi role Owner, bentuk schema integer IDR, transisi status, relasi `existsAfter` ke ledger/komisi, serta immutability (`update, delete: false`), sementara kalkulasi nominal tetap dilakukan di client sebelum commit. Pembatasan settlement khusus Owner dan audit log append-only memitigasi risiko ini sesuai arsitektur Spark.
2. **Belum Di-deploy ke Live**: Perubahan Phase 04 telah diuji di Firestore Emulator `STANDARD` edition dan menunggu konfirmasi deploy terpisah bila diperlukan.

---

## 4. Phase Gate Checklist (Phase 04)
- [x] `npm run lint` (`eslint .`) lulus dengan 0 error & 0 warning
- [x] `npm run test:unit` (`vitest run --project unit`: 7 test files, 31 tests — termasuk `financeValidatorsAndMetrics.test.js`) seluruhnya lulus
- [x] `npm run test:rules` (`firebase emulators:exec --only firestore "vitest run --project rules"`: 4 test files, 15 tests pada Standard Edition Emulator — mencakup `phase04.rules.test.js` atomic `existsAfter` settlement, immutable ledger/commission, adjustment/reversal parent validation, privacy isolation Operator, dan lock Phase 05+) seluruhnya lulus
- [x] `npm run build` (`vite build`) berhasil membangun bundle produksi bersih tanpa error
- [x] `README.md`, `docs/checkpoints/phase-04-checkpoint.md`, dan `docs/handoffs/phase-05-handoff-prompt.txt` selesai ditulis
