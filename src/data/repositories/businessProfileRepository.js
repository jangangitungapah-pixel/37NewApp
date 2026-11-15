import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  writeBatch,
  setDoc,
  updateDoc,
  limit,
} from 'firebase/firestore';
import { SCHEMA_VERSIONS } from '../../domain/enums/roles.js';
import {
  createDefaultSettingsPayloads,
  validateBusinessProfile,
  validateSettingsDoc,
} from '../../domain/validators/masterDataValidators.js';
import { getFirebaseServices } from '../firebase/firebaseClient.js';
import { mapFirebaseError } from '../firebase/errorMapper.js';
import {
  mapBusinessProfileSnapshot,
  mapSettingsDocSnapshot,
} from '../mappers/masterDataMappers.js';

/**
 * Subscribes to `businesses/{businessId}/profile/main`.
 */
export function subscribeBusinessProfile({ businessId, onData, onError }) {
  const { db } = getFirebaseServices();
  const ref = doc(db, 'businesses', businessId, 'profile', 'main');
  return onSnapshot(
    ref,
    (snapshot) => {
      try {
        onData(mapBusinessProfileSnapshot(snapshot), { fromCache: snapshot.metadata.fromCache });
      } catch (err) {
        onError(mapFirebaseError(err));
      }
    },
    (err) => onError(mapFirebaseError(err)),
  );
}

/**
 * Subscribes to `businesses/{businessId}/settings` (max 5 config documents).
 */
export function subscribeBusinessSettings({ businessId, onData, onError }) {
  const { db } = getFirebaseServices();
  const q = query(collection(db, 'businesses', businessId, 'settings'), limit(10));
  return onSnapshot(
    q,
    (snapshot) => {
      try {
        const mapped = {};
        for (const docSnap of snapshot.docs) {
          const parsed = mapSettingsDocSnapshot(docSnap);
          if (parsed) {
            mapped[parsed.settingId] = parsed;
          }
        }
        onData(mapped, { fromCache: snapshot.metadata.fromCache });
      } catch (err) {
        onError(mapFirebaseError(err));
      }
    },
    (err) => onError(mapFirebaseError(err)),
  );
}

/**
 * Creates or updates `businesses/{businessId}/profile/main` and keeps the
 * root `businesses/{businessId}` name & timezone in sync atomically.
 */
export async function upsertBusinessProfile({ businessId, actorUid, data, existingProfile }) {
  try {
    const { db } = getFirebaseServices();
    const validated = validateBusinessProfile({
      ...data,
      businessId,
      schemaVersion: SCHEMA_VERSIONS.BUSINESS_PROFILE,
      createdBy: existingProfile?.createdBy || actorUid,
      updatedBy: actorUid,
    });

    const profileRef = doc(db, 'businesses', businessId, 'profile', 'main');
    const businessRef = doc(db, 'businesses', businessId);
    const batch = writeBatch(db);

    if (!existingProfile) {
      batch.set(profileRef, {
        ...validated,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(profileRef, {
        displayName: validated.displayName,
        legalName: validated.legalName,
        phone: validated.phone,
        email: validated.email,
        address: validated.address,
        timezone: validated.timezone,
        currency: validated.currency,
        status: validated.status,
        schemaVersion: validated.schemaVersion,
        updatedBy: actorUid,
        updatedAt: serverTimestamp(),
      });
    }

    batch.update(businessRef, {
      name: validated.displayName,
      timezone: validated.timezone,
      currency: validated.currency,
      status: validated.status,
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return validated;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/**
 * Upserts a single setting document (`business | schedule | pricing | commission | bookingPolicy`).
 * Increments `configVersion` automatically on updates.
 */
export async function upsertBusinessSetting({
  businessId,
  settingId,
  actorUid,
  data,
  existingSetting,
}) {
  try {
    const { db } = getFirebaseServices();
    const nextVersion = existingSetting ? (existingSetting.configVersion || 1) + 1 : 1;

    const validated = validateSettingsDoc(settingId, {
      ...data,
      settingId,
      businessId,
      configVersion: nextVersion,
      schemaVersion: SCHEMA_VERSIONS.SETTINGS,
      createdBy: existingSetting?.createdBy || actorUid,
      updatedBy: actorUid,
    });

    const ref = doc(db, 'businesses', businessId, 'settings', settingId);

    if (!existingSetting) {
      await setDoc(ref, {
        ...validated,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const { createdAt: _ignoreCreatedAt, createdBy: _ignoreCreatedBy, ...updateFields } = validated;
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

/**
 * Seeds missing default settings and profile documents atomically in one batch.
 */
export async function bootstrapDefaultMasterSettings({
  businessId,
  businessName,
  actorUid,
  existingProfile = null,
  existingSettingsMap = {},
}) {
  try {
    const { db } = getFirebaseServices();
    const batch = writeBatch(db);
    let writeCount = 0;

    if (!existingProfile) {
      const profileRef = doc(db, 'businesses', businessId, 'profile', 'main');
      const profilePayload = validateBusinessProfile({
        businessId,
        displayName: businessName || '37 Music Studio',
        legalName: null,
        phone: null,
        email: null,
        address: null,
        timezone: 'Asia/Jakarta',
        currency: 'IDR',
        status: 'active',
        schemaVersion: SCHEMA_VERSIONS.BUSINESS_PROFILE,
        createdBy: actorUid,
        updatedBy: actorUid,
      });
      batch.set(profileRef, {
        ...profilePayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      writeCount += 1;
    }

    const defaults = createDefaultSettingsPayloads(businessId, actorUid);
    for (const [settingId, payload] of Object.entries(defaults)) {
      if (!existingSettingsMap[settingId]) {
        const ref = doc(db, 'businesses', businessId, 'settings', settingId);
        batch.set(ref, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        writeCount += 1;
      }
    }

    if (writeCount > 0) {
      await batch.commit();
    }

    return { initializedDocs: writeCount };
  } catch (error) {
    throw mapFirebaseError(error);
  }
}
