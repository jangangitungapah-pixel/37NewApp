import {
  BOOKING_STATUS,
  SESSION_ACTION,
  SESSION_STATUS,
} from '../enums/roles.js';
import {
  DomainValidationError,
  optionalStringOrNull,
  requireNonEmptyString,
} from './schemaValidators.js';
import { zonedDateTimeToDate } from '../calculations/slotGenerator.js';

export const NO_SHOW_GRACE_MINUTES = 15;
export const NO_SHOW_REASON_MIN_LENGTH = 4;
export const DECISION_REASON_MIN_LENGTH = 3;

export const SESSION_TRANSITIONS = Object.freeze({
  [SESSION_STATUS.PENDING]: Object.freeze([SESSION_STATUS.UPCOMING, SESSION_STATUS.CANCELLED]),
  [SESSION_STATUS.UPCOMING]: Object.freeze([
    SESSION_STATUS.IN_PROGRESS,
    SESSION_STATUS.NO_SHOW,
    SESSION_STATUS.CANCELLED,
  ]),
  [SESSION_STATUS.IN_PROGRESS]: Object.freeze([
    SESSION_STATUS.COMPLETED,
    SESSION_STATUS.CANCELLED,
  ]),
  [SESSION_STATUS.COMPLETED]: Object.freeze([]),
  [SESSION_STATUS.NO_SHOW]: Object.freeze([]),
  [SESSION_STATUS.CANCELLED]: Object.freeze([]),
});

export function resolveSessionStatus(booking) {
  if (booking?.sessionStatus) return booking.sessionStatus;
  switch (booking?.status) {
    case BOOKING_STATUS.PENDING_CONFIRMATION:
      return SESSION_STATUS.PENDING;
    case BOOKING_STATUS.CONFIRMED:
      return SESSION_STATUS.UPCOMING;
    case BOOKING_STATUS.IN_PROGRESS:
      return SESSION_STATUS.IN_PROGRESS;
    case BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT:
    case BOOKING_STATUS.SETTLEMENT_REVIEW:
    case BOOKING_STATUS.SETTLED:
      return SESSION_STATUS.COMPLETED;
    case BOOKING_STATUS.NO_SHOW:
      return SESSION_STATUS.NO_SHOW;
    case BOOKING_STATUS.CANCELLED:
    case BOOKING_STATUS.REJECTED:
      return SESSION_STATUS.CANCELLED;
    default:
      return SESSION_STATUS.PENDING;
  }
}

export function resolveScheduledStartAt(booking) {
  const stored = booking?.startAt;
  if (stored instanceof Date && Number.isFinite(stored.getTime())) return stored;
  if (stored && typeof stored.toDate === 'function') {
    const date = stored.toDate();
    if (date instanceof Date && Number.isFinite(date.getTime())) return date;
  }
  try {
    return zonedDateTimeToDate(
      booking.dateKey,
      booking.startTime,
      booking.timezone || booking.studioSnapshot?.timezone || 'Asia/Jakarta',
    );
  } catch {
    throw new DomainValidationError('Waktu mulai terjadwal booking tidak valid.', 'startAt');
  }
}

