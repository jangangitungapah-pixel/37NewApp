import { describe, expect, it, vi } from 'vitest';
import {
  MEMBER_STATUS,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_TYPE,
  ROLES,
} from '../../src/domain/enums/roles.js';
import { DomainValidationError } from '../../src/domain/validators/schemaValidators.js';
import {
  buildNotificationId,
  countUnreadNotifications,
  filterNotificationsByReadState,
  validateNotificationDoc,
} from '../../src/domain/validators/notificationValidators.js';
import {
  dispatchNotificationSafeUseCase,
  markAllNotificationsReadUseCase,
  markNotificationReadUseCase,
} from '../../src/application/use-cases/notificationUseCases.js';
import { SubscriptionRegistry } from '../../src/data/subscriptions/subscriptionRegistry.js';

const BIZ_ID = 'biz-37';
const OP_A_UID = 'op-a';

describe('Phase 05 Notification Validators, Use Cases & Listener Cleanup', () => {
  it('builds deterministic notification IDs and enforces strict schema invariants', () => {
    const id = buildNotificationId({
      type: NOTIFICATION_TYPE.BOOKING_SETTLED,
      eventKey: 'booking.settled__bk-1',
      recipientUid: OP_A_UID,
    });
    expect(id).toBe('BOOKING_SETTLED__booking.settled__bk-1__op-a');

    const valid = validateNotificationDoc({
      notificationId: id,
      businessId: BIZ_ID,
      studioId: 'studio-a',
      recipientUid: OP_A_UID,
      eventId: 'booking.settled__bk-1',
      type: NOTIFICATION_TYPE.BOOKING_SETTLED,
      channel: NOTIFICATION_CHANNEL.IN_APP,
      entityType: 'settlement',
      entityId: 'bk-1',
      title: 'Settlement Selesai',
      message: 'Booking telah disettle.',
      actionPath: '/operator/commissions',
      readAt: null,
      createdBy: 'owner-1',
    });
    expect(valid.type).toBe(NOTIFICATION_TYPE.BOOKING_SETTLED);

    // Reject wildcard recipient
    expect(() =>
      validateNotificationDoc({
        ...valid,
        recipientUid: '*',
      }),
    ).toThrow(DomainValidationError);

    // Reject external/phishing actionPath URL
    expect(() =>
      validateNotificationDoc({
        ...valid,
        actionPath: 'https://malicious.example.com',
      }),
    ).toThrow(DomainValidationError);
  });

  it('computes unread notification counts and read-state filters deterministically', () => {
    const items = [
      { notificationId: 'n1', readAt: null },
      { notificationId: 'n2', readAt: new Date() },
      { notificationId: 'n3', readAt: null },
    ];

    expect(countUnreadNotifications(items)).toBe(2);
    expect(filterNotificationsByReadState(items, 'all')).toHaveLength(3);
    expect(filterNotificationsByReadState(items, 'unread').map((n) => n.notificationId)).toEqual([
      'n1',
      'n3',
    ]);
  });

  it('enforces recipient ownership & offline guards in notification use cases', async () => {
    const opA = {
      uid: OP_A_UID,
      businessId: BIZ_ID,
      role: ROLES.OPERATOR,
      status: MEMBER_STATUS.ACTIVE,
    };

    await expect(
      markNotificationReadUseCase({
        member: opA,
        notification: { notificationId: 'n1', recipientUid: 'other-user', readAt: null },
        isOnline: true,
      }),
    ).rejects.toMatchObject({ code: 'authz/notification-recipient-only' });

    await expect(
      markNotificationReadUseCase({
        member: opA,
        notification: { notificationId: 'n1', recipientUid: OP_A_UID, readAt: null },
        isOnline: false,
      }),
    ).rejects.toMatchObject({ code: 'network/offline-write-blocked' });

    await expect(
      markAllNotificationsReadUseCase({
        member: opA,
        notifications: [{ notificationId: 'n1', recipientUid: OP_A_UID, readAt: null }],
        isOnline: false,
      }),
    ).rejects.toMatchObject({ code: 'network/offline-write-blocked' });

    // Non-fatal dispatcher safely skips cleanly when offline without rejecting caller flow
    const resultOffline = await dispatchNotificationSafeUseCase({
      member: opA,
      recipientUids: ['owner-1'],
      studioId: 'studio-a',
      eventId: 'ev-1',
      type: NOTIFICATION_TYPE.BOOKING_CREATED,
      entityType: 'booking',
      entityId: 'bk-1',
      title: 'Test',
      message: 'Test',
      isOnline: false,
    });
    expect(resultOffline).toEqual([]);
  });

  it('tears down Phase 05 inbox and activity timeline listeners synchronously on logout/unsubscribeAll', () => {
    const registry = new SubscriptionRegistry();
    const unsubInbox = vi.fn();
    const unsubTimeline = vi.fn();

    registry.register('phase05:notifications:inbox', unsubInbox);
    registry.register('phase05:activity:timeline', unsubTimeline);
    expect(registry.getActiveCount()).toBe(2);

    registry.unsubscribeAll();
    expect(unsubInbox).toHaveBeenCalledTimes(1);
    expect(unsubTimeline).toHaveBeenCalledTimes(1);
    expect(registry.getActiveCount()).toBe(0);
  });
});
