import {
  BOOKING_OPERATION_TYPE,
  NOTIFICATION_TYPE,
  ROLES,
  SESSION_ACTION,
} from '../../domain/enums/roles.js';
import { canOperateStudioBooking } from '../../domain/policies/accessPolicy.js';
import { AppError, ERROR_CATEGORY } from '../../data/firebase/errorMapper.js';
import {
  performBookingSessionActionTransaction,
} from '../../data/repositories/bookingSessionRepository.js';
import {
  clearOperationContext,
  getOrCreateOperationContext,
} from '../../shared/utils/bookingOperationIds.js';
import { dispatchNotificationSafeUseCase } from './notificationUseCases.js';

function assertOnline(isOnline) {
  if (isOnline === false) {
    throw new AppError({
      category: ERROR_CATEGORY.UNAVAILABLE,
      code: 'network/offline-session-write-blocked',
      message: 'Aksi sesi membutuhkan koneksi aktif agar status dan riwayat dapat disimpan secara atomik.',
      retryable: true,
    });
  }
}

function resolveNotificationTargets({ member, booking, businessOwnerUid }) {
  if (member.role === ROLES.OPERATOR) return businessOwnerUid ? [businessOwnerUid] : [];
  const operatorUid = booking?.operatorUid || booking?.createdBy || '';
  return operatorUid ? [operatorUid] : [];
}

const NOTIFICATION_BY_SESSION_ACTION = Object.freeze({
  [SESSION_ACTION.START]: NOTIFICATION_TYPE.BOOKING_STARTED,
  [SESSION_ACTION.COMPLETE]: NOTIFICATION_TYPE.BOOKING_COMPLETED,
  [SESSION_ACTION.NO_SHOW]: NOTIFICATION_TYPE.BOOKING_CANCELLED,
  [SESSION_ACTION.CANCEL]: NOTIFICATION_TYPE.BOOKING_CANCELLED,
  [SESSION_ACTION.REJECT]: NOTIFICATION_TYPE.BOOKING_CANCELLED,
});

/**
 * Runs one booking-session action through the domain validator and transactional
 * repository. Actor identity is derived from the authenticated member context.
 */
export async function performBookingSessionActionUseCase({
  member,
  booking,
  action,
  reason = null,
  businessOwnerUid = null,
  isOnline = true,
  referenceNow = new Date(),
}) {
  assertOnline(isOnline);
  if (!member?.businessId || !member?.uid || !booking?.bookingId || !booking?.studioId) {
    throw new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'booking/session-context-invalid',
      message: 'Konteks bisnis, pengguna, atau booking tidak lengkap.',
    });
  }
  if (!canOperateStudioBooking(member, booking.studioId)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/booking-session-studio-denied',
      message: 'Anda tidak memiliki izin mengelola sesi pada studio ini.',
    });
  }
  if (!Object.values(SESSION_ACTION).includes(action)) {
    throw new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'booking/session-action-invalid',
      message: 'Aksi sesi tidak dikenal.',
    });
  }

  const cleanReason = typeof reason === 'string' ? reason.trim() : null;
  const operationContext = await getOrCreateOperationContext({
    businessId: member.businessId,
    actorUid: member.uid,
    operationType: BOOKING_OPERATION_TYPE.SESSION,
    payload: {
      bookingId: booking.bookingId,
      studioId: booking.studioId,
      action,
      reason: cleanReason,
    },
  });

  const actorName = String(member.displayName || member.name || member.email || 'Pengguna').trim().slice(0, 120);
  const updated = await performBookingSessionActionTransaction({
    businessId: member.businessId,
    bookingId: booking.bookingId,
    action,
    reason: cleanReason,
    actorUid: member.uid,
    actorRole: member.role,
    actorName,
    operationContext,
    referenceNow,
  });
  clearOperationContext(operationContext);

  const notificationType = NOTIFICATION_BY_SESSION_ACTION[action];
  if (notificationType) {
    const recipientUids = resolveNotificationTargets({
      member,
      booking,
      businessOwnerUid,
    });
    const customerName = booking.customerSnapshot?.name || booking.bookingId;
    const actionLabels = {
      [SESSION_ACTION.START]: 'dimulai',
      [SESSION_ACTION.COMPLETE]: 'selesai dan siap diproses Finance',
      [SESSION_ACTION.NO_SHOW]: 'ditandai No-Show',
      [SESSION_ACTION.CANCEL]: 'dibatalkan',
      [SESSION_ACTION.REJECT]: 'ditolak',
    };
    await dispatchNotificationSafeUseCase({
      member,
      recipientUids,
      studioId: booking.studioId,
      eventId: `booking.session.${action}__${operationContext.operationId}`,
      type: notificationType,
      entityType: 'booking',
      entityId: booking.bookingId,
      title: action === SESSION_ACTION.COMPLETE
        ? 'Sesi Selesai — Siap Settlement'
        : `Sesi Booking ${actionLabels[action] || action}`,
      message: `${customerName} · ${booking.dateKey} ${booking.startTime} — sesi ${actionLabels[action] || action}.`,
      actionPath: action === SESSION_ACTION.COMPLETE && member.role === ROLES.OPERATOR
        ? '/owner/finance'
        : member.role === ROLES.OPERATOR
          ? '/owner/bookings'
          : '/operator/bookings',
      isOnline,
    });
  }

  return updated;
}
