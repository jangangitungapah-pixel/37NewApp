import { isActiveMember } from '../../domain/policies/accessPolicy.js';
import { AppError, ERROR_CATEGORY } from '../../data/firebase/errorMapper.js';
import {
  dispatchNotificationBatch,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../../data/repositories/notificationRepository.js';
import { logger } from '../../infrastructure/logging/logger.js';

function assertOnlineForNotification(isOnline) {
  if (isOnline === false) {
    throw new AppError({
      category: ERROR_CATEGORY.UNAVAILABLE,
      code: 'network/offline-write-blocked',
      message: 'Menandai notifikasi membutuhkan koneksi aktif.',
      retryable: true,
    });
  }
}

/**
 * Safely dispatches deterministic cross-portal notifications without ever throwing
 * and breaking the already-committed primary workflow when secondary fan-out fails.
 */
export async function dispatchNotificationSafeUseCase({
  member,
  recipientUids = [],
  studioId = null,
  eventId,
  type,
  entityType,
  entityId,
  title,
  message,
  actionPath = null,
  isOnline = true,
}) {
  if (isOnline === false || !isActiveMember(member)) {
    return [];
  }
  try {
    return await dispatchNotificationBatch({
      businessId: member.businessId,
      recipientUids,
      studioId,
      eventId,
      type,
      entityType,
      entityId,
      title,
      message,
      actionPath,
      actorUid: member.uid,
    });
  } catch (error) {
    logger.warn('notifications', 'Notification dispatch failed non-fatally after primary commit', {
      type,
      entityId,
      code: error?.code || error?.message,
    });
    return [];
  }
}

export async function markNotificationReadUseCase({ member, notification, isOnline = true }) {
  assertOnlineForNotification(isOnline);
  if (!isActiveMember(member) || !notification || notification.recipientUid !== member.uid) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/notification-recipient-only',
      message: 'Anda hanya dapat memperbarui notifikasi milik Anda sendiri.',
    });
  }
  if (notification.readAt != null) {
    return;
  }
  await markNotificationAsRead({
    businessId: member.businessId,
    notificationId: notification.notificationId,
  });
}

export async function markAllNotificationsReadUseCase({
  member,
  notifications = [],
  isOnline = true,
}) {
  assertOnlineForNotification(isOnline);
  if (!isActiveMember(member)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/inactive-member',
      message: 'Membership tidak aktif.',
    });
  }
  const unreadMine = notifications.filter(
    (item) => item && item.recipientUid === member.uid && item.readAt == null,
  );
  if (unreadMine.length === 0) {
    return 0;
  }
  return markAllNotificationsAsRead({
    businessId: member.businessId,
    unreadNotifications: unreadMine,
  });
}
