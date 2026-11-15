import {
  validateBusiness,
  validateMember,
  validateUserProfile,
} from '../../domain/validators/schemaValidators.js';

/**
 * Maps a Firestore `users/{uid}` snapshot into a validated global profile entity.
 * @param {import('firebase/firestore').DocumentSnapshot} snapshot
 */
export function mapUserProfileSnapshot(snapshot) {
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data();
  return validateUserProfile({ uid: snapshot.id, ...data });
}

/**
 * Maps a Firestore `businesses/{businessId}` snapshot into a validated Business entity.
 * @param {import('firebase/firestore').DocumentSnapshot} snapshot
 */
export function mapBusinessSnapshot(snapshot) {
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data();
  return validateBusiness({ businessId: snapshot.id, ...data });
}

/**
 * Maps a Firestore `businesses/{businessId}/members/{uid}` snapshot into a validated Member entity.
 * @param {import('firebase/firestore').DocumentSnapshot} snapshot
 */
export function mapMemberSnapshot(snapshot) {
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data();
  const parentBusinessId = snapshot.ref?.parent?.parent?.id || data.businessId;
  return validateMember({ uid: snapshot.id, businessId: parentBusinessId, ...data });
}
