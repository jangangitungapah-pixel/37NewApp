import { getAppConfig } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { AppError, ERROR_CATEGORY } from '../../data/firebase/errorMapper.js';
import {
  isValidCloudinarySecureUrl,
  VALID_GALLERY_IMAGE_FORMATS,
} from '../../domain/validators/galleryValidators.js';

export const ALLOWED_GALLERY_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_GALLERY_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_GALLERY_DIMENSION_PX = 12000;

const ALLOWED_MIME_SET = new Set(ALLOWED_GALLERY_MIME_TYPES);

/**
 * Returns ONLY public unsigned-preset Cloudinary configuration.
 * Secrets (API secret / signed credentials) are strictly excluded from frontend code.
 *
 * @param {{ cloudName?: string, uploadPreset?: string } | null} [overrideConfig]
 * @returns {{ cloudName: string, uploadPreset: string }}
 */
export function getCloudinaryConfig(overrideConfig = null) {
  const source = overrideConfig || getAppConfig().cloudinary || {};
  return {
    cloudName: typeof source.cloudName === 'string' ? source.cloudName.trim() : '',
    uploadPreset: typeof source.uploadPreset === 'string' ? source.uploadPreset.trim() : '',
  };
}

/**
 * Checks whether unsigned Cloudinary upload prerequisites are configured.
 * @param {{ cloudName?: string, uploadPreset?: string } | null} [overrideConfig]
 * @returns {boolean}
 */
export function isCloudinaryConfigured(overrideConfig = null) {
  const { cloudName, uploadPreset } = getCloudinaryConfig(overrideConfig);
  return Boolean(cloudName && uploadPreset);
}

/**
 * Validates file type and byte size before creating a browser object URL or uploading.
 * @param {File | { name?: string, type?: string, size?: number } | null | undefined} file
 */
export function validateImageFileForUpload(file) {
  if (!file || typeof file !== 'object') {
    throw new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'gallery/missing-file',
      message: 'Pilih file gambar terlebih dahulu sebelum mengunggah.',
    });
  }

  const mimeType = typeof file.type === 'string' ? file.type.trim().toLowerCase() : '';
  if (!ALLOWED_MIME_SET.has(mimeType)) {
    throw new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'gallery/unsupported-mime',
      message: 'Format gambar harus JPEG, PNG, atau WebP.',
    });
  }

  const sizeBytes = Number(file.size || 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'gallery/empty-file',
      message: 'File gambar kosong atau tidak dapat dibaca.',
    });
  }

  if (sizeBytes > MAX_GALLERY_FILE_BYTES) {
    throw new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'gallery/file-too-large',
      message: 'Ukuran file gambar maksimal 5 MB untuk upload galeri studio.',
    });
  }

  return {
    mimeType,
    sizeBytes,
    fileName: typeof file.name === 'string' ? file.name : 'upload',
  };
}

/**
 * Reads natural pixel dimensions via browser object URL and guarantees `revokeObjectURL` cleanup.
 * @param {Blob | File} file
 * @param {{ urlApi?: typeof URL, ImageCtor?: typeof Image }} [deps]
 * @returns {Promise<{ width: number, height: number }>}
 */
