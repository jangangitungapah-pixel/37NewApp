import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ROLES, SCHEMA_VERSIONS } from '../../domain/enums/roles.js';
import { validateStudio } from '../../domain/validators/masterDataValidators.js';
import { getFirebaseServices } from '../firebase/firebaseClient.js';
import { mapFirebaseError } from '../firebase/errorMapper.js';
import { mapStudioSnapshot } from '../mappers/masterDataMappers.js';

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Subscribes to studios strictly scoped to the member's role:
 * - Owners read all studios in their business (bounded limit 50).
 * - Operators read ONLY studios listed in `member.assignedStudioIds` via chunked `in` queries.
 */
export function subscribeStudiosForMember({ businessId, member, onData, onError }) {
  const { db } = getFirebaseServices();
  const studiosCol = collection(db, 'businesses', businessId, 'studios');

  if (member?.role === ROLES.OWNER) {
    const q = query(studiosCol, orderBy('name', 'asc'), limit(50));
    return onSnapshot(
      q,
      (snapshot) => {
        try {
          const items = snapshot.docs.map(mapStudioSnapshot).filter(Boolean);
          onData(items, { fromCache: snapshot.metadata.fromCache });
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
  const chunkResults = new Map();
  let fromCacheAny = false;

  const emitCombined = () => {
    const deduped = new Map();
    for (const chunkList of chunkResults.values()) {
      for (const studio of chunkList) {
        deduped.set(studio.studioId, studio);
      }
    }
    const sorted = Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
    onData(sorted, { fromCache: fromCacheAny });
  };

  const unsubscribes = chunks.map((chunkIds, idx) => {
    const q = query(studiosCol, where('studioId', 'in', chunkIds), limit(10));
    return onSnapshot(
      q,
      (snapshot) => {
        try {
          fromCacheAny = snapshot.metadata.fromCache;
          chunkResults.set(idx, snapshot.docs.map(mapStudioSnapshot).filter(Boolean));
          emitCombined();
        } catch (err) {
          onError(mapFirebaseError(err));
        }
      },
      (err) => onError(mapFirebaseError(err)),
    );
  });

  return () => {
    for (const unsub of unsubscribes) {
      try {
        unsub();
      } catch {
        // Ignore teardown failures on closed listeners
      }
    }
  };
}

/**
 * Creates or updates a studio document (`businesses/{businessId}/studios/{studioId}`).
 */
export async function saveStudioDoc({ businessId, actorUid, data, existingStudio = null }) {
  try {
    const { db } = getFirebaseServices();
    const studiosCol = collection(db, 'businesses', businessId, 'studios');
    const ref = existingStudio?.studioId ? doc(studiosCol, existingStudio.studioId) : doc(studiosCol);
    const studioId = ref.id;

    const validated = validateStudio({
      ...data,
      studioId,
      businessId,
      schemaVersion: SCHEMA_VERSIONS.STUDIO,
      createdBy: existingStudio?.createdBy || actorUid,
      updatedBy: actorUid,
    });

    if (!existingStudio) {
      await setDoc(ref, {
        ...validated,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const { createdAt: _cAt, createdBy: _cBy, ...updateFields } = validated;
      await updateDoc(ref, {
        ...updateFields,
        updatedBy: actorUid,
        updatedAt: serverTimestamp(),
      });
    }

    return validated;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}
