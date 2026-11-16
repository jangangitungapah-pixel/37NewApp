import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import {
  ACTIVITY_ENTITY_TYPE,
  ACTIVITY_EVENT_TYPE,
  BOOKING_SLOT_STATUS,
  BOOKING_STATUS,
  ROLES,
  SCHEMA_VERSIONS,
} from '../../domain/enums/roles.js';
import {
  assertValidBookingTransition,
  RELEASING_BOOKING_STATUSES,
  RESCHEDULABLE_BOOKING_STATUSES,
} from '../../domain/validators/bookingValidator.js';
import { AppError, ERROR_CATEGORY, mapFirebaseError } from '../firebase/errorMapper.js';
import { getFirebaseServices } from '../firebase/firebaseClient.js';
import {
  mapActivityLogSnapshot,
  mapBookingSlotSnapshot,
  mapBookingSnapshot,
} from '../mappers/bookingMappers.js';

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function createPreGeneratedBookingRef(db, businessId) {
  return doc(collection(db, 'businesses', businessId, 'bookings'));
}

export function generateNewBookingId(businessId) {
  const { db } = getFirebaseServices();
  return createPreGeneratedBookingRef(db, businessId).id;
}

/**
 * Subscribes to bookings in a local `[startDateKey, endDateKey]` calendar window,
 * strictly enforcing Operator `assignedStudioIds` query scoping.
 */
