import { validateGalleryAssetDoc } from '../../domain/validators/galleryValidators.js';

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
 * Maps a `businesses/{businessId}/galleryAssets/{assetId}` Firestore snapshot.
 * @param {import('firebase/firestore').DocumentSnapshot} snapshot
 */
export function mapGalleryAssetSnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) {
    return null;
  }
  const raw = snapshot.data();
  return validateGalleryAssetDoc({
    assetId: snapshot.id,
    businessId: snapshot.ref.parent.parent?.id || raw?.businessId,
    ...raw,
    uploadedAt: normalizeTimestamp(raw?.uploadedAt),
    createdAt: normalizeTimestamp(raw?.createdAt),
    updatedAt: normalizeTimestamp(raw?.updatedAt),
  });
}
