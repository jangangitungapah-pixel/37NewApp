import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATUS,
  COMMISSION_BASIS,
  COMMISSION_METHOD,
  CUSTOMER_STATUS,
  MEMBER_STATUS,
  PRICING_MODEL,
  ROLES,
  SERVICE_CATEGORY,
  STUDIO_STATUS,
} from '../../src/domain/enums/roles.js';
import { DomainValidationError } from '../../src/domain/validators/schemaValidators.js';
import {
  addDaysToDateKey,
  computeBookingSlotPlan,
  formatSlotId,
  getWeekDateKeys,
  isValidDateKey,
  zonedDateTimeToDate,
} from '../../src/domain/calculations/slotGenerator.js';
import {
  assertValidBookingTransition,
  buildValidatedNewBookingPayload,
  canTransitionBookingStatus,
  validateActivityLogDoc,
  validateBookingSlotDoc,
} from '../../src/domain/validators/bookingValidator.js';
import {
  canApplyBookingDiscount,
  canOperateStudioBooking,
} from '../../src/domain/policies/accessPolicy.js';
import {
  createBookingUseCase,
  rescheduleBookingUseCase,
  transitionBookingStatusUseCase,
} from '../../src/application/use-cases/bookingUseCases.js';

const BIZ_ID = 'biz-37';
const OWNER_UID = 'owner-1';

const STUDIO_A = {
  studioId: 'studio-a',
  businessId: BIZ_ID,
  name: 'Studio A',
  code: 'STUDIO-A',
  status: STUDIO_STATUS.ACTIVE,
  timezone: 'Asia/Jakarta',
  operatingHours: { openTime: '10:00', closeTime: '22:00' },
  slotGranularityMinutes: 15,
};

const SERVICE_REHEARSAL = {
  serviceId: 'svc-1',
  businessId: BIZ_ID,
  name: 'Band Rehearsal',
  category: SERVICE_CATEGORY.REHEARSAL,
  pricingModel: PRICING_MODEL.HOURLY,
  durationOptions: [60, 90, 120],
  basePriceMinor: 160000,
  durationPricesMinor: {},
  commissionMethod: COMMISSION_METHOD.INHERIT,
  commissionValue: 0,
  applicableStudioIds: ['studio-a'],
  active: true,
  configVersion: 2,
};

const CUSTOMER_1 = {
  customerId: 'cust-1',
  businessId: BIZ_ID,
  name: 'Gema Nusantara',
  phone: '081234567890',
  bandOrActName: 'Gema Band',
  status: CUSTOMER_STATUS.ACTIVE,
};

