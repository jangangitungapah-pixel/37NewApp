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
  BOOKING_OPERATION_TYPE,
  BOOKING_SLOT_STATUS,
  BOOKING_STATUS,
  ROLES,
  SCHEMA_VERSIONS,
} from '../../domain/enums/roles.js';
import { assertSessionActionAllowed } from '../../domain/validators/bookingSessionValidator.js';
import { AppError, ERROR_CATEGORY, mapFirebaseError } from '../firebase/errorMapper.js';
import { getFirebaseServices } from '../firebase/firebaseClient.js';
import {
  mapBookingSessionEventSnapshot,
  mapBookingSnapshot,
} from '../mappers/bookingMappers.js';

function assertOperationContext(operationContext, { businessId, actorUid, action }) {
  if (
    !operationContext?.operationId ||
    !operationContext?.requestId ||
    !operationContext?.payloadHash ||
    !businessId ||
    !actorUid ||
    !action
  ) {
    throw new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'booking/idempotency-context-required',
      message: 'Konteks idempotensi aksi sesi tidak lengkap. Silakan ulangi aksi dari aplikasi.',
    });
  }
}

function assertOperationReplay(marker, { operationContext, businessId, bookingId, studioId, actorUid, actorRole, action }) {
  const matches =
    marker.businessId === businessId &&
    marker.bookingId === bookingId &&
    marker.studioId === studioId &&
    marker.operationType === BOOKING_OPERATION_TYPE.SESSION &&
    marker.action === action &&
    marker.actorUid === actorUid &&
    marker.actorRole === actorRole &&
    marker.requestId === operationContext.requestId &&
    marker.payloadHash === operationContext.payloadHash;

  if (!matches) {
    throw new AppError({
      category: ERROR_CATEGORY.CONFLICT,
      code: 'booking/idempotency-conflict',
      message: 'Request ID aksi sesi sudah digunakan untuk payload atau aktor yang berbeda. Buat aksi baru dari aplikasi.',
    });
  }
}

/**
 * Executes check-in, start, complete, no-show, cancel, or reject.
 * Booking, owned slot releases, append-only session event, and operation marker
 * are committed atomically. All transaction reads happen before the first write.
 */