export async function inspectImageDimensions(file, deps = {}) {
  const urlApi = deps.urlApi || globalThis.URL;
  const ImageCtor = deps.ImageCtor || globalThis.Image;

  if (!urlApi?.createObjectURL || !urlApi?.revokeObjectURL || !ImageCtor) {
    throw new AppError({
      category: ERROR_CATEGORY.CONFIG,
      code: 'gallery/image-inspector-unavailable',
      message: 'Lingkungan browser tidak mendukung inspeksi dimensi gambar.',
    });
  }

  const objectUrl = urlApi.createObjectURL(file);
  try {
    const dimensions = await new Promise((resolve, reject) => {
      const img = new ImageCtor();
      img.onload = () => {
        const width = Number(img.naturalWidth || img.width || 0);
        const height = Number(img.naturalHeight || img.height || 0);
        resolve({ width, height });
      };
      img.onerror = () => {
        reject(
          new AppError({
            category: ERROR_CATEGORY.VALIDATION,
            code: 'gallery/corrupt-image',
            message: 'Gambar rusak atau gagal didekode oleh browser.',
          }),
        );
      };
      img.src = objectUrl;
    });

    if (dimensions.width <= 0 || dimensions.height <= 0) {
      throw new AppError({
        category: ERROR_CATEGORY.VALIDATION,
        code: 'gallery/invalid-dimensions',
        message: 'Dimensi gambar tidak valid (harus lebih besar dari 0x0 piksel).',
      });
    }

    if (
      dimensions.width > MAX_GALLERY_DIMENSION_PX ||
      dimensions.height > MAX_GALLERY_DIMENSION_PX
    ) {
      throw new AppError({
        category: ERROR_CATEGORY.VALIDATION,
        code: 'gallery/dimensions-too-large',
        message: `Resolusi gambar melebihi batas maksimal ${MAX_GALLERY_DIMENSION_PX}px.`,
      });
    }

    return dimensions;
  } finally {
    urlApi.revokeObjectURL(objectUrl);
  }
}

/**
 * Sanitizes an identifier before building a Cloudinary folder path.
 * @param {unknown} segment
 * @returns {string}
 */