describe('Phase 03 Booking Slot Generator, State Machine & Validators', () => {
  it('converts Asia/Jakarta local date & time to UTC instants deterministically and validates dateKeys', () => {
    expect(isValidDateKey('2026-11-16')).toBe(true);
    expect(isValidDateKey('2026-02-31')).toBe(false);
    expect(addDaysToDateKey('2026-11-16', 7)).toBe('2026-11-23');
    expect(getWeekDateKeys('2026-11-18')).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);

    // 14:00 WIB (UTC+7) === 07:00:00Z regardless of host OS timezone
    const utcInstant = zonedDateTimeToDate('2026-11-16', '14:00', 'Asia/Jakarta');
    expect(utcInstant.toISOString()).toBe('2026-11-16T07:00:00.000Z');
    expect(formatSlotId('studio-a', '2026-11-16', 40)).toBe('studio-a__2026-11-16__40');
  });

  it('computes contiguous 15-min lock buckets with bounded trailing buffer and boundary checks', () => {
    const plan = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: '2026-11-16',
      startTime: '14:00',
      durationMinutes: 90,
      bufferMinutes: 15,
      timezone: 'Asia/Jakarta',
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });

    expect(plan.endTime).toBe('15:30');
    expect(plan.sessionSlots).toHaveLength(6); // 14:00, 14:15, 14:30, 14:45, 15:00, 15:15
    expect(plan.bufferSlots).toHaveLength(1); // 15:30 turnaround
    expect(plan.slotIds).toEqual([
      'studio-a__2026-11-16__56',
      'studio-a__2026-11-16__57',
      'studio-a__2026-11-16__58',
      'studio-a__2026-11-16__59',
      'studio-a__2026-11-16__60',
      'studio-a__2026-11-16__61',
      'studio-a__2026-11-16__62',
    ]);

    // Trailing buffer capped cleanly at studio close time (22:00)
    const closingPlan = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: '2026-11-16',
      startTime: '21:00',
      durationMinutes: 60,
      bufferMinutes: 15,
      timezone: 'Asia/Jakarta',
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });
    expect(closingPlan.sessionSlots).toHaveLength(4);
    expect(closingPlan.bufferSlots).toHaveLength(0);

    // Reject granularity misalignment & out-of-hours bookings
    expect(() =>
      computeBookingSlotPlan({
        studioId: 'studio-a',
        dateKey: '2026-11-16',
        startTime: '10:15',
        durationMinutes: 60,
        operatingHours: { openTime: '10:00', closeTime: '22:00' },
        slotGranularityMinutes: 30,
      }),
    ).toThrow(DomainValidationError);

    expect(() =>
      computeBookingSlotPlan({
        studioId: 'studio-a',
        dateKey: '2026-11-16',
        startTime: '21:30',
        durationMinutes: 60,
        operatingHours: { openTime: '10:00', closeTime: '22:00' },
        slotGranularityMinutes: 15,
      }),
    ).toThrow(DomainValidationError);
  });

  it('builds complete immutable booking snapshots and rejects invalid references or past times', () => {
    const refNow = zonedDateTimeToDate('2026-11-16', '09:00', 'Asia/Jakarta');

    const { booking, slotPlan } = buildValidatedNewBookingPayload({
      bookingId: 'bk-101',
      businessId: BIZ_ID,
      actorUid: OWNER_UID,
      studio: STUDIO_A,
      service: SERVICE_REHEARSAL,
      customer: CUSTOMER_1,
      dateKey: '2026-11-16',
      startTime: '14:00',
      durationMinutes: 90,
      discountMinor: 40000,
      scheduleSetting: { bufferMinutes: 0 },
      pricingSetting: { taxPercent: 0 },
      commissionSetting: {
        defaultMethod: COMMISSION_METHOD.PERCENTAGE,
        defaultRatePercent: 10,
        basis: COMMISSION_BASIS.SETTLED_AMOUNT,
      },
      bookingPolicySetting: { defaultInitialStatus: BOOKING_STATUS.CONFIRMED },
      referenceNow: refNow,
    });

    expect(booking.priceSnapshot.baseSubtotalMinor).toBe(240000);
    expect(booking.priceSnapshot.totalMinor).toBe(200000);
    expect(booking.commissionSnapshot.amountMinor).toBe(20000);
    expect(booking.serviceSnapshot.configVersion).toBe(2);
    expect(slotPlan.slotIds).toHaveLength(6);

    // Reject creating past time slot
    expect(() =>
      buildValidatedNewBookingPayload({
        bookingId: 'bk-past',
        businessId: BIZ_ID,
        actorUid: OWNER_UID,
        studio: STUDIO_A,
        service: SERVICE_REHEARSAL,
        customer: CUSTOMER_1,
        dateKey: '2026-11-15',
        startTime: '14:00',
        durationMinutes: 60,
        referenceNow: refNow,
      }),
    ).toThrow(DomainValidationError);

    // Reject inapplicable studio service
    expect(() =>
      buildValidatedNewBookingPayload({
        bookingId: 'bk-wrong-studio',
        businessId: BIZ_ID,
        actorUid: OWNER_UID,
        studio: { ...STUDIO_A, studioId: 'studio-b' },
        service: SERVICE_REHEARSAL,
        customer: CUSTOMER_1,
        dateKey: '2026-11-16',
        startTime: '14:00',
        durationMinutes: 60,
        referenceNow: refNow,
      }),
    ).toThrow(DomainValidationError);
  });

  it('enforces strict booking lifecycle transitions, slot schema, and activity log schema', () => {
    expect(canTransitionBookingStatus(BOOKING_STATUS.PENDING_CONFIRMATION, BOOKING_STATUS.CONFIRMED)).toBe(true);
    expect(canTransitionBookingStatus(BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.IN_PROGRESS)).toBe(true);
    expect(canTransitionBookingStatus(BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT)).toBe(true);
    expect(canTransitionBookingStatus(BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.SETTLED)).toBe(false);
    expect(canTransitionBookingStatus(BOOKING_STATUS.CANCELLED, BOOKING_STATUS.CONFIRMED)).toBe(false);

    expect(() =>
      assertValidBookingTransition(BOOKING_STATUS.PENDING_CONFIRMATION, BOOKING_STATUS.SETTLED),
    ).toThrow(DomainValidationError);

    expect(() =>
      validateBookingSlotDoc({
        slotId: 'studio-b__2026-11-16__40',
        businessId: BIZ_ID,
        studioId: 'studio-a',
        dateKey: '2026-11-16',
        bucketIndex: 40,
        slotTime: '10:00',
        status: 'active',
        bookingId: 'bk-1',
        slotStartAt: new Date(),
        slotEndAt: new Date(Date.now() + 900000),
        reservedBy: OWNER_UID,
        updatedBy: OWNER_UID,
      }),
    ).toThrow(DomainValidationError);

    const logDoc = validateActivityLogDoc({
      eventId: 'ev-1',
      businessId: BIZ_ID,
      studioId: 'studio-a',
      eventType: 'booking.cancelled',
      entityId: 'bk-1',
      operationId: 'booking.cancelled__bk-1',
      actorUid: OWNER_UID,
      actorRole: ROLES.OWNER,
      beforeStatus: BOOKING_STATUS.CONFIRMED,
      afterStatus: BOOKING_STATUS.CANCELLED,
      reason: 'Customer reschedule next week',
      summary: 'Booking dibatalkan',
    });
    expect(logDoc.entityType).toBe('booking');
  });

  it('enforces studio booking access policy, discount policy, and offline block in booking use cases', async () => {
    const owner = { role: ROLES.OWNER, status: MEMBER_STATUS.ACTIVE, businessId: BIZ_ID, uid: OWNER_UID };
    const opA = {
      role: ROLES.OPERATOR,
      status: MEMBER_STATUS.ACTIVE,
      businessId: BIZ_ID,
      uid: 'op-a',
      assignedStudioIds: ['studio-a'],
      permissions: { canManageBookings: true, canApplyDiscount: true },
    };

    expect(canOperateStudioBooking(opA, 'studio-a')).toBe(true);
    expect(canOperateStudioBooking(opA, 'studio-b')).toBe(false);
    expect(canApplyBookingDiscount(opA, { allowOperatorDiscount: false })).toBe(false);
    expect(canApplyBookingDiscount(opA, { allowOperatorDiscount: true })).toBe(true);
    expect(canApplyBookingDiscount(owner, { allowOperatorDiscount: false })).toBe(true);

    await expect(
      createBookingUseCase({
        member: owner,
        studio: STUDIO_A,
        service: SERVICE_REHEARSAL,
        customer: CUSTOMER_1,
        dateKey: '2026-11-17',
        startTime: '10:00',
        durationMinutes: 60,
        isOnline: false,
      }),
    ).rejects.toMatchObject({ code: 'network/offline-write-blocked' });

    await expect(
      transitionBookingStatusUseCase({
        member: owner,
        booking: { bookingId: 'bk-1', studioId: 'studio-a', status: BOOKING_STATUS.CONFIRMED },
        targetStatus: BOOKING_STATUS.CANCELLED,
        reason: 'Offline attempt',
        isOnline: false,
      }),
    ).rejects.toMatchObject({ code: 'network/offline-write-blocked' });

    await expect(
      rescheduleBookingUseCase({
        member: owner,
        booking: {
          bookingId: 'bk-1',
          studioId: 'studio-a',
          status: BOOKING_STATUS.CONFIRMED,
          durationMinutes: 60,
        },
        studio: STUDIO_A,
        newDateKey: '2026-11-18',
        newStartTime: '12:00',
        isOnline: false,
      }),
    ).rejects.toMatchObject({ code: 'network/offline-write-blocked' });
  });
});
