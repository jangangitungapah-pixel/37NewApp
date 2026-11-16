import {
  BOOKING_OPERATION_TYPE,
  BOOKING_STATUS,
  NOTIFICATION_TYPE,
  ROLES,
} from '../../domain/enums/roles.js';
import {
  canApplyBookingDiscount,
  canOperateStudioBooking,
} from '../../domain/policies/accessPolicy.js';
import { calculateOperatorCommission } from '../../domain/calculations/commissionCalculator.js';
import { calculateServicePrice } from '../../domain/calculations/pricingCalculator.js';
import { computeBookingSlotPlan, getTodayDateKey } from '../../domain/calculations/slotGenerator.js';
import {
  assertBookingNotInPast,
  assertValidBookingTransition,
  buildValidatedNewBookingPayload,
  RELEASING_BOOKING_STATUSES,
  RESCHEDULABLE_BOOKING_STATUSES,
} from '../../domain/validators/bookingValidator.js';
import { AppError, ERROR_CATEGORY } from '../../data/firebase/errorMapper.js';
import {
  createBookingTransaction,
  rescheduleBookingTransaction,
  transitionBookingStatusTransaction,
} from '../../data/repositories/bookingRepository.js';
import {
  clearOperationContext,
  getOrCreateOperationContext,
} from '../../shared/utils/bookingOperationIds.js';
import { dispatchNotificationSafeUseCase } from './notificationUseCases.js';

function resolveCrossPortalTargets({ member, businessOwnerUid, booking }) {
  if (member?.role === ROLES.OPERATOR) {
    return businessOwnerUid ? [businessOwnerUid] : [];
  }
  const staffUid = booking?.operatorUid || booking?.createdBy || '';
  return staffUid ? [staffUid] : [];
}

function assertOnline(isOnline) {
  if (isOnline === false) {
    throw new AppError({
      category: ERROR_CATEGORY.UNAVAILABLE,
      code: 'network/offline-write-blocked',
      message:
        'Operasi booking membutuhkan koneksi aktif agar lock slot anti-double-booking dapat divalidasi di Firestore.',
      retryable: true,
    });
  }
}

function assertBookingStudioAccess(member, studioId) {
  if (!canOperateStudioBooking(member, studioId)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/booking-studio-denied',
      message: 'Anda tidak memiliki izin mengelola booking pada studio ini.',
    });
  }
}

/**
 * Creates and confirms a booking atomically with deterministic `bookingSlots` lock
 * and append-only `activityLogs` entry.
 */
export async function createBookingUseCase({
  member,
  studio,
  service,
  customer,
  operatorUid = null,
  dateKey,
  startTime,
  durationMinutes,
  discountMinor = 0,
  notes = null,
  requestedInitialStatus = null,
  scheduleSetting = null,
  pricingSetting = null,
  commissionSetting = null,
  bookingPolicySetting = null,
  businessOwnerUid = null,
  isOnline = true,
  referenceNow = new Date(),
  allowPastForTest = false,
}) {
  assertOnline(isOnline);
  assertBookingStudioAccess(member, studio?.studioId);

  const normalizedDiscount = Number(discountMinor || 0);
  if (normalizedDiscount > 0 && !canApplyBookingDiscount(member, pricingSetting)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/discount-not-allowed',
      message: 'Kebijakan saat ini tidak mengizinkan Anda memberikan diskon pada booking.',
    });
  }

  const operationContext = await getOrCreateOperationContext({
    businessId: member.businessId,
    actorUid: member.uid,
    operationType: BOOKING_OPERATION_TYPE.CREATE,
    payload: {
      studioId: studio.studioId,
      serviceId: service.serviceId,
      customerId: customer.customerId,
      operatorUid: operatorUid || member.uid,
      dateKey,
      startTime,
      durationMinutes,
      discountMinor: normalizedDiscount,
      notes: notes || null,
      initialStatus: requestedInitialStatus || bookingPolicySetting?.defaultInitialStatus || 'CONFIRMED',
    },
  });
  const bookingId = `bk_${operationContext.operationId.slice(-48)}`;
  const { booking, slotPlan } = buildValidatedNewBookingPayload({
    bookingId,
    businessId: member.businessId,
    actorUid: member.uid,
    studio,
    service,
    customer,
    operatorUid,
    dateKey,
    startTime,
    durationMinutes,
    discountMinor: normalizedDiscount,
    notes,
    requestedInitialStatus,
    scheduleSetting,
    pricingSetting,
    commissionSetting,
    bookingPolicySetting,
    referenceNow,
    allowPastForTest,
  });

  const created = await createBookingTransaction({
    businessId: member.businessId,
    booking,
    slotPlan,
    actorUid: member.uid,
    actorRole: member.role,
    operationContext,
  });
  clearOperationContext(operationContext);

  const recipients = resolveCrossPortalTargets({
    member,
    businessOwnerUid,
    booking: created,
  });
  await dispatchNotificationSafeUseCase({
    member,
    recipientUids: recipients,
    studioId: created.studioId,
    eventId: `booking.created__${created.bookingId}`,
    type: NOTIFICATION_TYPE.BOOKING_CREATED,
    entityType: 'booking',
    entityId: created.bookingId,
    title: 'Booking Studio Baru',
    message: `${created.customerSnapshot?.name} · ${created.studioSnapshot?.name} (${created.dateKey} ${created.startTime}–${created.endTime}).`,
    actionPath: member.role === ROLES.OPERATOR ? '/owner/bookings' : '/operator/bookings',
    isOnline,
  });

  return created;
}

