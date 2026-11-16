import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATUS,
  SESSION_ACTION,
  SESSION_STATUS,
} from '../../src/domain/enums/roles.js';
import {
  assertSessionActionAllowed,
  NO_SHOW_GRACE_MINUTES,
  resolveSessionStatus,
} from '../../src/domain/validators/bookingSessionValidator.js';
import { deriveSessionStatusFromBookingStatus } from '../../src/domain/validators/bookingValidator.js';
import { validateBookingSessionEventDoc } from '../../src/domain/validators/bookingSessionValidator.js';

const schedule = new Date('2026-11-20T07:00:00.000Z');
const baseBooking = {
  bookingId: 'bk-session-1',
  status: BOOKING_STATUS.CONFIRMED,
  sessionStatus: SESSION_STATUS.UPCOMING,
  dateKey: '2026-11-20',
  startTime: '14:00',
  timezone: 'Asia/Jakarta',
  startAt: schedule,
  checkedInAt: null,
  actualStartAt: null,
};

describe('Phase 10 booking/session lifecycle contracts', () => {
  it('keeps booking and session state machines separate', () => {
    expect(resolveSessionStatus(baseBooking)).toBe(SESSION_STATUS.UPCOMING);
    expect(deriveSessionStatusFromBookingStatus(BOOKING_STATUS.CONFIRMED)).toBe(SESSION_STATUS.UPCOMING);
    expect(deriveSessionStatusFromBookingStatus(BOOKING_STATUS.IN_PROGRESS)).toBe(SESSION_STATUS.IN_PROGRESS);
    expect(deriveSessionStatusFromBookingStatus(BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT)).toBe(SESSION_STATUS.COMPLETED);
  });

  it('records check-in without starting the session and rejects duplicate check-in', () => {
    const result = assertSessionActionAllowed({
      action: SESSION_ACTION.CHECK_IN,
      booking: baseBooking,
      now: new Date('2026-11-20T07:02:00.000Z'),
    });
    expect(result.nextSessionStatus).toBe(SESSION_STATUS.UPCOMING);
    expect(result.nextBookingStatus).toBe(BOOKING_STATUS.CONFIRMED);
    expect(() => assertSessionActionAllowed({
      action: SESSION_ACTION.CHECK_IN,
      booking: { ...baseBooking, checkedInAt: new Date() },
      now: new Date(),
    })).toThrow(/Check-in/);
  });

  it('starts only a confirmed upcoming session and completes only after a valid start', () => {
    const started = assertSessionActionAllowed({
      action: SESSION_ACTION.START,
      booking: baseBooking,
      now: new Date('2026-11-20T07:01:00.000Z'),
    });
    expect(started.nextSessionStatus).toBe(SESSION_STATUS.IN_PROGRESS);
    expect(started.nextBookingStatus).toBe(BOOKING_STATUS.CONFIRMED);

    expect(() => assertSessionActionAllowed({
      action: SESSION_ACTION.COMPLETE,
      booking: baseBooking,
      now: new Date('2026-11-20T08:00:00.000Z'),
    })).toThrow(/dimulai/);

    const completed = assertSessionActionAllowed({
      action: SESSION_ACTION.COMPLETE,
      booking: { ...baseBooking, sessionStatus: SESSION_STATUS.IN_PROGRESS, actualStartAt: new Date('2026-11-20T07:00:00.000Z') },
      now: new Date('2026-11-20T08:25:00.000Z'),
    });
    expect(completed.nextSessionStatus).toBe(SESSION_STATUS.COMPLETED);
    expect(completed.nextBookingStatus).toBe(BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT);
    expect(completed.actualDurationMinutes).toBe(85);
  });

  it('enforces no-show grace, check-in guard, and minimum reason length', () => {
    const beforeGrace = new Date(schedule.getTime() + NO_SHOW_GRACE_MINUTES * 60000 - 1);
    expect(() => assertSessionActionAllowed({
      action: SESSION_ACTION.NO_SHOW,
      booking: baseBooking,
      reason: 'Tidak hadir',
      now: beforeGrace,
    })).toThrow(/15 menit/);

    expect(() => assertSessionActionAllowed({
      action: SESSION_ACTION.NO_SHOW,
      booking: { ...baseBooking, checkedInAt: new Date() },
      reason: 'Tidak hadir',
      now: new Date(schedule.getTime() + 16 * 60000),
    })).toThrow(/sudah check-in/);

    expect(() => assertSessionActionAllowed({
      action: SESSION_ACTION.NO_SHOW,
      booking: baseBooking,
      reason: 'abs',
      now: new Date(schedule.getTime() + 16 * 60000),
    })).toThrow(/minimal 4/);

    const valid = assertSessionActionAllowed({
      action: SESSION_ACTION.NO_SHOW,
      booking: baseBooking,
      reason: 'Customer tidak hadir',
      now: new Date(schedule.getTime() + 15 * 60000),
    });
    expect(valid.nextBookingStatus).toBe(BOOKING_STATUS.NO_SHOW);
    expect(valid.nextSessionStatus).toBe(SESSION_STATUS.NO_SHOW);
  });

  it('allows rejection only from pending confirmation and preserves the legacy cancellation edge', () => {
    expect(assertSessionActionAllowed({
      action: SESSION_ACTION.REJECT,
      booking: { ...baseBooking, status: BOOKING_STATUS.PENDING_CONFIRMATION, sessionStatus: SESSION_STATUS.PENDING },
      reason: 'Studio tidak tersedia',
    }).nextBookingStatus).toBe(BOOKING_STATUS.REJECTED);

    expect(() => assertSessionActionAllowed({
      action: SESSION_ACTION.REJECT,
      booking: baseBooking,
      reason: 'Ditolak',
    })).toThrow(/menunggu konfirmasi/);

    expect(assertSessionActionAllowed({
      action: SESSION_ACTION.CANCEL,
      booking: { ...baseBooking, status: BOOKING_STATUS.IN_PROGRESS, sessionStatus: SESSION_STATUS.IN_PROGRESS, actualStartAt: schedule },
      reason: 'Operasional darurat',
    }).nextSessionStatus).toBe(SESSION_STATUS.CANCELLED);
  });
});