export function subscribeBookingsInRange({
  businessId,
  member,
  studioId = 'all',
  startDateKey,
  endDateKey,
  onData,
  onError,
}) {
  const { db } = getFirebaseServices();
  const bookingsCol = collection(db, 'businesses', businessId, 'bookings');

  const isOwner = member?.role === ROLES.OWNER;
  const assignedIds = Array.isArray(member?.assignedStudioIds) ? member.assignedStudioIds : [];

  if (!isOwner && assignedIds.length === 0) {
    onData([], { fromCache: false });
    return () => {};
  }

  if (studioId && studioId !== 'all') {
    const q = query(
      bookingsCol,
      where('studioId', '==', studioId),
      where('dateKey', '>=', startDateKey),
      where('dateKey', '<=', endDateKey),
      orderBy('dateKey', 'asc'),
      orderBy('startAt', 'asc'),
      limit(150),
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

  if (isOwner) {
    const q = query(
      bookingsCol,
      where('dateKey', '>=', startDateKey),
      where('dateKey', '<=', endDateKey),
      orderBy('dateKey', 'asc'),
      orderBy('startAt', 'asc'),
      limit(150),
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

  const chunks = chunkArray(assignedIds, 10);
  const chunkMap = new Map();
  let anyFromCache = false;

  const emitMerged = () => {
    const deduped = new Map();
    for (const list of chunkMap.values()) {
      for (const item of list) {
        deduped.set(item.bookingId, item);
      }
    }
    const sorted = Array.from(deduped.values()).sort((a, b) => {
      if (a.dateKey !== b.dateKey) {
        return a.dateKey.localeCompare(b.dateKey);
      }
      return (a.startAt?.getTime?.() || 0) - (b.startAt?.getTime?.() || 0);
    });
    onData(sorted, { fromCache: anyFromCache });
  };

  const unsubs = chunks.map((chunkIds, idx) => {
    const q = query(
      bookingsCol,
      where('studioId', 'in', chunkIds),
      where('dateKey', '>=', startDateKey),
      where('dateKey', '<=', endDateKey),
      orderBy('dateKey', 'asc'),
      orderBy('startAt', 'asc'),
      limit(100),
    );
    return onSnapshot(
      q,
      (snap) => {
        try {
          anyFromCache = snap.metadata.fromCache;
          chunkMap.set(idx, snap.docs.map(mapBookingSnapshot).filter(Boolean));
          emitMerged();
        } catch (err) {
          onError(mapFirebaseError(err));
        }
      },
      (err) => onError(mapFirebaseError(err)),
    );
  });

  return () => {
    for (const unsub of unsubs) {
      try {
        unsub();
      } catch {
        // Ignore teardown failures
      }
    }
  };
}

/**
 * Subscribes to active occupied `bookingSlots` for a single studio & dateKey
 * (e.g. during Create/Reschedule slot selection). Bounded to max 100 docs.
 */
export function subscribeActiveSlotsForStudioDay({
  businessId,
  studioId,
  dateKey,
  onData,
  onError,
}) {
  if (!studioId || !dateKey) {
    onData([], { fromCache: false });
    return () => {};
  }
  const { db } = getFirebaseServices();
  const q = query(
    collection(db, 'businesses', businessId, 'bookingSlots'),
    where('studioId', '==', studioId),
    where('status', '==', BOOKING_SLOT_STATUS.ACTIVE),
    where('dateKey', '==', dateKey),
    orderBy('bucketIndex', 'asc'),
    limit(100),
  );
  return onSnapshot(
    q,
    (snap) => {
      try {
        const slots = snap.docs.map(mapBookingSlotSnapshot).filter(Boolean);
        onData(slots, { fromCache: snap.metadata.fromCache });
      } catch (err) {
        onError(mapFirebaseError(err));
      }
    },
    (err) => onError(mapFirebaseError(err)),
  );
}

/**
 * Subscribes to append-only activity log entries for a specific booking.
 */
export function subscribeBookingActivityLogs({
  businessId,
  studioId,
  bookingId,
  onData,
  onError,
}) {
  if (!studioId || !bookingId) {
    onData([], { fromCache: false });
    return () => {};
  }
  const { db } = getFirebaseServices();
  const q = query(
    collection(db, 'businesses', businessId, 'activityLogs'),
    where('studioId', '==', studioId),
    where('entityType', '==', ACTIVITY_ENTITY_TYPE.BOOKING),
    where('entityId', '==', bookingId),
    orderBy('createdAt', 'desc'),
    limit(25),
  );
  return onSnapshot(
    q,
    (snap) => {
      try {
        const events = snap.docs.map(mapActivityLogSnapshot).filter(Boolean);
        onData(events, { fromCache: snap.metadata.fromCache });
      } catch (err) {
        onError(mapFirebaseError(err));
      }
    },
    (err) => onError(mapFirebaseError(err)),
  );
}

function mapStatusToActivityEventType(targetStatus) {
  switch (targetStatus) {
    case BOOKING_STATUS.CONFIRMED:
      return ACTIVITY_EVENT_TYPE.BOOKING_CONFIRMED;
    case BOOKING_STATUS.IN_PROGRESS:
      return ACTIVITY_EVENT_TYPE.BOOKING_STARTED;
    case BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT:
      return ACTIVITY_EVENT_TYPE.BOOKING_COMPLETED;
    case BOOKING_STATUS.CANCELLED:
      return ACTIVITY_EVENT_TYPE.BOOKING_CANCELLED;
    case BOOKING_STATUS.NO_SHOW:
      return ACTIVITY_EVENT_TYPE.BOOKING_NO_SHOW;
    default:
      return ACTIVITY_EVENT_TYPE.BOOKING_CREATED;
  }
}

/**
 * Atomically reserves all deterministic 15-min slots and writes the booking +
 * append-only activity log event inside a single Firestore transaction.
 */
export async function createBookingTransaction({
  businessId,
  booking,
  slotPlan,
  actorUid,
  actorRole,
}) {
  try {
    const { db } = getFirebaseServices();
    const bookingRef = doc(db, 'businesses', businessId, 'bookings', booking.bookingId);
    const slotRefs = slotPlan.allSlots.map((slot) =>
      doc(db, 'businesses', businessId, 'bookingSlots', slot.slotId),
    );
    const eventId = `${ACTIVITY_EVENT_TYPE.BOOKING_CREATED}__${booking.bookingId}`;
    const activityRef = doc(db, 'businesses', businessId, 'activityLogs', eventId);

    await runTransaction(db, async (tx) => {
      // 1. ALL reads first (required by Firestore transactions)
      const existingBookingSnap = await tx.get(bookingRef);
      const slotSnaps = await Promise.all(slotRefs.map((ref) => tx.get(ref)));

      // 2. Pure conflict & idempotency verification
      if (existingBookingSnap.exists()) {
        throw new AppError({
          category: ERROR_CATEGORY.CONFLICT,
          code: 'booking/duplicate-id',
          message: 'ID booking sudah ada. Muat ulang halaman dan coba lagi.',
        });
      }

      const conflicts = [];
      for (let i = 0; i < slotSnaps.length; i += 1) {
        const snap = slotSnaps[i];
        if (snap.exists() && snap.data().status === BOOKING_SLOT_STATUS.ACTIVE) {
          conflicts.push(slotPlan.allSlots[i].slotTime);
        }
      }

      if (conflicts.length > 0) {
        throw new AppError({
          category: ERROR_CATEGORY.CONFLICT,
          code: 'booking/slot-conflict',
          message: `Slot waktu bentrok dengan reservasi lain (${conflicts.join(', ')}). Jadwal diperbarui.`,
        });
      }

      // 3. Atomic writes
      tx.set(bookingRef, {
        ...booking,
        startAt: Timestamp.fromDate(slotPlan.startAt),
        endAt: Timestamp.fromDate(slotPlan.endAt),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (let i = 0; i < slotPlan.allSlots.length; i += 1) {
        const slot = slotPlan.allSlots[i];
        const snap = slotSnaps[i];
        if (!snap.exists()) {
          tx.set(slotRefs[i], {
            slotId: slot.slotId,
            businessId,
            studioId: booking.studioId,
            dateKey: booking.dateKey,
            bucketIndex: slot.bucketIndex,
            slotTime: slot.slotTime,
            kind: slot.kind,
            status: BOOKING_SLOT_STATUS.ACTIVE,
            bookingId: booking.bookingId,
            slotStartAt: Timestamp.fromDate(slot.slotStartAt),
            slotEndAt: Timestamp.fromDate(slot.slotEndAt),
            reservedBy: actorUid,
            reservedAt: serverTimestamp(),
            releasedAt: null,
            schemaVersion: SCHEMA_VERSIONS.BOOKING_SLOT,
            updatedAt: serverTimestamp(),
            updatedBy: actorUid,
          });
        } else {
          tx.update(slotRefs[i], {
            kind: slot.kind,
            status: BOOKING_SLOT_STATUS.ACTIVE,
            bookingId: booking.bookingId,
            slotStartAt: Timestamp.fromDate(slot.slotStartAt),
            slotEndAt: Timestamp.fromDate(slot.slotEndAt),
            reservedBy: actorUid,
            reservedAt: serverTimestamp(),
            releasedAt: null,
            updatedAt: serverTimestamp(),
            updatedBy: actorUid,
          });
        }
      }

      tx.set(activityRef, {
        eventId,
        businessId,
        studioId: booking.studioId,
        eventType: ACTIVITY_EVENT_TYPE.BOOKING_CREATED,
        entityType: ACTIVITY_ENTITY_TYPE.BOOKING,
        entityId: booking.bookingId,
        operationId: eventId,
        actorUid,
        actorRole,
        beforeStatus: null,
        afterStatus: booking.status,
        reason: null,
        summary: `Booking ${booking.serviceSnapshot.name} untuk ${booking.customerSnapshot.name} (${booking.dateKey} ${booking.startTime}–${booking.endTime}) dibuat.`,
        schemaVersion: SCHEMA_VERSIONS.ACTIVITY_LOG,
        createdAt: serverTimestamp(),
      });
    });

    return booking;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw mapFirebaseError(error);
  }
}

/**
 * Transitions booking lifecycle status atomically; releases all locked
 * `bookingSlots` when moving to CANCELLED or NO_SHOW and records audit event.
 */
export async function transitionBookingStatusTransaction({
  businessId,
  bookingId,
  targetStatus,
  reason = null,
  actorUid,
  actorRole,
}) {
  try {
    const { db } = getFirebaseServices();
    const bookingRef = doc(db, 'businesses', businessId, 'bookings', bookingId);
    const shouldReleaseSlots = RELEASING_BOOKING_STATUSES.has(targetStatus);
    const eventType = mapStatusToActivityEventType(targetStatus);

    return await runTransaction(db, async (tx) => {
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists()) {
        throw new AppError({
          category: ERROR_CATEGORY.NOT_FOUND,
          code: 'booking/not-found',
          message: 'Booking tidak ditemukan.',
        });
      }

      const currentBooking = mapBookingSnapshot(bookingSnap);
      assertValidBookingTransition(currentBooking.status, targetStatus);

      const slotRefs = shouldReleaseSlots
        ? currentBooking.slotIds.map((slotId) =>
            doc(db, 'businesses', businessId, 'bookingSlots', slotId),
          )
        : [];
      const slotSnaps = slotRefs.length > 0 ? await Promise.all(slotRefs.map((ref) => tx.get(ref))) : [];

      const bookingUpdate = {
        status: targetStatus,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid,
      };

      if (targetStatus === BOOKING_STATUS.IN_PROGRESS) {
        bookingUpdate.checkedInAt = serverTimestamp();
      } else if (targetStatus === BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT) {
        bookingUpdate.completedAt = serverTimestamp();
      } else if (shouldReleaseSlots) {
        bookingUpdate.cancelReason = reason ? reason.trim() : 'Dibatalkan oleh staf';
        bookingUpdate.cancelledBy = actorUid;
        bookingUpdate.cancelledAt = serverTimestamp();
      }

      tx.update(bookingRef, bookingUpdate);

      if (shouldReleaseSlots) {
        for (let i = 0; i < slotSnaps.length; i += 1) {
          const snap = slotSnaps[i];
          if (
            snap.exists() &&
            snap.data().status === BOOKING_SLOT_STATUS.ACTIVE &&
            snap.data().bookingId === bookingId
          ) {
            tx.update(slotRefs[i], {
              status: BOOKING_SLOT_STATUS.RELEASED,
              bookingId: null,
              releasedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              updatedBy: actorUid,
            });
          }
        }
      }

      const eventId = `${eventType}__${bookingId}`;
      const activityRef = doc(db, 'businesses', businessId, 'activityLogs', eventId);
      tx.set(activityRef, {
        eventId,
        businessId,
        studioId: currentBooking.studioId,
        eventType,
        entityType: ACTIVITY_ENTITY_TYPE.BOOKING,
        entityId: bookingId,
        operationId: eventId,
        actorUid,
        actorRole,
        beforeStatus: currentBooking.status,
        afterStatus: targetStatus,
        reason: reason ? reason.trim() : null,
        summary: `Status booking berubah dari ${currentBooking.status} menjadi ${targetStatus}.`,
        schemaVersion: SCHEMA_VERSIONS.ACTIVITY_LOG,
        createdAt: serverTimestamp(),
      });

      return { ...currentBooking, status: targetStatus };
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw mapFirebaseError(error);
  }
}

/**
 * Atomically reschedules an active booking: releases non-overlapping old slots
 * and verifies + claims new slots inside one Firestore transaction.
 */
export async function rescheduleBookingTransaction({
  businessId,
  bookingId,
  newSlotPlan,
  newPriceSnapshot,
  newCommissionSnapshot,
  reason = null,
  actorUid,
  actorRole,
}) {
  try {
    const { db } = getFirebaseServices();
    const bookingRef = doc(db, 'businesses', businessId, 'bookings', bookingId);

    return await runTransaction(db, async (tx) => {
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists()) {
        throw new AppError({
          category: ERROR_CATEGORY.NOT_FOUND,
          code: 'booking/not-found',
          message: 'Booking tidak ditemukan.',
        });
      }

      const current = mapBookingSnapshot(bookingSnap);
      if (!RESCHEDULABLE_BOOKING_STATUSES.has(current.status)) {
        throw new AppError({
          category: ERROR_CATEGORY.FAILED_PRECONDITION,
          code: 'booking/reschedule-not-allowed',
          message: `Booking berstatus "${current.status}" tidak dapat di-reschedule.`,
        });
      }

      const oldSlotIds = current.slotIds;
      const oldSlotSet = new Set(oldSlotIds);
      const newSlotSet = new Set(newSlotPlan.slotIds);

      const allSlotIds = Array.from(new Set([...oldSlotIds, ...newSlotPlan.slotIds]));
      const slotRefMap = new Map(
        allSlotIds.map((id) => [id, doc(db, 'businesses', businessId, 'bookingSlots', id)]),
      );

      const snapEntries = await Promise.all(
        allSlotIds.map(async (id) => [id, await tx.get(slotRefMap.get(id))]),
      );
      const slotSnapMap = new Map(snapEntries);

      const conflicts = [];
      for (const newSlot of newSlotPlan.allSlots) {
        const snap = slotSnapMap.get(newSlot.slotId);
        if (
          snap?.exists() &&
          snap.data().status === BOOKING_SLOT_STATUS.ACTIVE &&
          snap.data().bookingId !== bookingId
        ) {
          conflicts.push(newSlot.slotTime);
        }
      }

      if (conflicts.length > 0) {
        throw new AppError({
          category: ERROR_CATEGORY.CONFLICT,
          code: 'booking/slot-conflict',
          message: `Jadwal baru bentrok pada slot (${conflicts.join(', ')}). Pilih waktu lain.`,
        });
      }

      const nextRescheduleCount = (current.rescheduleCount || 0) + 1;

      tx.update(bookingRef, {
        dateKey: newSlotPlan.dateKey,
        timezone: newSlotPlan.timezone,
        startTime: newSlotPlan.startTime,
        endTime: newSlotPlan.endTime,
        durationMinutes: newSlotPlan.durationMinutes,
        bufferMinutes: newSlotPlan.bufferMinutes,
        startAt: Timestamp.fromDate(newSlotPlan.startAt),
        endAt: Timestamp.fromDate(newSlotPlan.endAt),
        slotIds: newSlotPlan.slotIds,
        priceSnapshot: newPriceSnapshot,
        commissionSnapshot: newCommissionSnapshot,
        rescheduleCount: nextRescheduleCount,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid,
      });

      // Release slots no longer occupied
      for (const oldId of oldSlotIds) {
        if (!newSlotSet.has(oldId)) {
          const snap = slotSnapMap.get(oldId);
          if (
            snap?.exists() &&
            snap.data().status === BOOKING_SLOT_STATUS.ACTIVE &&
            snap.data().bookingId === bookingId
          ) {
            tx.update(slotRefMap.get(oldId), {
              status: BOOKING_SLOT_STATUS.RELEASED,
              bookingId: null,
              releasedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              updatedBy: actorUid,
            });
          }
        }
      }

      // Claim newly added slots (skip intersection already owned by bookingId unless kind changed)
      for (const newSlot of newSlotPlan.allSlots) {
        const ref = slotRefMap.get(newSlot.slotId);
        const snap = slotSnapMap.get(newSlot.slotId);
        if (!snap?.exists()) {
          tx.set(ref, {
            slotId: newSlot.slotId,
            businessId,
            studioId: current.studioId,
            dateKey: newSlotPlan.dateKey,
            bucketIndex: newSlot.bucketIndex,
            slotTime: newSlot.slotTime,
            kind: newSlot.kind,
            status: BOOKING_SLOT_STATUS.ACTIVE,
            bookingId,
            slotStartAt: Timestamp.fromDate(newSlot.slotStartAt),
            slotEndAt: Timestamp.fromDate(newSlot.slotEndAt),
            reservedBy: actorUid,
            reservedAt: serverTimestamp(),
            releasedAt: null,
            schemaVersion: SCHEMA_VERSIONS.BOOKING_SLOT,
            updatedAt: serverTimestamp(),
            updatedBy: actorUid,
          });
        } else if (!oldSlotSet.has(newSlot.slotId) || snap.data().status === BOOKING_SLOT_STATUS.RELEASED) {
          tx.update(ref, {
            kind: newSlot.kind,
            status: BOOKING_SLOT_STATUS.ACTIVE,
            bookingId,
            slotStartAt: Timestamp.fromDate(newSlot.slotStartAt),
            slotEndAt: Timestamp.fromDate(newSlot.slotEndAt),
            reservedBy: actorUid,
            reservedAt: serverTimestamp(),
            releasedAt: null,
            updatedAt: serverTimestamp(),
            updatedBy: actorUid,
          });
        } else if (snap.data().kind !== newSlot.kind) {
          tx.update(ref, {
            kind: newSlot.kind,
            updatedAt: serverTimestamp(),
            updatedBy: actorUid,
          });
        }
      }

      const eventId = `${ACTIVITY_EVENT_TYPE.BOOKING_RESCHEDULED}__${bookingId}__r${nextRescheduleCount}`;
      const activityRef = doc(db, 'businesses', businessId, 'activityLogs', eventId);
      tx.set(activityRef, {
        eventId,
        businessId,
        studioId: current.studioId,
        eventType: ACTIVITY_EVENT_TYPE.BOOKING_RESCHEDULED,
        entityType: ACTIVITY_ENTITY_TYPE.BOOKING,
        entityId: bookingId,
        operationId: eventId,
        actorUid,
        actorRole,
        beforeStatus: current.status,
        afterStatus: current.status,
        reason: reason ? reason.trim() : null,
        summary: `Reschedule dari ${current.dateKey} ${current.startTime} ke ${newSlotPlan.dateKey} ${newSlotPlan.startTime}–${newSlotPlan.endTime}.`,
        schemaVersion: SCHEMA_VERSIONS.ACTIVITY_LOG,
        createdAt: serverTimestamp(),
      });

      return {
        ...current,
        dateKey: newSlotPlan.dateKey,
        startTime: newSlotPlan.startTime,
        endTime: newSlotPlan.endTime,
        durationMinutes: newSlotPlan.durationMinutes,
        slotIds: newSlotPlan.slotIds,
        priceSnapshot: newPriceSnapshot,
        commissionSnapshot: newCommissionSnapshot,
        rescheduleCount: nextRescheduleCount,
      };
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw mapFirebaseError(error);
  }
}
