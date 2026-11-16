import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import {
  ACTIVITY_ENTITY_TYPE,
  ACTIVITY_EVENT_TYPE,
  BOOKING_STATUS,
  COMMISSION_DIRECTION,
  COMMISSION_ENTRY_STATUS,
  COMMISSION_ENTRY_TYPE,
  LEDGER_DIRECTION,
  LEDGER_ENTRY_TYPE,
  ROLES,
  SCHEMA_VERSIONS,
} from '../../domain/enums/roles.js';
import { computeSettlementCommissionSnapshot } from '../../domain/calculations/financeMetricsCalculator.js';
import {
  buildCommissionReversalEntryId,
  buildEarnedCommissionEntryId,
  buildLedgerReversalEntryId,
  buildSettlementPaymentEntryId,
  validateCommissionEntryDoc,
  validateLedgerEntryDoc,
  validateSettlementInput,
} from '../../domain/validators/financeValidators.js';
import { AppError, ERROR_CATEGORY, mapFirebaseError } from '../firebase/errorMapper.js';
import { getFirebaseServices } from '../firebase/firebaseClient.js';
import { mapBookingSnapshot } from '../mappers/bookingMappers.js';
import {
  mapCommissionEntrySnapshot,
  mapLedgerEntrySnapshot,
} from '../mappers/financeMappers.js';

/**
 * Subscribes to Owner's Settlement Queue (`COMPLETED_PENDING_SETTLEMENT` & `SETTLEMENT_REVIEW`).
 */
export function subscribeSettlementQueue({ businessId, onData, onError }) {
  const { db } = getFirebaseServices();
  const q = query(
    collection(db, 'businesses', businessId, 'bookings'),
    where('status', 'in', [
      BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT,
      BOOKING_STATUS.SETTLEMENT_REVIEW,
    ]),
    orderBy('dateKey', 'desc'),
    orderBy('startAt', 'desc'),
    limit(60),
  );
  return onSnapshot(
    q,
    (snap) => {
      try {
        const items = snap.docs.map(mapBookingSnapshot).filter(Boolean);
        onData(items, { fromCache: snap.metadata.fromCache });
      } catch (err) {
        onError(mapFirebaseError(err));
      }
    },
    (err) => onError(mapFirebaseError(err)),
  );
}

/**
 * Subscribes to immutable ledger entries in a bounded `[startDateKey, endDateKey]` window (Owner-only).
 */
export function subscribeLedgerEntriesInRange({
  businessId,
  studioId = 'all',
  startDateKey,
  endDateKey,
  onData,
  onError,
}) {
  const { db } = getFirebaseServices();
  const colRef = collection(db, 'businesses', businessId, 'ledgerEntries');
  const constraints = [];
  if (studioId && studioId !== 'all') {
    constraints.push(where('studioId', '==', studioId));
  }
  constraints.push(
    where('dateKey', '>=', startDateKey),
    where('dateKey', '<=', endDateKey),
    orderBy('dateKey', 'desc'),
    orderBy('createdAt', 'desc'),
    limit(200),
  );

  return onSnapshot(
    query(colRef, ...constraints),
    (snap) => {
      try {
        const items = snap.docs.map(mapLedgerEntrySnapshot).filter(Boolean);
        onData(items, { fromCache: snap.metadata.fromCache });
      } catch (err) {
        onError(mapFirebaseError(err));
      }
    },
    (err) => onError(mapFirebaseError(err)),
  );
}

/**
 * Subscribes to immutable commission entries scoped strictly by role:
 * - Owner reads all commission entries in date range.
 * - Operator reads ONLY `where('operatorUid', '==', member.uid)` in date range.
 */
export function subscribeCommissionEntriesInRange({
  businessId,
  member,
  startDateKey,
  endDateKey,
  onData,
  onError,
}) {
  const { db } = getFirebaseServices();
  const colRef = collection(db, 'businesses', businessId, 'commissionEntries');
  const constraints = [];

  if (member?.role !== ROLES.OWNER) {
    if (!member?.uid) {
      onData([], { fromCache: false });
      return () => {};
    }
    constraints.push(where('operatorUid', '==', member.uid));
  }

  constraints.push(
    where('dateKey', '>=', startDateKey),
    where('dateKey', '<=', endDateKey),
    orderBy('dateKey', 'desc'),
    orderBy('createdAt', 'desc'),
    limit(200),
  );

  return onSnapshot(
    query(colRef, ...constraints),
    (snap) => {
      try {
        const items = snap.docs.map(mapCommissionEntrySnapshot).filter(Boolean);
        onData(items, { fromCache: snap.metadata.fromCache });
      } catch (err) {
        onError(mapFirebaseError(err));
      }
    },
    (err) => onError(mapFirebaseError(err)),
  );
}