export function assertSessionActionAllowed({
  action,
  booking,
  reason = null,
  now = new Date(),
}) {
  if (!booking || typeof booking !== 'object') {
    throw new DomainValidationError('Booking tidak ditemukan.', 'booking');
  }
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) {
    throw new DomainValidationError('Waktu aksi sesi tidak valid.', 'now');
  }
  const sessionStatus = resolveSessionStatus(booking);
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';

  switch (action) {
    case SESSION_ACTION.CHECK_IN:
      if (sessionStatus !== SESSION_STATUS.UPCOMING || booking.checkedInAt) {
        throw new DomainValidationError('Check-in hanya dapat dilakukan satu kali sebelum sesi dimulai.', 'checkedInAt');
      }
      return { sessionStatus, nextSessionStatus: SESSION_STATUS.UPCOMING, nextBookingStatus: booking.status };

    case SESSION_ACTION.START:
      if (sessionStatus !== SESSION_STATUS.UPCOMING || booking.status !== BOOKING_STATUS.CONFIRMED) {
        throw new DomainValidationError('Sesi hanya dapat dimulai dari booking yang sudah dikonfirmasi dan belum berjalan.', 'sessionStatus');
      }
      if (booking.actualStartAt) {
        throw new DomainValidationError('Waktu mulai aktual sudah tercatat.', 'actualStartAt');
      }
      return { sessionStatus, nextSessionStatus: SESSION_STATUS.IN_PROGRESS, nextBookingStatus: booking.status };

    case SESSION_ACTION.COMPLETE: {
      if (sessionStatus !== SESSION_STATUS.IN_PROGRESS) {
        throw new DomainValidationError('Sesi hanya dapat diselesaikan setelah dimulai.', 'sessionStatus');
      }
      const actualStartAt = booking.actualStartAt instanceof Date
        ? booking.actualStartAt
        : booking.actualStartAt?.toDate?.();
      if (!(actualStartAt instanceof Date) || !Number.isFinite(actualStartAt.getTime())) {
        throw new DomainValidationError('Sesi tidak memiliki waktu mulai aktual yang valid.', 'actualStartAt');
      }
      if (nowDate.getTime() < actualStartAt.getTime()) {
        throw new DomainValidationError('Waktu selesai tidak boleh lebih awal dari waktu mulai.', 'actualEndAt');
      }
      return {
        sessionStatus,
        nextSessionStatus: SESSION_STATUS.COMPLETED,
        nextBookingStatus: BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT,
        actualDurationMinutes: Math.floor((nowDate.getTime() - actualStartAt.getTime()) / 60000),
      };
    }

    case SESSION_ACTION.NO_SHOW: {
      if (sessionStatus !== SESSION_STATUS.UPCOMING || booking.status !== BOOKING_STATUS.CONFIRMED) {
        throw new DomainValidationError('No-show hanya berlaku untuk booking terkonfirmasi yang belum dimulai.', 'sessionStatus');
      }
      if (booking.checkedInAt) {
        throw new DomainValidationError('Customer sudah check-in; booking tidak dapat ditandai No-Show.', 'checkedInAt');
      }
      if (cleanReason.length < NO_SHOW_REASON_MIN_LENGTH) {
        throw new DomainValidationError('Alasan No-Show wajib diisi minimal 4 karakter.', 'reason');
      }
      const scheduledStartAt = resolveScheduledStartAt(booking);
      const eligibleAt = scheduledStartAt.getTime() + NO_SHOW_GRACE_MINUTES * 60000;
      if (nowDate.getTime() < eligibleAt) {
        const remainingMinutes = Math.ceil((eligibleAt - nowDate.getTime()) / 60000);
        throw new DomainValidationError(
          `No-Show baru dapat dicatat setelah 15 menit dari jadwal mulai (sekitar ${remainingMinutes} menit lagi).`,
          'noShowAt',
        );
      }
      return { sessionStatus, nextSessionStatus: SESSION_STATUS.NO_SHOW, nextBookingStatus: BOOKING_STATUS.NO_SHOW };
    }

    case SESSION_ACTION.CANCEL:
      // Preserve the existing NewApp cancellation path for legacy IN_PROGRESS bookings.
      if (![BOOKING_STATUS.PENDING_CONFIRMATION, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status)) {
        throw new DomainValidationError('Booking ini tidak dapat dibatalkan pada status saat ini.', 'status');
      }
      if (sessionStatus === SESSION_STATUS.COMPLETED || sessionStatus === SESSION_STATUS.NO_SHOW || sessionStatus === SESSION_STATUS.CANCELLED) {
        throw new DomainValidationError('Sesi sudah berada pada status terminal.', 'sessionStatus');
      }
      if (cleanReason.length < DECISION_REASON_MIN_LENGTH) {
        throw new DomainValidationError('Alasan pembatalan wajib diisi minimal 3 karakter.', 'reason');
      }
      return { sessionStatus, nextSessionStatus: SESSION_STATUS.CANCELLED, nextBookingStatus: BOOKING_STATUS.CANCELLED };

    case SESSION_ACTION.REJECT:
      if (booking.status !== BOOKING_STATUS.PENDING_CONFIRMATION || sessionStatus !== SESSION_STATUS.PENDING) {
        throw new DomainValidationError('Hanya booking yang menunggu konfirmasi yang dapat ditolak.', 'status');
      }
      if (cleanReason.length < DECISION_REASON_MIN_LENGTH) {
        throw new DomainValidationError('Alasan penolakan wajib diisi minimal 3 karakter.', 'reason');
      }
      return { sessionStatus, nextSessionStatus: SESSION_STATUS.CANCELLED, nextBookingStatus: BOOKING_STATUS.REJECTED };

    default:
      throw new DomainValidationError(`Aksi sesi tidak dikenal: ${action}`, 'action');
  }
}