export async function performBookingSessionActionTransaction({
  businessId,
  bookingId,
  action,
  reason = null,
  actorUid,
  actorRole,
  actorName,
  operationContext,
  referenceNow = new Date(),
}) {
  assertOperationContext(operationContext, { businessId, actorUid, action });
  if (![ROLES.OWNER, ROLES.OPERATOR].includes(actorRole)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/booking-session-role-denied',
      message: 'Role Anda tidak diizinkan menjalankan aksi sesi.',
    });
  }

  try {
    const { db } = getFirebaseServices();
    const bookingRef = doc(db, 'businesses', businessId, 'bookings', bookingId);
    const operationRef = doc(
      db,
      'businesses',
      businessId,
      'bookingOperations',
      operationContext.operationId,
    );
    const eventRef = doc(
      db,
      'businesses',
      businessId,
      'bookingSessionEvents',
      operationContext.operationId,
    );
    const safeActorName = String(actorName || '').trim().slice(0, 120) || 'Pengguna';

    return await runTransaction(db, async (tx) => {
      // Read the marker and booking before any possible write.
      const operationSnap = await tx.get(operationRef);
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists()) {
        throw new AppError({
          category: ERROR_CATEGORY.NOT_FOUND,
          code: 'booking/not-found',
          message: 'Booking tidak ditemukan.',
        });
      }

      const currentBooking = mapBookingSnapshot(bookingSnap);
      if (operationSnap.exists()) {
        assertOperationReplay(operationSnap.data(), {
          operationContext,
          businessId,
          bookingId,
          studioId: currentBooking.studioId,
          actorUid,
          actorRole,
          action,
        });
        return currentBooking;
      }

      const actionResult = assertSessionActionAllowed({
        action,
        booking: currentBooking,
        reason,
        now: referenceNow,
      });
      const shouldReleaseSlots = [
        BOOKING_STATUS.CANCELLED,
        BOOKING_STATUS.REJECTED,
        BOOKING_STATUS.NO_SHOW,
      ].includes(actionResult.nextBookingStatus);

      const slotRefs = shouldReleaseSlots
        ? currentBooking.slotIds.map((slotId) =>
            doc(db, 'businesses', businessId, 'bookingSlots', slotId),
          )
        : [];
      const slotSnaps = slotRefs.length
        ? await Promise.all(slotRefs.map((ref) => tx.get(ref)))
        : [];

      // No writes occur above this line.
      const nowDate = referenceNow instanceof Date ? referenceNow : new Date(referenceNow);
      const trimmedReason = typeof reason === 'string' ? reason.trim() : null;
      const eventId = operationContext.operationId;
      const bookingUpdate = {
        sessionStatus: actionResult.nextSessionStatus,
        lastSessionEventId: eventId,
        lastSessionEventAt: serverTimestamp(),
        lastSessionEventType: action,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid,
      };

      switch (action) {
        case 'check_in':
          bookingUpdate.checkedInAt = serverTimestamp();
          bookingUpdate.checkedInByUid = actorUid;
          bookingUpdate.checkedInByName = safeActorName;
          break;
        case 'start':
          bookingUpdate.actualStartAt = serverTimestamp();
          bookingUpdate.actualStartByUid = actorUid;
          bookingUpdate.actualStartByName = safeActorName;
          break;
        case 'complete':
          bookingUpdate.status = BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT;
          bookingUpdate.actualEndAt = serverTimestamp();
          bookingUpdate.actualEndByUid = actorUid;
          bookingUpdate.actualEndByName = safeActorName;
          bookingUpdate.actualDurationMinutes = actionResult.actualDurationMinutes;
          bookingUpdate.completedAt = serverTimestamp();
          break;
        case 'no_show':
          bookingUpdate.status = BOOKING_STATUS.NO_SHOW;
          bookingUpdate.noShowAt = serverTimestamp();
          bookingUpdate.noShowByUid = actorUid;
          bookingUpdate.noShowByName = safeActorName;
          bookingUpdate.noShowReason = trimmedReason;
          break;
        case 'cancel':
        case 'reject':
          bookingUpdate.status = actionResult.nextBookingStatus;
          bookingUpdate.cancelReason = trimmedReason;
          bookingUpdate.cancelledBy = actorUid;
          bookingUpdate.cancelledAt = serverTimestamp();
          break;
        default:
          throw new AppError({
            category: ERROR_CATEGORY.VALIDATION,
            code: 'booking/session-action-unsupported',
            message: 'Aksi sesi tidak didukung.',
          });
      }

      tx.update(bookingRef, bookingUpdate);

      if (shouldReleaseSlots) {
        for (let index = 0; index < slotSnaps.length; index += 1) {
          const slotSnap = slotSnaps[index];
          if (!slotSnap.exists()) continue;
          const slotData = slotSnap.data();
          if (slotData.status === BOOKING_SLOT_STATUS.ACTIVE && slotData.bookingId === bookingId) {
            tx.update(slotRefs[index], {
              status: BOOKING_SLOT_STATUS.RELEASED,
              bookingId: null,
              releasedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              updatedBy: actorUid,
            });
          }
        }
      }

      const event = {
        eventId,
        businessId,
        bookingId,
        studioId: currentBooking.studioId,
        action,
        fromStatus: currentBooking.sessionStatus,
        toStatus: actionResult.nextSessionStatus,
        actorUid,
        actorRole,
        actorName: safeActorName,
        reason: trimmedReason || null,
        operationId: eventId,
        requestId: operationContext.requestId,
        payloadHash: operationContext.payloadHash,
        schemaVersion: SCHEMA_VERSIONS.BOOKING_SESSION_EVENT,
        createdAt: serverTimestamp(),
      };
      tx.set(eventRef, event);

      tx.set(operationRef, {
        operationId: operationContext.operationId,
        requestId: operationContext.requestId,
        payloadHash: operationContext.payloadHash,
        operationType: BOOKING_OPERATION_TYPE.SESSION,
        action,
        businessId,
        bookingId,
        studioId: currentBooking.studioId,
        actorUid,
        actorRole,
        resultBookingStatus: actionResult.nextBookingStatus,
        resultSessionStatus: actionResult.nextSessionStatus,
        createdAt: serverTimestamp(),
        schemaVersion: SCHEMA_VERSIONS.BOOKING_OPERATION,
      });

      return {
        ...currentBooking,
        ...bookingUpdate,
        checkedInAt: action === 'check_in' ? nowDate : currentBooking.checkedInAt,
        actualStartAt: action === 'start' ? nowDate : currentBooking.actualStartAt,
        actualEndAt: action === 'complete' ? nowDate : currentBooking.actualEndAt,
        noShowAt: action === 'no_show' ? nowDate : currentBooking.noShowAt,
        cancelledAt: ['cancel', 'reject'].includes(action) ? nowDate : currentBooking.cancelledAt,
        lastSessionEventAt: nowDate,
        completedAt: action === 'complete' ? nowDate : currentBooking.completedAt,
        updatedAt: nowDate,
      };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw mapFirebaseError(error);
  }
}

/** Subscribe to a single booking's append-only session history. */
export function subscribeBookingSessionEvents({
  businessId,
  studioId,
  bookingId,
  onData,
  onError,
}) {
  if (!businessId || !studioId || !bookingId) {
    onData([], { fromCache: false });
    return () => {};
  }

  const { db } = getFirebaseServices();
  const q = query(
    collection(db, 'businesses', businessId, 'bookingSessionEvents'),
    where('studioId', '==', studioId),
    where('bookingId', '==', bookingId),
    orderBy('createdAt', 'asc'),
    limit(100),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      try {
        const events = snapshot.docs.map(mapBookingSessionEventSnapshot).filter(Boolean);
        onData(events, { fromCache: snapshot.metadata.fromCache });
      } catch (error) {
        onError(mapFirebaseError(error));
      }
    },
    (error) => onError(mapFirebaseError(error)),
  );
}
