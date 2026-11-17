import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_STATUS, ROLES, SESSION_ACTION } from '../../src/domain/enums/roles.js';

const mocks = vi.hoisted(() => ({
  performTransaction: vi.fn(),
  createOperationContext: vi.fn(),
  clearOperationContext: vi.fn(),
  dispatchNotificationBatch: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('../../src/data/repositories/bookingSessionRepository.js', () => ({
  performBookingSessionActionTransaction: mocks.performTransaction,
}));

vi.mock('../../src/shared/utils/bookingOperationIds.js', () => ({
  getOrCreateOperationContext: mocks.createOperationContext,
  clearOperationContext: mocks.clearOperationContext,
}));

vi.mock('../../src/data/repositories/notificationRepository.js', () => ({
  dispatchNotificationBatch: mocks.dispatchNotificationBatch,
  markAllNotificationsAsRead: vi.fn(),
  markNotificationAsRead: vi.fn(),
}));

vi.mock('../../src/infrastructure/logging/logger.js', () => ({
  logger: { warn: mocks.loggerWarn },
}));

import { performBookingSessionActionUseCase } from '../../src/application/use-cases/bookingSessionUseCases.js';

const operationContext = {
  operationId: 'booking.session.complete__operation-42',
  requestId: 'request-session-complete-42',
  payloadHash: 'a'.repeat(64),
};

function makeOperator(overrides = {}) {
  return {
    uid: 'operator-1',
    businessId: 'business-1',
    displayName: 'Studio Operator',
    role: ROLES.OPERATOR,
    status: MEMBER_STATUS.ACTIVE,
    assignedStudioIds: ['studio-a'],
    permissions: { canManageBookings: true },
    ...overrides,
  };
}

function makeOwner(overrides = {}) {
  return {
    uid: 'owner-1',
    businessId: 'business-1',
    displayName: 'Studio Owner',
    role: ROLES.OWNER,
    status: MEMBER_STATUS.ACTIVE,
    assignedStudioIds: [],
    permissions: {},
    ...overrides,
  };
}

function makeBooking(overrides = {}) {
  return {
    bookingId: 'booking-1',
    studioId: 'studio-a',
    dateKey: '2026-11-20',
    startTime: '18:00',
    status: 'CONFIRMED',
    sessionStatus: 'IN_PROGRESS',
    actualStartAt: new Date('2026-11-20T11:00:00.000Z'),
    operatorUid: 'operator-1',
    createdBy: 'operator-1',
    customerSnapshot: { name: 'Band Satu' },
    ...overrides,
  };
}

describe('booking session use-case integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createOperationContext.mockResolvedValue(operationContext);
    mocks.performTransaction.mockResolvedValue({
      bookingId: 'booking-1',
      status: 'COMPLETED_PENDING_SETTLEMENT',
      sessionStatus: 'COMPLETED',
    });
    mocks.dispatchNotificationBatch.mockResolvedValue([]);
  });

  it('denies Operators without booking permission or assigned studio before opening a transaction', async () => {
    const booking = makeBooking();
    const noPermission = makeOperator({
      permissions: { canManageBookings: false },
    });
    const unassigned = makeOperator({ assignedStudioIds: [] });

    await expect(performBookingSessionActionUseCase({
      member: noPermission,
      booking,
      action: SESSION_ACTION.COMPLETE,
    })).rejects.toMatchObject({ code: 'authz/booking-session-studio-denied' });

    await expect(performBookingSessionActionUseCase({
      member: unassigned,
      booking,
      action: SESSION_ACTION.COMPLETE,
    })).rejects.toMatchObject({ code: 'authz/booking-session-studio-denied' });

    expect(mocks.createOperationContext).not.toHaveBeenCalled();
    expect(mocks.performTransaction).not.toHaveBeenCalled();
    expect(mocks.dispatchNotificationBatch).not.toHaveBeenCalled();
  });

  it('commits Operator completion before best-effort Owner Finance notification', async () => {
    const member = makeOperator();
    const booking = makeBooking();
    const updated = { bookingId: booking.bookingId, status: 'COMPLETED_PENDING_SETTLEMENT' };
    mocks.performTransaction.mockResolvedValue(updated);
    mocks.dispatchNotificationBatch.mockRejectedValue(new Error('notification transport unavailable'));

    await expect(performBookingSessionActionUseCase({
      member,
      booking,
      action: SESSION_ACTION.COMPLETE,
      businessOwnerUid: 'owner-1',
    })).resolves.toBe(updated);

    expect(mocks.performTransaction).toHaveBeenCalledOnce();
    expect(mocks.clearOperationContext).toHaveBeenCalledWith(operationContext);
    expect(mocks.dispatchNotificationBatch).toHaveBeenCalledWith(expect.objectContaining({
      businessId: 'business-1',
      recipientUids: ['owner-1'],
      type: 'BOOKING_COMPLETED',
      actionPath: '/owner/finance',
      entityType: 'booking',
      entityId: booking.bookingId,
      actorUid: member.uid,
    }));
    expect(mocks.performTransaction.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.dispatchNotificationBatch.mock.invocationCallOrder[0]);
    expect(mocks.clearOperationContext.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.dispatchNotificationBatch.mock.invocationCallOrder[0]);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'notifications',
      'Notification dispatch failed non-fatally after primary commit',
      expect.objectContaining({
        type: 'BOOKING_COMPLETED',
        entityId: booking.bookingId,
        code: 'notification transport unavailable',
      }),
    );
  });

  it('notifies the configured Operator when Owner completes a session', async () => {
    const member = makeOwner();
    const booking = makeBooking({
      operatorUid: 'assigned-operator-7',
      createdBy: 'owner-1',
    });

    await expect(performBookingSessionActionUseCase({
      member,
      booking,
      action: SESSION_ACTION.COMPLETE,
    })).resolves.toMatchObject({ status: 'COMPLETED_PENDING_SETTLEMENT' });

    expect(mocks.dispatchNotificationBatch).toHaveBeenCalledWith(expect.objectContaining({
      recipientUids: ['assigned-operator-7'],
      type: 'BOOKING_COMPLETED',
      actionPath: '/operator/bookings',
      actorUid: member.uid,
    }));
  });

  it('does not dispatch a secondary notification when the primary transaction fails', async () => {
    mocks.performTransaction.mockRejectedValue(new Error('transaction rejected'));

    await expect(performBookingSessionActionUseCase({
      member: makeOperator(),
      booking: makeBooking(),
      action: SESSION_ACTION.COMPLETE,
      businessOwnerUid: 'owner-1',
    })).rejects.toThrow('transaction rejected');

    expect(mocks.dispatchNotificationBatch).not.toHaveBeenCalled();
    expect(mocks.clearOperationContext).not.toHaveBeenCalled();
  });
});