const VALID_SESSION_ACTIONS = new Set(Object.values(SESSION_ACTION));
const VALID_SESSION_STATUSES = new Set(Object.values(SESSION_STATUS));

/**
 * Validates append-only business-scoped booking session history.
 * Timestamp normalization is handled by the Firestore mapper.
 */
export function validateBookingSessionEventDoc(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DomainValidationError('Dokumen riwayat sesi tidak valid.', 'event');
  }

  const action = requireNonEmptyString(raw.action, 'action');
  if (!VALID_SESSION_ACTIONS.has(action)) {
    throw new DomainValidationError(`Aksi riwayat sesi tidak dikenal: ${action}`, 'action');
  }

  const fromStatus = requireNonEmptyString(raw.fromStatus, 'fromStatus');
  const toStatus = requireNonEmptyString(raw.toStatus, 'toStatus');
  if (!VALID_SESSION_STATUSES.has(fromStatus) || !VALID_SESSION_STATUSES.has(toStatus)) {
    throw new DomainValidationError('Status awal/akhir riwayat sesi tidak valid.', 'fromStatus');
  }

  const actorRole = requireNonEmptyString(raw.actorRole, 'actorRole');
  if (!['owner', 'operator'].includes(actorRole)) {
    throw new DomainValidationError('Role aktor riwayat sesi tidak valid.', 'actorRole');
  }

  const payloadHash = requireNonEmptyString(raw.payloadHash, 'payloadHash');
  if (!/^[a-f0-9]{16,64}$/.test(payloadHash)) {
    throw new DomainValidationError('Hash payload operasi sesi tidak valid.', 'payloadHash');
  }

  const reason = optionalStringOrNull(raw.reason, 'reason');
  if (reason && reason.length > 300) {
    throw new DomainValidationError('Alasan aksi sesi maksimal 300 karakter.', 'reason');
  }

  return {
    eventId: requireNonEmptyString(raw.eventId, 'eventId'),
    businessId: requireNonEmptyString(raw.businessId, 'businessId'),
    bookingId: requireNonEmptyString(raw.bookingId, 'bookingId'),
    studioId: requireNonEmptyString(raw.studioId, 'studioId'),
    action,
    fromStatus,
    toStatus,
    actorUid: requireNonEmptyString(raw.actorUid, 'actorUid'),
    actorRole,
    actorName: requireNonEmptyString(raw.actorName, 'actorName'),
    reason,
    operationId: requireNonEmptyString(raw.operationId, 'operationId'),
    requestId: requireNonEmptyString(raw.requestId, 'requestId'),
    payloadHash,
    schemaVersion: Number.isSafeInteger(raw.schemaVersion) && raw.schemaVersion >= 1
      ? raw.schemaVersion
      : 1,
    createdAt: raw.createdAt ?? null,
  };
}