export function sanitizeCloudinaryFolderSegment(segment) {
  if (typeof segment !== 'string') {
    return '';
  }
  return segment
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

/**
 * Uploads an image directly to Cloudinary using unsigned preset `FormData`.
 * Never attaches `public_id` or secret credentials on client requests.
 *
 * @param {{
 *   file: File,
 *   businessId: string,
 *   studioId?: string | null,
 *   config?: { cloudName?: string, uploadPreset?: string } | null,
 *   fetchImpl?: typeof fetch,
 *   imageInspector?: (file: File) => Promise<{ width: number, height: number }>,
 * }} params
 */
export async function uploadImageToCloudinary({
  file,
  businessId,
  studioId = null,
  config = null,
  fetchImpl = globalThis.fetch,
  imageInspector = inspectImageDimensions,
}) {
  const cloudConfig = getCloudinaryConfig(config);
  if (!isCloudinaryConfigured(cloudConfig)) {
    throw new AppError({
      category: ERROR_CATEGORY.CONFIG,
      code: 'cloudinary/not-configured',
      message:
        'Cloudinary belum dikonfigurasi. Isi VITE_CLOUDINARY_CLOUD_NAME dan VITE_CLOUDINARY_UPLOAD_PRESET di environment.',
    });
  }

  const fileInfo = validateImageFileForUpload(file);
  const inspected = await imageInspector(file);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', cloudConfig.uploadPreset);

  const safeBusinessId = sanitizeCloudinaryFolderSegment(businessId);
  const safeStudioId = sanitizeCloudinaryFolderSegment(studioId || '');
  if (safeBusinessId) {
    const folderPath = safeStudioId
      ? `37musicstudio/${safeBusinessId}/${safeStudioId}`
      : `37musicstudio/${safeBusinessId}`;
    formData.append('folder', folderPath);
  }

  if (typeof fetchImpl !== 'function') {
    throw new AppError({
      category: ERROR_CATEGORY.CONFIG,
      code: 'cloudinary/fetch-unavailable',
      message: 'HTTP client upload tidak tersedia di lingkungan saat ini.',
    });
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(
    cloudConfig.cloudName,
  )}/image/upload`;

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      body: formData,
    });
  } catch (networkErr) {
    logger.warn('cloudinary', 'Network error while uploading gallery image', {
      code: networkErr?.code || 'network-error',
    });
    throw new AppError({
      category: ERROR_CATEGORY.UNAVAILABLE,
      code: 'cloudinary/network-error',
      message: 'Upload gambar ke Cloudinary gagal karena koneksi jaringan terputus.',
      retryable: true,
      cause: networkErr,
    });
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const cloudMessage =
      typeof payload?.error?.message === 'string' && payload.error.message.trim()
        ? payload.error.message.trim()
        : `HTTP ${response.status}`;

    const isServerOrRateIssue = response.status >= 500 || response.status === 420 || response.status === 429;
    throw new AppError({
      category: isServerOrRateIssue ? ERROR_CATEGORY.UNAVAILABLE : ERROR_CATEGORY.VALIDATION,
      code: isServerOrRateIssue ? 'cloudinary/upstream-error' : 'cloudinary/upload-rejected',
      message: `Upload Cloudinary ditolak: ${cloudMessage}`,
      retryable: isServerOrRateIssue,
    });
  }

  const secureUrl = typeof payload?.secure_url === 'string' ? payload.secure_url.trim() : '';
  const publicId = typeof payload?.public_id === 'string' ? payload.public_id.trim() : '';
  const normalizedFormat = String(
    payload?.format || fileInfo.mimeType.replace('image/', '') || 'jpg',
  )
    .trim()
    .toLowerCase();

  if (!isValidCloudinarySecureUrl(secureUrl) || !publicId) {
    throw new AppError({
      category: ERROR_CATEGORY.UNKNOWN,
      code: 'cloudinary/malformed-response',
      message: 'Respons Cloudinary tidak menyertakan secure_url atau public_id yang valid.',
    });
  }

  if (!VALID_GALLERY_IMAGE_FORMATS.has(normalizedFormat)) {
    throw new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'cloudinary/unsupported-response-format',
      message: `Format hasil upload Cloudinary tidak didukung: ${normalizedFormat}`,
    });
  }

  const result = {
    publicId,
    secureUrl,
    format: normalizedFormat,
    width: Math.max(1, Math.round(Number(payload?.width || inspected.width || 1))),
    height: Math.max(1, Math.round(Number(payload?.height || inspected.height || 1))),
    bytes: Math.max(1, Math.round(Number(payload?.bytes || fileInfo.sizeBytes || 1))),
  };

  logger.info('cloudinary', 'Unsigned image upload succeeded', {
    publicId: result.publicId,
    format: result.format,
    bytes: result.bytes,
  });

  return result;
}

/**
 * Generates an optimized responsive Cloudinary CDN URL with `f_auto,q_auto,c_<crop>,w_<width>`.
 *
 * @param {string} secureUrl
 * @param {{ width?: number, crop?: string, quality?: string, format?: string }} [options]
 * @returns {string}
 */
export function buildCloudinaryImageUrl(
  secureUrl,
  { width = 800, crop = 'limit', quality = 'auto', format = 'auto' } = {},
) {
  if (!isValidCloudinarySecureUrl(secureUrl)) {
    return '';
  }

  const numericWidth = Number(width);
  const safeWidth = Number.isFinite(numericWidth)
    ? Math.min(2400, Math.max(64, Math.round(numericWidth)))
    : 800;
  const safeCrop = /^[a-z_]+$/.test(String(crop)) ? String(crop) : 'limit';
  const safeQuality = /^[a-z0-9_:]+$/.test(String(quality)) ? String(quality) : 'auto';
  const safeFormat = /^[a-z0-9_]+$/.test(String(format)) ? String(format) : 'auto';

  const trimmed = secureUrl.trim();
  const match = trimmed.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/);
  if (!match) {
    return trimmed;
  }

  const [, baseUploadPrefix, tailPath] = match;
  const cleanedTail = tailPath.replace(/^f_[^/]+,q_[^/]+\//, '');
  const transformSegment = `f_${safeFormat},q_${safeQuality},c_${safeCrop},w_${safeWidth}/`;
  return `${baseUploadPrefix}${transformSegment}${cleanedTail}`;
}
