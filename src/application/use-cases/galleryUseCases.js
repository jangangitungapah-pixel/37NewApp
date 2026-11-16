import { GALLERY_ASSET_STATUS } from '../../domain/enums/roles.js';
import {
  canArchiveGalleryAsset,
  canManageGallery,
} from '../../domain/policies/accessPolicy.js';
import { validateGalleryMetadataInput } from '../../domain/validators/galleryValidators.js';
import { AppError, ERROR_CATEGORY } from '../../data/firebase/errorMapper.js';
import {
  createGalleryAssetDoc,
  setGalleryAssetArchiveStatus as persistGalleryArchiveStatus,
  updateGalleryAssetMetadata as persistGalleryMetadataUpdate,
} from '../../data/repositories/galleryRepository.js';
import { uploadImageToCloudinary } from '../../infrastructure/cloudinary/cloudinaryClient.js';
import { logger } from '../../infrastructure/logging/logger.js';

function assertOnlineForGallery(isOnline) {
  if (isOnline === false) {
    throw new AppError({
      category: ERROR_CATEGORY.UNAVAILABLE,
      code: 'network/offline-gallery-blocked',
      message:
        'Upload dan pengelolaan galeri membutuhkan koneksi internet aktif agar Cloudinary dan Firestore sinkron.',
      retryable: true,
    });
  }
}

function assertGalleryManagePermission(member, actionLabel) {
  if (!canManageGallery(member)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/gallery-manage-denied',
      message: `Anda tidak memiliki izin untuk ${actionLabel}. Hubungi Owner bila membutuhkan akses galeri.`,
    });
  }
}

/**
 * End-to-end gallery upload workflow:
 * 1) Validate metadata & permissions before touching Cloudinary
 * 2) Unsigned upload to Cloudinary
 * 3) Persist metadata document into Firestore
 *
 * If step 3 fails after Cloudinary succeeds, attaches `orphanUpload` metadata on the thrown error
 * so UI can surface a deterministic retry / manual cleanup recovery banner.
 */
export async function uploadGalleryAssetUseCase(
  {
    member,
    file,
    metadata = {},
    isOnline = true,
    config = null,
    preGeneratedAssetId = null,
  },
  deps = {},
) {
  assertOnlineForGallery(isOnline);
  assertGalleryManagePermission(member, 'mengunggah foto galeri');

  const cleanMetadata = validateGalleryMetadataInput(metadata);
  const uploader = deps.uploadImage || uploadImageToCloudinary;
  const saveMetadata = deps.createAssetDoc || createGalleryAssetDoc;

  const cloudinaryAsset = await uploader({
    file,
    businessId: member.businessId,
    studioId: cleanMetadata.studioId,
    config,
  });

  try {
    const savedDoc = await saveMetadata({
      businessId: member.businessId,
      actorUid: member.uid,
      cloudinaryAsset,
      metadata: cleanMetadata,
      preGeneratedAssetId,
    });
    return savedDoc;
  } catch (persistErr) {
    logger.error('gallery', 'Firestore metadata save failed after Cloudinary upload', {
      publicId: cloudinaryAsset.publicId,
      errorCode: persistErr?.code || persistErr?.category || 'unknown',
    });

    const wrapped =
      persistErr instanceof AppError
        ? new AppError({
            category: persistErr.category,
            code: persistErr.code || 'gallery/metadata-save-failed',
            message: `Gambar berhasil terunggah ke Cloudinary (${cloudinaryAsset.publicId}), namun penyimpanan metadata Firestore gagal: ${persistErr.message}`,
            retryable: true,
            cause: persistErr,
          })
        : new AppError({
            category: ERROR_CATEGORY.UNKNOWN,
            code: 'gallery/metadata-save-failed',
            message: `Gambar berhasil terunggah ke Cloudinary (${cloudinaryAsset.publicId}), namun penyimpanan metadata Firestore gagal.`,
            retryable: true,
            cause: persistErr,
          });

    wrapped.orphanUpload = {
      businessId: member.businessId,
      preGeneratedAssetId: preGeneratedAssetId || null,
      cloudinaryAsset,
      metadata: cleanMetadata,
    };
    throw wrapped;
  }
}

/**
 * Retries saving metadata to Firestore for an existing uploaded Cloudinary asset without re-uploading.
 */
export async function retrySaveOrphanGalleryMetadataUseCase(
  {
    member,
    cloudinaryAsset,
    metadata = {},
    preGeneratedAssetId = null,
    isOnline = true,
  },
  deps = {},
) {
  assertOnlineForGallery(isOnline);
  assertGalleryManagePermission(member, 'menyimpan ulang metadata foto galeri');

  const cleanMetadata = validateGalleryMetadataInput(metadata);
  const saveMetadata = deps.createAssetDoc || createGalleryAssetDoc;

  return saveMetadata({
    businessId: member.businessId,
    actorUid: member.uid,
    cloudinaryAsset,
    metadata: cleanMetadata,
    preGeneratedAssetId,
  });
}

/**
 * Edits caption, alt text, studio association, or display order for an existing gallery asset.
 */
export async function updateGalleryAssetDetailsUseCase(
  { member, assetId, updates, isOnline = true },
  deps = {},
) {
  assertOnlineForGallery(isOnline);
  assertGalleryManagePermission(member, 'mengubah metadata foto galeri');

  const updater = deps.updateAssetMetadata || persistGalleryMetadataUpdate;
  return updater({
    businessId: member.businessId,
    actorUid: member.uid,
    assetId,
    updates,
  });
}

/**
 * Archives or restores a gallery asset (Owner-only).
 */
export async function setGalleryAssetArchiveStatusUseCase(
  { member, assetId, archive = true, isOnline = true },
  deps = {},
) {
  assertOnlineForGallery(isOnline);
  if (!canArchiveGalleryAsset(member)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/owner-gallery-archive-only',
      message: 'Hanya Owner aktif yang dapat mengarsipkan atau memulihkan aset galeri.',
    });
  }

  const archiver = deps.setArchiveStatus || persistGalleryArchiveStatus;
  const targetStatus = archive ? GALLERY_ASSET_STATUS.ARCHIVED : GALLERY_ASSET_STATUS.ACTIVE;
  return archiver({
    businessId: member.businessId,
    actorUid: member.uid,
    assetId,
    status: targetStatus,
  });
}
