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
  writeBatch,
} from 'firebase/firestore';
import {
  COMMISSION_METHOD,
  PRICING_MODEL,
  SCHEMA_VERSIONS,
  SERVICE_CATEGORY,
} from '../../domain/enums/roles.js';
import { validateService } from '../../domain/validators/masterDataValidators.js';
import { getFirebaseServices } from '../firebase/firebaseClient.js';
import { mapFirebaseError } from '../firebase/errorMapper.js';
import { mapServiceSnapshot } from '../mappers/masterDataMappers.js';

/**
 * Subscribes to business service catalog (`businesses/{businessId}/services`, max 100 docs).
 */
export function subscribeServices({ businessId, onData, onError }) {
  const { db } = getFirebaseServices();
  const q = query(
    collection(db, 'businesses', businessId, 'services'),
    orderBy('category', 'asc'),
    orderBy('name', 'asc'),
    limit(100),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      try {
        const items = snapshot.docs.map(mapServiceSnapshot).filter(Boolean);
        onData(items, { fromCache: snapshot.metadata.fromCache });
      } catch (err) {
        onError(mapFirebaseError(err));
      }
    },
    (err) => onError(mapFirebaseError(err)),
  );
}

/**
 * Creates or updates a versioned service catalog document.
 */
export async function saveServiceDoc({ businessId, actorUid, data, existingService = null }) {
  try {
    const { db } = getFirebaseServices();
    const servicesCol = collection(db, 'businesses', businessId, 'services');
    const ref = existingService?.serviceId ? doc(servicesCol, existingService.serviceId) : doc(servicesCol);
    const serviceId = ref.id;
    const nextConfigVersion = existingService ? (existingService.configVersion || 1) + 1 : 1;

    const validated = validateService({
      ...data,
      serviceId,
      businessId,
      configVersion: nextConfigVersion,
      schemaVersion: SCHEMA_VERSIONS.SERVICE,
      createdBy: existingService?.createdBy || actorUid,
      updatedBy: actorUid,
    });

    if (!existingService) {
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

/**
 * Seeds the 4 starter studio services (Rehearsal, Recording, Mixing, Mastering)
 * when the catalog is empty, using strict integer IDR baseline prices.
 */
export async function seedStarterServices({ businessId, actorUid }) {
  try {
    const { db } = getFirebaseServices();
    const servicesCol = collection(db, 'businesses', businessId, 'services');
    const batch = writeBatch(db);

    const starterDefinitions = [
      {
        serviceId: 'rehearsal-standard',
        name: 'Studio Rehearsal',
        category: SERVICE_CATEGORY.REHEARSAL,
        pricingModel: PRICING_MODEL.HOURLY,
        durationOptions: [60, 120, 180],
        basePriceMinor: 120000,
        description: 'Latihan band reguler per jam dengan full backline standar.',
      },
      {
        serviceId: 'recording-tracking',
        name: 'Recording & Tracking',
        category: SERVICE_CATEGORY.RECORDING,
        pricingModel: PRICING_MODEL.HOURLY,
        durationOptions: [120, 180, 240, 360],
        basePriceMinor: 250000,
        description: 'Sesi rekaman vokal & instrumen bersama operator studio.',
      },
      {
        serviceId: 'audio-mixing',
        name: 'Mixing Track',
        category: SERVICE_CATEGORY.MIXING,
        pricingModel: PRICING_MODEL.PACKAGE,
        durationOptions: [120, 240],
        basePriceMinor: 500000,
        description: 'Paket mixing multitrack per lagu termasuk 2x revisi minor.',
      },
      {
        serviceId: 'audio-mastering',
        name: 'Mastering Stereo',
        category: SERVICE_CATEGORY.MASTERING,
        pricingModel: PRICING_MODEL.FIXED_SESSION,
        durationOptions: [60, 120],
        basePriceMinor: 350000,
        description: 'Finalisasi loudness dan tonal balance untuk rilisan digital.',
      },
    ];

    for (const def of starterDefinitions) {
      const ref = doc(servicesCol, def.serviceId);
      const validated = validateService({
        ...def,
        businessId,
        durationPricesMinor: {},
        commissionMethod: COMMISSION_METHOD.INHERIT,
        commissionValue: 0,
        applicableStudioIds: [],
        active: true,
        configVersion: 1,
        schemaVersion: SCHEMA_VERSIONS.SERVICE,
        createdBy: actorUid,
        updatedBy: actorUid,
      });
      batch.set(ref, {
        ...validated,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return { count: starterDefinitions.length };
  } catch (error) {
    throw mapFirebaseError(error);
  }
}
