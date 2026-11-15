import {
  validateBusinessProfile,
  validateCustomer,
  validateService,
  validateSettingsDoc,
  validateStudio,
} from '../../domain/validators/masterDataValidators.js';

/**
 * @param {import('firebase/firestore').DocumentSnapshot} snapshot
 */
export function mapBusinessProfileSnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) {
    return null;
  }
  return validateBusinessProfile({
    businessId: snapshot.ref.parent.parent?.id || snapshot.data()?.businessId,
    ...snapshot.data(),
  });
}

/**
 * @param {import('firebase/firestore').DocumentSnapshot} snapshot
 */
export function mapSettingsDocSnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) {
    return null;
  }
  const settingId = snapshot.id;
  return validateSettingsDoc(settingId, {
    settingId,
    businessId: snapshot.ref.parent.parent?.id || snapshot.data()?.businessId,
    ...snapshot.data(),
  });
}

/**
 * @param {import('firebase/firestore').DocumentSnapshot} snapshot
 */
export function mapStudioSnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) {
    return null;
  }
  return validateStudio({
    studioId: snapshot.id,
    businessId: snapshot.ref.parent.parent?.id || snapshot.data()?.businessId,
    ...snapshot.data(),
  });
}

/**
 * @param {import('firebase/firestore').DocumentSnapshot} snapshot
 */
export function mapServiceSnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) {
    return null;
  }
  return validateService({
    serviceId: snapshot.id,
    businessId: snapshot.ref.parent.parent?.id || snapshot.data()?.businessId,
    ...snapshot.data(),
  });
}

/**
 * @param {import('firebase/firestore').DocumentSnapshot} snapshot
 */
export function mapCustomerSnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) {
    return null;
  }
  return validateCustomer({
    customerId: snapshot.id,
    businessId: snapshot.ref.parent.parent?.id || snapshot.data()?.businessId,
    ...snapshot.data(),
  });
}