/**
 * Transitions booking lifecycle status atomically (`CONFIRMED`, `IN_PROGRESS`,
 * `COMPLETED_PENDING_SETTLEMENT`, `CANCELLED`, `NO_SHOW`).
 */
export async function transitionBookingStatusUseCase({
  member,
  booking,
  targetStatus,
  reason = null,
  businessOwnerUid = null,
  isOnline = true,
}) {
  assertOnline(isOnline);
  assertBookingStudioAccess(member, booking?.studioId);

  // Booking decisions must not bypass the dedicated session state machine.
  // Confirmation is the only transition handled by this decision use case.
  if (targetStatus !== BOOKING_STATUS.CONFIRMED) {
    throw new AppError({
      category: ERROR_CATEGORY.FAILED_PRECONDITION,
      code: 'booking/session-action-required',
      message: 'Perubahan status operasional harus menggunakan booking session use case agar timestamp, actor, event, dan slot changes tercatat secara atomik.',
    });
  }
  assertValidBookingTransition(booking.status, targetStatus);

  if (RELEASING_BOOKING_STATUSES.has(targetStatus)) {
    const cleanReason = typeof reason === 'string' ? reason.trim() : '';
    if (cleanReason.length < 3) {
      throw new AppError({
        category: ERROR_CATEGORY.VALIDATION,
        code: 'validation/reason-required',
        message: 'Alasan pembatalan atau No-Show wajib diisi minimal 3 karakter.',
      });
    }
  }

  const operationContext = await getOrCreateOperationContext({
    businessId: member.businessId,
    actorUid: member.uid,
    operationType: BOOKING_OPERATION_TYPE.DECISION,
    payload: {
      bookingId: booking.bookingId,
      targetStatus,
      reason: typeof reason === 'string' ? reason.trim() : null,
    },
  });
  const updated = await transitionBookingStatusTransaction({
    businessId: member.businessId,
    bookingId: booking.bookingId,
    targetStatus,
    reason,
    actorUid: member.uid,
    actorRole: member.role,
    operationContext,
  });
  clearOperationContext(operationContext);

  const typeByStatus = {
    [BOOKING_STATUS.CONFIRMED]: NOTIFICATION_TYPE.BOOKING_CONFIRMED,
    [BOOKING_STATUS.IN_PROGRESS]: NOTIFICATION_TYPE.BOOKING_STARTED,
    [BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT]: NOTIFICATION_TYPE.BOOKING_COMPLETED,
    [BOOKING_STATUS.CANCELLED]: NOTIFICATION_TYPE.BOOKING_CANCELLED,
    [BOOKING_STATUS.NO_SHOW]: NOTIFICATION_TYPE.BOOKING_CANCELLED,
  };
  const notifType = typeByStatus[targetStatus];
  if (notifType) {
    const recipients = resolveCrossPortalTargets({
      member,
      businessOwnerUid,
      booking,
    });
    const isCompletedForOwner =
      member.role === ROLES.OPERATOR &&
      targetStatus === BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT;
    await dispatchNotificationSafeUseCase({
      member,
      recipientUids: recipients,
      studioId: booking.studioId,
      eventId: `${notifType.toLowerCase()}__${booking.bookingId}`,
      type: notifType,
      entityType: 'booking',
      entityId: booking.bookingId,
      title: isCompletedForOwner
        ? 'Sesi Selesai — Siap Settlement'
        : `Booking ${targetStatus}`,
      message: `${booking.customerSnapshot?.name || booking.bookingId} (${booking.dateKey} ${booking.startTime}) berubah menjadi ${targetStatus}.`,
      actionPath: isCompletedForOwner
        ? '/owner/finance'
        : member.role === ROLES.OPERATOR
          ? '/owner/bookings'
          : '/operator/bookings',
      isOnline,
    });
  }

  return updated;
}

/**
 * Atomically reschedules an existing active booking (`PENDING_CONFIRMATION` or `CONFIRMED`),
 * preserving historical price agreements unless duration changed.
 */
