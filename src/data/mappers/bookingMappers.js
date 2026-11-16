import {
  validateActivityLogDoc,
  validateBookingDoc,
  validateBookingSlotDoc,
} from '../../domain/validators/bookingValidator.js';

function normalizeTimestampValue(value) {
  if (!value) {
    return null;
  }
  if (typeof value.toDate === 'function') {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  return value;
}

/**
 * @param {import('firebase/firestore').DocumentSnapshot} snapshot
 */
export function mapBookingSnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) {
    return null;
  }
  const raw = snapshot.data();
  return validateBookingDoc({
    bookingId: snapshot.id,
    businessId: snapshot.ref.parent.parent?.id || raw?.businessId,
    ...raw,
    startAt: normalizeTimestampValue(raw?.startAt),
    endAt: normalizeTimestampValue(raw?.endAt),
    cancelledAt: normalizeTimestampValue(raw?.cancelledAt),
    checkedInAt: normalizeTimestampValue(raw?.checkedInAt),
    completedAt: normalizeTimestampValue(raw?.completedAt),
    createdAt: normalizeTimestampValue(raw?.createdAt),
    updatedAt: normalizeTimestampValue(raw?.updatedAt),
  });
}

/**
 * @param {import('firebase/firestore').DocumentSnapshot} snapshot
 */
export function mapBookingSlotSnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) {
    return null;
  }
  const raw = snapshot.data();
  return validateBookingSlotDoc({
    slotId: snapshot.id,
    businessId: snapshot.ref.parent.parent?.id || raw?.businessId,
    ...raw,
    slotStartAt: normalizeTimestampValue(raw?.slotStartAt),
    slotEndAt: normalizeTimestampValue(raw?.slotEndAt),
    reservedAt: normalizeTimestampValue(raw?.reservedAt),
    releasedAt: normalizeTimestampValue(raw?.releasedAt),
    updatedAt: normalizeTimestampValue(raw?.updatedAt),
  });
}

/**
 * @param {import('firebase/firestore').DocumentSnapshot} snapshot
 */
export function mapActivityLogSnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) {
    return null;
  }
  const raw = snapshot.data();
  return validateActivityLogDoc({
    eventId: snapshot.id,
    businessId: snapshot.ref.parent.parent?.id || raw?.businessId,
    ...raw,
    createdAt: normalizeTimestampValue(raw?.createdAt),
  });
}