describe('Phase 10 append-only session event contract', () => {
  const validEvent = {
    eventId: 'booking_session__operation-1',
    businessId: 'business-1',
    bookingId: 'booking-1',
    studioId: 'studio-1',
    action: SESSION_ACTION.CHECK_IN,
    fromStatus: SESSION_STATUS.UPCOMING,
    toStatus: SESSION_STATUS.UPCOMING,
    actorUid: 'owner-1',
    actorRole: 'owner',
    actorName: 'Studio Owner',
    reason: null,
    operationId: 'booking_session__operation-1',
    requestId: 'request-1',
    payloadHash: 'a'.repeat(64),
    schemaVersion: 1,
    createdAt: new Date('2026-11-20T07:00:00.000Z'),
  };

  it('accepts a valid immutable session event contract', () => {
    expect(validateBookingSessionEventDoc(validEvent)).toMatchObject({
      eventId: validEvent.eventId,
      action: SESSION_ACTION.CHECK_IN,
      fromStatus: SESSION_STATUS.UPCOMING,
      toStatus: SESSION_STATUS.UPCOMING,
      actorUid: 'owner-1',
      payloadHash: 'a'.repeat(64),
    });
  });

  it.each([
    ['unknown action', { action: 'override' }],
    ['invalid source status', { fromStatus: 'SETTLED' }],
    ['invalid actor role', { actorRole: 'customer' }],
    ['malformed payload hash', { payloadHash: 'not-a-hash' }],
    ['missing operation ID', { operationId: '' }],
  ])('rejects an event with %s', (_label, patch) => {
    expect(() => validateBookingSessionEventDoc({ ...validEvent, ...patch })).toThrow();
  });

  it('rejects an event reason longer than the bounded audit field', () => {
    expect(() => validateBookingSessionEventDoc({
      ...validEvent,
      reason: 'x'.repeat(301),
    })).toThrow(/300 karakter/);
  });
});

