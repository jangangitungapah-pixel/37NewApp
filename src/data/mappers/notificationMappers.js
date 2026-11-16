import { validateNotificationDoc } from '../../domain/validators/notificationValidators.js';

function normalizeTimestamp(value) {
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
export function mapNotificationSnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) {
    return null;
  }
  const raw = snapshot.data();
  return validateNotificationDoc({
    notificationId: snapshot.id,
    businessId: snapshot.ref.parent.parent?.id || raw?.businessId,
    ...raw,
    readAt: normalizeTimestamp(raw?.readAt),
    createdAt: normalizeTimestamp(raw?.createdAt),
  });
}