export async function rescheduleBookingUseCase({
  member,
  booking,
  studio,
  service = null,
  newDateKey,
  newStartTime,
  newDurationMinutes = null,
  reason = null,
  scheduleSetting = null,
  commissionSetting = null,
  bookingPolicySetting = null,
  businessOwnerUid = null,
  isOnline = true,
  referenceNow = new Date(),
  allowPastForTest = false,
}) {
  assertOnline(isOnline);
  assertBookingStudioAccess(member, booking?.studioId);

  if (!RESCHEDULABLE_BOOKING_STATUSES.has(booking.status)) {
    throw new AppError({
      category: ERROR_CATEGORY.FAILED_PRECONDITION,
      code: 'booking/reschedule-not-allowed',
      message: `Booking berstatus "${booking.status}" tidak dapat di-reschedule.`,
    });
  }

  const tz = studio?.timezone || booking.timezone || 'Asia/Jakarta';
  const todayKey = getTodayDateKey(tz, referenceNow);
  if (
    member.role !== ROLES.OWNER &&
    bookingPolicySetting?.allowSameDayReschedule === false &&
    (booking.dateKey === todayKey || newDateKey === todayKey)
  ) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/same-day-reschedule-disabled',
      message: 'Kebijakan bisnis menonaktifkan reschedule hari yang sama untuk Operator.',
    });
  }

  const targetDuration = Number(newDurationMinutes || booking.durationMinutes);
  const effectiveHours = studio?.operatingHours || booking.studioSnapshot?.operatingHours;
  const effectiveGranularity =
    studio?.slotGranularityMinutes || booking.studioSnapshot?.slotGranularityMinutes || 15;

  const newSlotPlan = computeBookingSlotPlan({
    studioId: booking.studioId,
    dateKey: newDateKey,
    startTime: newStartTime,
    durationMinutes: targetDuration,
    bufferMinutes: scheduleSetting?.bufferMinutes ?? booking.bufferMinutes ?? 0,
    timezone: tz,
    operatingHours: effectiveHours,
    slotGranularityMinutes: effectiveGranularity,
  });

  if (!allowPastForTest) {
    assertBookingNotInPast(newSlotPlan.startAt, referenceNow);
  }

  let newPriceSnapshot = booking.priceSnapshot;
  let newCommissionSnapshot = booking.commissionSnapshot;

  // Preserve historical quoted price when duration did not change; recalculate cleanly if duration changed
  if (targetDuration !== booking.durationMinutes) {
    const pricingBaseService = service || {
      ...booking.serviceSnapshot,
      durationOptions: [targetDuration],
      durationPricesMinor: {},
    };
    newPriceSnapshot = {
      ...calculateServicePrice({
        service: pricingBaseService,
        durationMinutes: targetDuration,
        discountMinor: booking.priceSnapshot.discountMinor || 0,
        taxPercent: booking.priceSnapshot.taxPercent || 0,
      }),
    };
    newCommissionSnapshot = {
      ...calculateOperatorCommission({
        service: service || { commissionMethod: 'inherit', commissionValue: 0 },
        commissionSetting,
        grossAmountMinor: newPriceSnapshot.baseSubtotalMinor,
        netAmountMinor: newPriceSnapshot.totalMinor,
      }),
    };
  }

  const resolvedReason = reason || `Reschedule jadwal ke ${newDateKey} ${newStartTime}`;
  const operationContext = await getOrCreateOperationContext({
    businessId: member.businessId,
    actorUid: member.uid,
    operationType: BOOKING_OPERATION_TYPE.RESCHEDULE,
    payload: {
      bookingId: booking.bookingId,
      studioId: booking.studioId,
      newDateKey,
      newStartTime,
      durationMinutes: targetDuration,
      reason: resolvedReason,
      priceSnapshot: newPriceSnapshot,
      commissionSnapshot: newCommissionSnapshot,
    },
  });
  const updated = await rescheduleBookingTransaction({
    businessId: member.businessId,
    bookingId: booking.bookingId,
    newSlotPlan,
    newPriceSnapshot,
    newCommissionSnapshot,
    reason: resolvedReason,
    actorUid: member.uid,
    actorRole: member.role,
    operationContext,
  });
  clearOperationContext(operationContext);

  const recipients = resolveCrossPortalTargets({
    member,
    businessOwnerUid,
    booking,
  });
  await dispatchNotificationSafeUseCase({
    member,
    recipientUids: recipients,
    studioId: booking.studioId,
    eventId: `booking.rescheduled__${booking.bookingId}__r${updated.rescheduleCount}`,
    type: NOTIFICATION_TYPE.BOOKING_RESCHEDULED,
    entityType: 'booking',
    entityId: booking.bookingId,
    title: 'Booking Di-reschedule',
    message: `${booking.customerSnapshot?.name || booking.bookingId} dipindah ke ${updated.dateKey} ${updated.startTime}–${updated.endTime}.`,
    actionPath: member.role === ROLES.OPERATOR ? '/owner/bookings' : '/operator/bookings',
    isOnline,
  });

  return updated;
}

export { BOOKING_STATUS };
