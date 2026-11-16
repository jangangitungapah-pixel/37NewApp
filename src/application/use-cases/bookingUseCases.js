import {
  BOOKING_STATUS,
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
  generateNewBookingId,
  rescheduleBookingTransaction,
  transitionBookingStatusTransaction,
} from '../../data/repositories/bookingRepository.js';

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

  const bookingId = generateNewBookingId(member.businessId);
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

  return createBookingTransaction({
    businessId: member.businessId,
    booking,
    slotPlan,
    actorUid: member.uid,
    actorRole: member.role,
  });
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
  isOnline = true,
}) {
  assertOnline(isOnline);
  assertBookingStudioAccess(member, booking?.studioId);
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

  return transitionBookingStatusTransaction({
    businessId: member.businessId,
    bookingId: booking.bookingId,
    targetStatus,
    reason,
    actorUid: member.uid,
    actorRole: member.role,
  });
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

  return rescheduleBookingTransaction({
    businessId: member.businessId,
    bookingId: booking.bookingId,
    newSlotPlan,
    newPriceSnapshot,
    newCommissionSnapshot,
    reason: reason || `Reschedule jadwal ke ${newDateKey} ${newStartTime}`,
    actorUid: member.uid,
    actorRole: member.role,
  });
}

export { BOOKING_STATUS };
