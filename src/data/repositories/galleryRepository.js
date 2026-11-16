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
import { GALLERY_ASSET_STATUS, SCHEMA_VERSIONS } from '../../domain/enums/roles.js';
import {
  sortGalleryAssets,
  validateGalleryAssetDoc,
  validateGalleryMetadataInput,
} from '../../domain/validators/galleryValidators.js';
import { mapFirebaseError } from '../firebase/errorMapper.js';
import { getFirebaseServices } from '../firebase/firebaseClient.js';
import { mapGalleryAssetSnapshot } from '../mappers/galleryMappers.js';

/**
 * Subscribes to gallery assets under `businesses/{businessId}/galleryAssets` with bounded `limit(60)`.
 */
export function subscribeGalleryAssets({
  businessId,
  status = GALLERY_ASSET_STATUS.ACTIVE,
  studioId = '',
  limitCount = 60,
  onData,
  onError,
}) {
  if (!businessId) {
    onData([], { fromCache: false });
    return () => {};
  }

  const { db } = getFirebaseServices();
  const colRef = collection(db, 'businesses', businessId, 'galleryAssets');
  const constraints = [];

  if (studioId) {
    constraints.push(where('studioId', '==', studioId));
  }
  if (status) {
    constraints.push(where('status', '==', status));
  }
  constraints.push(orderBy('order', 'asc'));
  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(limitCount));

  const q = query(colRef, ...constraints);
  return onSnapshot(
    q,
    (snapshot) => {
      try {
        const items = sortGalleryAssets(
          snapshot.docs.map(mapGalleryAssetSnapshot).filter(Boolean),
        );
        onData(items, { fromCache: snapshot.metadata.fromCache });
      } catch (err) {
        onError(mapFirebaseError(err));
      }
    },
    (err) => onError(mapFirebaseError(err)),
  );
}

/**
 * Persists metadata of an uploaded Cloudinary asset into Firestore.
 */
export async function createGalleryAssetDoc({
  businessId,
  actorUid,
  cloudinaryAsset,
  metadata = {},
  preGeneratedAssetId = null,
}) {
  try {
    const { db } = getFirebaseServices();
    const colRef = collection(db, 'businesses', businessId, 'galleryAssets');
    const ref = preGeneratedAssetId ? doc(colRef, preGeneratedAssetId) : doc(colRef);
    const assetId = ref.id;
    const placeholderDate = new Date();

    const validated = validateGalleryAssetDoc({
      assetId,
      businessId,
      studioId: metadata.studioId ?? null,
      publicId: cloudinaryAsset.publicId,
      secureUrl: cloudinaryAsset.secureUrl,
      format: cloudinaryAsset.format,
      width: cloudinaryAsset.width,
      height: cloudinaryAsset.height,
      bytes: cloudinaryAsset.bytes,
      caption: metadata.caption ?? null,
      altText: metadata.altText ?? null,
      order: metadata.order ?? 0,
      status: GALLERY_ASSET_STATUS.ACTIVE,
      uploadedBy: actorUid,
      uploadedAt: placeholderDate,
      createdAt: placeholderDate,
      updatedAt: placeholderDate,
      updatedBy: actorUid,
      schemaVersion: SCHEMA_VERSIONS.GALLERY_ASSET,
    });

    await setDoc(ref, {
      ...validated,
      uploadedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return validated;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/**
 * Updates editable gallery asset metadata without mutating binary/Cloudinary asset fields.
 */
export async function updateGalleryAssetMetadata({ businessId, actorUid, assetId, updates }) {
  try {
    const { db } = getFirebaseServices();
    const ref = doc(db, 'businesses', businessId, 'galleryAssets', assetId);
    const validatedMeta = validateGalleryMetadataInput(updates);

    await updateDoc(ref, {
      ...validatedMeta,
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
    });

    return validatedMeta;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/**
 * Soft-archives or restores a gallery asset (`status: 'archived' | 'active'`).
 * Permanent deletion in Firestore is blocked; Cloudinary deletion remains manual in Console.
 */
export async function setGalleryAssetArchiveStatus({ businessId, actorUid, assetId, status }) {
  try {
    if (
      status !== GALLERY_ASSET_STATUS.ACTIVE &&
      status !== GALLERY_ASSET_STATUS.ARCHIVED
    ) {
      throw new Error(`Invalid archive status: ${status}`);
    }
    const { db } = getFirebaseServices();
    const ref = doc(db, 'businesses', businessId, 'galleryAssets', assetId);
    await updateDoc(ref, {
      status,
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
    });
    return { assetId, status };
  } catch (error) {
    throw mapFirebaseError(error);
  }
}