/**
 * Atomically settles a completed booking inside ONE Firestore transaction:
 * 1. Verifies booking state & deterministic payment/commission IDs are unused
 * 2. Updates `bookings/{bookingId}` -> `SETTLED` with settlement metadata
 * 3. Creates immutable `ledgerEntries/settlement_payment__{bookingId}`
 * 4. Creates immutable `commissionEntries/commission_earned__{bookingId}`
 * 5. Writes append-only `activityLogs/booking.settled__{bookingId}`
 */
export async function settleBookingTransaction({
  businessId,
  bookingId,
  paymentMethod,
  paidAmountMinor,
  settlementReference = null,
  settlementNotes = null,
  actorUid,
  actorRole,
}) {
  try {
    const cleanInput = validateSettlementInput({
      paymentMethod,
      paidAmountMinor,
      settlementReference,
      settlementNotes,
    });

    const { db } = getFirebaseServices();
    const bookingRef = doc(db, 'businesses', businessId, 'bookings', bookingId);
    const paymentEntryId = buildSettlementPaymentEntryId(bookingId);
    const commEntryId = buildEarnedCommissionEntryId(bookingId);
    const paymentRef = doc(db, 'businesses', businessId, 'ledgerEntries', paymentEntryId);
    const commRef = doc(db, 'businesses', businessId, 'commissionEntries', commEntryId);
    const eventId = `${ACTIVITY_EVENT_TYPE.BOOKING_SETTLED}__${bookingId}`;
    const activityRef = doc(db, 'businesses', businessId, 'activityLogs', eventId);

    return await runTransaction(db, async (tx) => {
      const [bookingSnap, paymentSnap, commSnap] = await Promise.all([
        tx.get(bookingRef),
        tx.get(paymentRef),
        tx.get(commRef),
      ]);

      if (!bookingSnap.exists()) {
        throw new AppError({
          category: ERROR_CATEGORY.NOT_FOUND,
          code: 'booking/not-found',
          message: 'Booking tidak ditemukan.',
        });
      }

      const booking = mapBookingSnapshot(bookingSnap);

      if (booking.status === BOOKING_STATUS.SETTLED && paymentSnap.exists()) {
        return { booking, idempotentReplay: true };
      }

      if (
        booking.status !== BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT &&
        booking.status !== BOOKING_STATUS.SETTLEMENT_REVIEW
      ) {
        throw new AppError({
          category: ERROR_CATEGORY.FAILED_PRECONDITION,
          code: 'finance/invalid-settlement-status',
          message: `Booking berstatus "${booking.status}" tidak dapat di-settle.`,
        });
      }

      if (paymentSnap.exists() || commSnap.exists()) {
        throw new AppError({
          category: ERROR_CATEGORY.CONFLICT,
          code: 'finance/duplicate-settlement-entry',
          message: 'Catatan ledger/komisi deterministik untuk booking ini sudah ada.',
        });
      }

      const targetOperatorUid = booking.operatorUid || booking.createdBy || actorUid;
      const computedCommission = computeSettlementCommissionSnapshot({
        booking,
        paidAmountMinor: cleanInput.paidAmountMinor,
      });

      const validatedLedger = validateLedgerEntryDoc({
        entryId: paymentEntryId,
        businessId,
        bookingId,
        studioId: booking.studioId,
        dateKey: booking.dateKey,
        type: LEDGER_ENTRY_TYPE.PAYMENT_RECEIVED,
        direction: LEDGER_DIRECTION.INFLOW,
        amountMinor: cleanInput.paidAmountMinor,
        currency: booking.priceSnapshot?.currency || 'IDR',
        paymentMethod: cleanInput.paymentMethod,
        reference: cleanInput.settlementReference,
        notes: cleanInput.settlementNotes,
        relatedEntryId: null,
        reason: null,
        schemaVersion: SCHEMA_VERSIONS.LEDGER_ENTRY,
        createdBy: actorUid,
      });

      const validatedCommission = validateCommissionEntryDoc({
        entryId: commEntryId,
        businessId,
        bookingId,
        studioId: booking.studioId,
        dateKey: booking.dateKey,
        operatorUid: targetOperatorUid,
        entryType: COMMISSION_ENTRY_TYPE.EARNED,
        direction: COMMISSION_DIRECTION.CREDIT,
        amountMinor: computedCommission.amountMinor,
        currency: 'IDR',
        method: computedCommission.method,
        rateOrValue: computedCommission.rateOrValue,
        basis: computedCommission.basis,
        basisAmountMinor: computedCommission.basisAmountMinor,
        source: computedCommission.source,
        relatedEntryId: null,
        reason: null,
        status: COMMISSION_ENTRY_STATUS.RECORDED,
        schemaVersion: SCHEMA_VERSIONS.COMMISSION_ENTRY,
        createdBy: actorUid,
      });

      tx.update(bookingRef, {
        status: BOOKING_STATUS.SETTLED,
        settlement: {
          paidAmountMinor: cleanInput.paidAmountMinor,
          paymentMethod: cleanInput.paymentMethod,
          settlementReference: cleanInput.settlementReference,
          settlementNotes: cleanInput.settlementNotes,
          reviewReason: null,
          ledgerEntryId: paymentEntryId,
          commissionEntryId: commEntryId,
          settledBy: actorUid,
          settledAt: serverTimestamp(),
        },
        updatedBy: actorUid,
        updatedAt: serverTimestamp(),
      });

      tx.set(paymentRef, {
        ...validatedLedger,
        createdAt: serverTimestamp(),
      });

      tx.set(commRef, {
        ...validatedCommission,
        createdAt: serverTimestamp(),
      });

      tx.set(activityRef, {
        eventId,
        businessId,
        studioId: booking.studioId,
        eventType: ACTIVITY_EVENT_TYPE.BOOKING_SETTLED,
        entityType: ACTIVITY_ENTITY_TYPE.BOOKING,
        entityId: bookingId,
        operationId: eventId,
        actorUid,
        actorRole,
        beforeStatus: booking.status,
        afterStatus: BOOKING_STATUS.SETTLED,
        reason: cleanInput.settlementNotes,
        summary: `Settlement booking (${cleanInput.paymentMethod}, Rp ${cleanInput.paidAmountMinor.toLocaleString('id-ID')}) dan pencatatan komisi selesai.`,
        schemaVersion: SCHEMA_VERSIONS.ACTIVITY_LOG,
        createdAt: serverTimestamp(),
      });

      return {
        booking: { ...booking, status: BOOKING_STATUS.SETTLED },
        ledgerEntry: validatedLedger,
        commissionEntry: validatedCommission,
        idempotentReplay: false,
      };
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw mapFirebaseError(error);
  }
}

/**
 * Transitions `COMPLETED_PENDING_SETTLEMENT` -> `SETTLEMENT_REVIEW` with mandatory reason.
 */
export async function requestSettlementReviewTransaction({
  businessId,
  bookingId,
  reviewReason,
  actorUid,
  actorRole,
}) {
  try {
    const cleanReason = typeof reviewReason === 'string' ? reviewReason.trim().slice(0, 300) : '';
    if (cleanReason.length < 3) {
      throw new AppError({
        category: ERROR_CATEGORY.VALIDATION,
        code: 'validation/review-reason-required',
        message: 'Alasan koreksi settlement wajib diisi minimal 3 karakter.',
      });
    }

    const { db } = getFirebaseServices();
    const bookingRef = doc(db, 'businesses', businessId, 'bookings', bookingId);
    const eventId = `${ACTIVITY_EVENT_TYPE.BOOKING_SETTLEMENT_REVIEW}__${bookingId}`;
    const activityRef = doc(db, 'businesses', businessId, 'activityLogs', eventId);

    return await runTransaction(db, async (tx) => {
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists()) {
        throw new AppError({
          category: ERROR_CATEGORY.NOT_FOUND,
          code: 'booking/not-found',
          message: 'Booking tidak ditemukan.',
        });
      }
      const booking = mapBookingSnapshot(bookingSnap);
      if (booking.status !== BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT) {
        throw new AppError({
          category: ERROR_CATEGORY.FAILED_PRECONDITION,
          code: 'finance/invalid-review-status',
          message: `Status "${booking.status}" tidak dapat dipindah ke SETTLEMENT_REVIEW.`,
        });
      }

      tx.update(bookingRef, {
        status: BOOKING_STATUS.SETTLEMENT_REVIEW,
        settlement: {
          paidAmountMinor: 0,
          paymentMethod: null,
          settlementReference: null,
          settlementNotes: null,
          reviewReason: cleanReason,
          ledgerEntryId: null,
          commissionEntryId: null,
          settledBy: null,
          settledAt: null,
        },
        updatedBy: actorUid,
        updatedAt: serverTimestamp(),
      });

      tx.set(activityRef, {
        eventId,
        businessId,
        studioId: booking.studioId,
        eventType: ACTIVITY_EVENT_TYPE.BOOKING_SETTLEMENT_REVIEW,
        entityType: ACTIVITY_ENTITY_TYPE.BOOKING,
        entityId: bookingId,
        operationId: eventId,
        actorUid,
        actorRole,
        beforeStatus: booking.status,
        afterStatus: BOOKING_STATUS.SETTLEMENT_REVIEW,
        reason: cleanReason,
        summary: `Booking ditandai perlu review/koreksi sebelum settlement.`,
        schemaVersion: SCHEMA_VERSIONS.ACTIVITY_LOG,
        createdAt: serverTimestamp(),
      });

      return { ...booking, status: BOOKING_STATUS.SETTLEMENT_REVIEW };
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw mapFirebaseError(error);
  }
}

/**
 * Records an immutable REFUND, ADJUSTMENT, or deterministic REVERSAL ledger entry
 * referencing `originalEntry.entryId` inside a single Firestore transaction.
 */
export async function recordLedgerAdjustmentTransaction({
  businessId,
  originalEntry,
  entryType,
  direction,
  amountMinor,
  reason,
  paymentMethod = null,
  actorUid,
  actorRole,
}) {
  try {
    const { db } = getFirebaseServices();
    const ledgerCol = collection(db, 'businesses', businessId, 'ledgerEntries');
    const origRef = doc(ledgerCol, originalEntry.entryId);

    const isReversal = entryType === LEDGER_ENTRY_TYPE.REVERSAL;
    const entryId = isReversal
      ? buildLedgerReversalEntryId(originalEntry.entryId)
      : doc(ledgerCol).id;
    const targetRef = doc(ledgerCol, entryId);
    const eventId = `${ACTIVITY_EVENT_TYPE.LEDGER_ADJUSTED}__${entryId}`;
    const activityRef = doc(db, 'businesses', businessId, 'activityLogs', eventId);

    const normalizedDirection = isReversal
      ? originalEntry.direction === LEDGER_DIRECTION.INFLOW
        ? LEDGER_DIRECTION.OUTFLOW
        : LEDGER_DIRECTION.INFLOW
      : direction;

    const validatedEntry = validateLedgerEntryDoc({
      entryId,
      businessId,
      bookingId: originalEntry.bookingId,
      studioId: originalEntry.studioId,
      dateKey: originalEntry.dateKey,
      type: entryType,
      direction: normalizedDirection,
      amountMinor: isReversal ? originalEntry.amountMinor : Number(amountMinor),
      currency: originalEntry.currency || 'IDR',
      paymentMethod: paymentMethod || originalEntry.paymentMethod,
      reference: originalEntry.reference || null,
      notes: null,
      relatedEntryId: originalEntry.entryId,
      reason,
      schemaVersion: SCHEMA_VERSIONS.LEDGER_ENTRY,
      createdBy: actorUid,
    });

    await runTransaction(db, async (tx) => {
      const [origSnap, targetSnap] = await Promise.all([tx.get(origRef), tx.get(targetRef)]);
      if (!origSnap.exists()) {
        throw new AppError({
          category: ERROR_CATEGORY.NOT_FOUND,
          code: 'finance/original-ledger-missing',
          message: 'Entry ledger asal tidak ditemukan.',
        });
      }
      if (targetSnap.exists()) {
        throw new AppError({
          category: ERROR_CATEGORY.CONFLICT,
          code: 'finance/duplicate-reversal',
          message: 'Reversal untuk entry ledger ini sudah pernah dicatat.',
        });
      }

      tx.set(targetRef, {
        ...validatedEntry,
        createdAt: serverTimestamp(),
      });

      tx.set(activityRef, {
        eventId,
        businessId,
        studioId: originalEntry.studioId,
        eventType: ACTIVITY_EVENT_TYPE.LEDGER_ADJUSTED,
        entityType: ACTIVITY_ENTITY_TYPE.LEDGER_ENTRY,
        entityId: entryId,
        operationId: eventId,
        actorUid,
        actorRole,
        beforeStatus: originalEntry.type,
        afterStatus: entryType,
        reason: validatedEntry.reason,
        summary: `${entryType} (${normalizedDirection} Rp ${validatedEntry.amountMinor.toLocaleString('id-ID')}) mereferensikan ${originalEntry.entryId}.`,
        schemaVersion: SCHEMA_VERSIONS.ACTIVITY_LOG,
        createdAt: serverTimestamp(),
      });
    });

    return validatedEntry;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw mapFirebaseError(error);
  }
}

/**
 * Records an immutable commission adjustment or deterministic reversal entry.
 */
export async function recordCommissionAdjustmentTransaction({
  businessId,
  originalEntry,
  entryType,
  direction,
  amountMinor,
  reason,
  actorUid,
  actorRole,
}) {
  try {
    const { db } = getFirebaseServices();
    const commCol = collection(db, 'businesses', businessId, 'commissionEntries');
    const origRef = doc(commCol, originalEntry.entryId);

    const isReversal = entryType === COMMISSION_ENTRY_TYPE.REVERSAL;
    const entryId = isReversal
      ? buildCommissionReversalEntryId(originalEntry.entryId)
      : doc(commCol).id;
    const targetRef = doc(commCol, entryId);
    const eventId = `${ACTIVITY_EVENT_TYPE.COMMISSION_ADJUSTED}__${entryId}`;
    const activityRef = doc(db, 'businesses', businessId, 'activityLogs', eventId);

    const normalizedDirection = isReversal
      ? originalEntry.direction === COMMISSION_DIRECTION.CREDIT
        ? COMMISSION_DIRECTION.DEBIT
        : COMMISSION_DIRECTION.CREDIT
      : direction;

    const validatedComm = validateCommissionEntryDoc({
      entryId,
      businessId,
      bookingId: originalEntry.bookingId,
      studioId: originalEntry.studioId,
      dateKey: originalEntry.dateKey,
      operatorUid: originalEntry.operatorUid,
      entryType,
      direction: normalizedDirection,
      amountMinor: isReversal ? originalEntry.amountMinor : Number(amountMinor),
      currency: originalEntry.currency || 'IDR',
      method: originalEntry.method,
      rateOrValue: originalEntry.rateOrValue,
      basis: originalEntry.basis,
      basisAmountMinor: originalEntry.basisAmountMinor,
      source: originalEntry.source,
      relatedEntryId: originalEntry.entryId,
      reason,
      status: isReversal ? COMMISSION_ENTRY_STATUS.REVERSED : COMMISSION_ENTRY_STATUS.ADJUSTED,
      schemaVersion: SCHEMA_VERSIONS.COMMISSION_ENTRY,
      createdBy: actorUid,
    });

    await runTransaction(db, async (tx) => {
      const [origSnap, targetSnap] = await Promise.all([tx.get(origRef), tx.get(targetRef)]);
      if (!origSnap.exists()) {
        throw new AppError({
          category: ERROR_CATEGORY.NOT_FOUND,
          code: 'finance/original-commission-missing',
          message: 'Entry komisi asal tidak ditemukan.',
        });
      }
      if (targetSnap.exists()) {
        throw new AppError({
          category: ERROR_CATEGORY.CONFLICT,
          code: 'finance/duplicate-commission-reversal',
          message: 'Reversal untuk entry komisi ini sudah pernah dicatat.',
        });
      }

      tx.set(targetRef, {
        ...validatedComm,
        createdAt: serverTimestamp(),
      });

      tx.set(activityRef, {
        eventId,
        businessId,
        studioId: originalEntry.studioId,
        eventType: ACTIVITY_EVENT_TYPE.COMMISSION_ADJUSTED,
        entityType: ACTIVITY_ENTITY_TYPE.COMMISSION_ENTRY,
        entityId: entryId,
        operationId: eventId,
        actorUid,
        actorRole,
        beforeStatus: originalEntry.entryType,
        afterStatus: entryType,
        reason: validatedComm.reason,
        summary: `Komisi ${entryType} (${normalizedDirection} Rp ${validatedComm.amountMinor.toLocaleString('id-ID')}) mereferensikan ${originalEntry.entryId}.`,
        schemaVersion: SCHEMA_VERSIONS.ACTIVITY_LOG,
        createdAt: serverTimestamp(),
      });
    });

    return validatedComm;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw mapFirebaseError(error);
  }
}
