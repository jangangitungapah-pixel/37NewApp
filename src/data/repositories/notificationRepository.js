import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  NOTIFICATION_CHANNEL,
  ROLES,
  SCHEMA_VERSIONS,
} from '../../domain/enums/roles.js';
import {
  buildNotificationId,
  validateNotificationDoc,
} from '../../domain/validators/notificationValidators.js';
import { mapFirebaseError } from '../firebase/errorMapper.js';
import { getFirebaseServices } from '../firebase/firebaseClient.js';
import { mapActivityLogSnapshot } from '../mappers/bookingMappers.js';
import { mapNotificationSnapshot } from '../mappers/notificationMappers.js';

function chunkArray(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/**
 * Subscribes exclusively to the signed-in member's own in-app notifications (`limit(30)`).
 */
export function subscribeMyNotifications({
  businessId,
  recipientUid,
  limitCount = 30,
  onData,
  onError,
}) {
  if (!businessId || !recipientUid) {
    onData([], { fromCache: false });
    return () => {};
  }
  const { db } = getFirebaseServices();
  const q = query(
    collection(db, 'businesses', businessId, 'notifications'),
    where('recipientUid', '==', recipientUid),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );

  return onSnapshot(
    q,
    (snap) => {
      try {
        const items = snap.docs.map(mapNotificationSnapshot).filter(Boolean);
        onData(items, { fromCache: snap.metadata.fromCache });
      } catch (err) {
        onError(mapFirebaseError(err));
      }
    },
    (err) => onError(mapFirebaseError(err)),
  );
}

/**
 * Subscribes to cross-portal audit activity timeline strictly scoped by role:
 * - Owner: latest business-wide events (`limit(40)`).
 * - Operator: chunked `studioId in assignedStudioIds` events (`limit(25)` per chunk).
 */
export function subscribeBusinessActivityTimeline({
  businessId,
  member,
  limitCount = 40,
  onData,
  onError,
}) {
  const { db } = getFirebaseServices();
  const logsCol = collection(db, 'businesses', businessId, 'activityLogs');

  if (member?.role === ROLES.OWNER) {
    const q = query(logsCol, orderBy('createdAt', 'desc'), limit(limitCount));
    return onSnapshot(
      q,
      (snap) => {
        try {
          const items = snap.docs.map(mapActivityLogSnapshot).filter(Boolean);
          onData(items, { fromCache: snap.metadata.fromCache });
        } catch (err) {
          onError(mapFirebaseError(err));
        }
      },
      (err) => onError(mapFirebaseError(err)),
    );
  }

  const assignedIds = Array.isArray(member?.assignedStudioIds) ? member.assignedStudioIds : [];
  if (assignedIds.length === 0) {
    onData([], { fromCache: false });
    return () => {};
  }

  const chunks = chunkArray(assignedIds, 10);
  const chunkMap = new Map();
  let anyFromCache = false;

  const emitMerged = () => {
    const deduped = new Map();
    for (const list of chunkMap.values()) {
      for (const item of list) {
        deduped.set(item.eventId, item);
      }
    }
    const sorted = Array.from(deduped.values())
      .sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0))
      .slice(0, limitCount);
    onData(sorted, { fromCache: anyFromCache });
  };

  const unsubs = chunks.map((chunkIds, idx) => {
    const q = query(
      logsCol,
      where('studioId', 'in', chunkIds),
      orderBy('createdAt', 'desc'),
      limit(25),
    );
    return onSnapshot(
      q,
      (snap) => {
        try {
          anyFromCache = snap.metadata.fromCache;
          chunkMap.set(idx, snap.docs.map(mapActivityLogSnapshot).filter(Boolean));
          emitMerged();
        } catch (err) {
          onError(mapFirebaseError(err));
        }
      },
      (err) => onError(mapFirebaseError(err)),
    );
  });

  return () => {
    for (const unsub of unsubs) {
      try {
        unsub();
      } catch {
        // Ignore teardown failures
      }
    }
  };
}

/**
 * Dispatches deterministic in-app notifications using `writeBatch` AFTER the primary
 * transaction has committed cleanly. Skips creating notification for actor themselves.
 */
export async function dispatchNotificationBatch({
  businessId,
  recipientUids = [],
  studioId = null,
  eventId,
  type,
  entityType,
  entityId,
  title,
  message,
  actionPath = null,
  actorUid,
}) {
  const uniqueRecipients = Array.from(
    new Set(
      (recipientUids || [])
        .map((uid) => (typeof uid === 'string' ? uid.trim() : ''))
        .filter((uid) => uid.length > 0 && uid !== actorUid),
    ),
  );

  if (uniqueRecipients.length === 0) {
    return [];
  }

  try {
    const { db } = getFirebaseServices();
    const colRef = collection(db, 'businesses', businessId, 'notifications');
    const batch = writeBatch(db);
    const created = [];

    for (const recipientUid of uniqueRecipients) {
      const notificationId = buildNotificationId({
        type,
        eventKey: eventId,
        recipientUid,
      });

      const payload = validateNotificationDoc({
        notificationId,
        businessId,
        studioId,
        recipientUid,
        eventId,
        type,
        channel: NOTIFICATION_CHANNEL.IN_APP,
        entityType,
        entityId,
        title,
        message,
        actionPath,
        readAt: null,
        createdBy: actorUid,
        schemaVersion: SCHEMA_VERSIONS.NOTIFICATION,
      });

      batch.set(doc(colRef, notificationId), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      created.push(payload);
    }

    await batch.commit();
    return created;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function markNotificationAsRead({ businessId, notificationId }) {
  try {
    const { db } = getFirebaseServices();
    const ref = doc(db, 'businesses', businessId, 'notifications', notificationId);
    await updateDoc(ref, {
      readAt: serverTimestamp(),
    });
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function markAllNotificationsAsRead({ businessId, unreadNotifications = [] }) {
  if (!Array.isArray(unreadNotifications) || unreadNotifications.length === 0) {
    return 0;
  }
  try {
    const { db } = getFirebaseServices();
    const batch = writeBatch(db);
    const colRef = collection(db, 'businesses', businessId, 'notifications');
    for (const item of unreadNotifications.slice(0, 100)) {
      batch.update(doc(colRef, item.notificationId), {
        readAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return Math.min(unreadNotifications.length, 100);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}
