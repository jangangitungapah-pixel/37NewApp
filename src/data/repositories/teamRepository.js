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
} from 'firebase/firestore';
import { SCHEMA_VERSIONS } from '../../domain/enums/roles.js';
import { validateMember } from '../../domain/validators/schemaValidators.js';
import { getFirebaseServices } from '../firebase/firebaseClient.js';
import { mapFirebaseError } from '../firebase/errorMapper.js';
import { mapMemberSnapshot } from '../mappers/identityMappers.js';

/**
 * Subscribes to all team members of a business (Owner-only via Firestore Rules).
 */
export function subscribeBusinessMembers({ businessId, onData, onError }) {
  const { db } = getFirebaseServices();
  const q = query(
    collection(db, 'businesses', businessId, 'members'),
    orderBy('displayName', 'asc'),
    limit(50),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      try {
        const members = snapshot.docs.map(mapMemberSnapshot).filter(Boolean);
        onData(members, { fromCache: snapshot.metadata.fromCache });
      } catch (err) {
        onError(mapFirebaseError(err));
      }
    },
    (err) => onError(mapFirebaseError(err)),
  );
}

/**
 * Registers or updates a business member (`businesses/{businessId}/members/{uid}`).
 * Note: Under Firebase Spark (no Admin SDK), target staff must sign in/register via Auth
 * first to provide their Firebase Auth UID.
 */
export async function upsertBusinessMemberDoc({
  businessId,
  actorUid,
  data,
  existingMember = null,
}) {
  try {
    const { db } = getFirebaseServices();
    const targetUid = (data.uid || '').trim();
    const validated = validateMember({
      ...data,
      uid: targetUid,
      businessId,
      schemaVersion: SCHEMA_VERSIONS.MEMBER,
      createdBy: existingMember?.createdBy || actorUid,
      updatedBy: actorUid,
    });

    const ref = doc(db, 'businesses', businessId, 'members', targetUid);

    if (!existingMember) {
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
