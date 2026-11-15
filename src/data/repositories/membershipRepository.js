import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  BUSINESS_STATUS,
  MEMBER_STATUS,
  OWNER_DEFAULT_PERMISSIONS,
  ROLES,
  SCHEMA_VERSIONS,
} from '../../domain/enums/roles.js';
import { getFirebaseServices } from '../firebase/firebaseClient.js';
import { mapFirebaseError } from '../firebase/errorMapper.js';
import {
  mapBusinessSnapshot,
  mapMemberSnapshot,
  mapUserProfileSnapshot,
} from '../mappers/identityMappers.js';

/**
 * Creates or refreshes global profile (`users/{uid}`) without touching business permissions.
 * @param {import('firebase/auth').User} authUser
 */
export async function ensureUserProfile(authUser) {
  try {
    const { db } = getFirebaseServices();
    const userRef = doc(db, 'users', authUser.uid);
    const existing = await getDoc(userRef);

    if (!existing.exists()) {
      const payload = {
        uid: authUser.uid,
        displayName: (authUser.displayName || authUser.email || 'Studio Member').slice(0, 120),
        email: (authUser.email || '').slice(0, 254),
        photoURL: authUser.photoURL || null,
        defaultBusinessId: null,
        schemaVersion: SCHEMA_VERSIONS.USER_PROFILE,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(userRef, payload);
      const createdSnap = await getDoc(userRef);
      return mapUserProfileSnapshot(createdSnap);
    }

    const mapped = mapUserProfileSnapshot(existing);
    const nextDisplayName = (authUser.displayName || mapped.displayName || authUser.email || 'Studio Member').slice(0, 120);
    const nextEmail = (authUser.email || mapped.email || '').slice(0, 254);

    if (nextDisplayName !== mapped.displayName || nextEmail !== mapped.email) {
      await updateDoc(userRef, {
        displayName: nextDisplayName,
        email: nextEmail,
        updatedAt: serverTimestamp(),
      });
      const updatedSnap = await getDoc(userRef);
      return mapUserProfileSnapshot(updatedSnap);
    }

    return mapped;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/**
 * Resolves the user's membership across businesses without trusting client claims.
 * Uses direct document lookup when a target businessId hint is known (1 read),
 * falling back to a uid-scoped collectionGroup query (up to 10 memberships).
 *
 * @param {{ uid: string, preferredBusinessId?: string | null }} params
 */
export async function resolveMembershipForUser({ uid, preferredBusinessId = null }) {
  try {
    const { db } = getFirebaseServices();

    if (preferredBusinessId) {
      const directRef = doc(db, 'businesses', preferredBusinessId, 'members', uid);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        return mapMemberSnapshot(directSnap);
      }
    }

    const groupQuery = query(
      collectionGroup(db, 'members'),
      where('uid', '==', uid),
      limit(10),
    );
    const groupSnaps = await getDocs(groupQuery);
    if (groupSnaps.empty) {
      return null;
    }

    const members = groupSnaps.docs.map(mapMemberSnapshot).filter(Boolean);
    const activeMatch = members.find((member) => member.status === MEMBER_STATUS.ACTIVE);
    return activeMatch || members[0] || null;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/**
 * Subscribes to a specific user's membership document (`businesses/{businessId}/members/{uid}`)
 * so role or status revocation propagates immediately across portals.
 *
 * @param {{
 *   businessId: string,
 *   uid: string,
 *   onData: (member: ReturnType<typeof mapMemberSnapshot>, meta: { fromCache: boolean }) => void,
 *   onError: (err: ReturnType<typeof mapFirebaseError>) => void,
 * }} params
 */
export function subscribeMemberDoc({ businessId, uid, onData, onError }) {
  const { db } = getFirebaseServices();
  const ref = doc(db, 'businesses', businessId, 'members', uid);
  return onSnapshot(
    ref,
    (snapshot) => {
      try {
        onData(mapMemberSnapshot(snapshot), { fromCache: snapshot.metadata.fromCache });
      } catch (err) {
        onError(mapFirebaseError(err));
      }
    },
    (err) => onError(mapFirebaseError(err)),
  );
}

/**
 * Subscribes to the business root document (`businesses/{businessId}`).
 *
 * @param {{
 *   businessId: string,
 *   onData: (business: ReturnType<typeof mapBusinessSnapshot>, meta: { fromCache: boolean }) => void,
 *   onError: (err: ReturnType<typeof mapFirebaseError>) => void,
 * }} params
 */
export function subscribeBusinessDoc({ businessId, onData, onError }) {
  const { db } = getFirebaseServices();
  const ref = doc(db, 'businesses', businessId);
  return onSnapshot(
    ref,
    (snapshot) => {
      try {
        onData(mapBusinessSnapshot(snapshot), { fromCache: snapshot.metadata.fromCache });
      } catch (err) {
        onError(mapFirebaseError(err));
      }
    },
    (err) => onError(mapFirebaseError(err)),
  );
}

/**
 * Atomically creates a new studio business and registers the signed-in user
 * as its initial active Owner in a single Firestore write batch.
 *
 * @param {{
 *   uid: string,
 *   email: string,
 *   displayName: string,
 *   businessName: string,
 *   timezone?: string,
 * }} params
 */
export async function bootstrapInitialBusiness({
  uid,
  email,
  displayName,
  businessName,
  timezone = 'Asia/Jakarta',
}) {
  try {
    const { db } = getFirebaseServices();
    const businessRef = doc(collection(db, 'businesses'));
    const businessId = businessRef.id;
    const memberRef = doc(db, 'businesses', businessId, 'members', uid);
    const userRef = doc(db, 'users', uid);

    const slugBase = businessName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);

    const batch = writeBatch(db);

    batch.set(businessRef, {
      businessId,
      name: businessName.trim(),
      slug: slugBase || businessId.toLowerCase(),
      ownerUid: uid,
      timezone,
      currency: 'IDR',
      status: BUSINESS_STATUS.ACTIVE,
      schemaVersion: SCHEMA_VERSIONS.BUSINESS,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
      updatedBy: uid,
    });

    batch.set(memberRef, {
      uid,
      businessId,
      email: (email || '').trim().slice(0, 254),
      displayName: (displayName || email || 'Studio Owner').trim().slice(0, 120),
      role: ROLES.OWNER,
      status: MEMBER_STATUS.ACTIVE,
      assignedStudioIds: [],
      permissions: { ...OWNER_DEFAULT_PERMISSIONS },
      schemaVersion: SCHEMA_VERSIONS.MEMBER,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
      updatedBy: uid,
    });

    batch.update(userRef, {
      defaultBusinessId: businessId,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return { businessId };
  } catch (error) {
    throw mapFirebaseError(error);
  }
}
