import {
  GALLERY_ASSET_STATUS,
  GALLERY_IMAGE_FORMATS,
  SCHEMA_VERSIONS,
} from '../enums/roles.js';
import { requireSafeInt } from './masterDataValidators.js';
import {
  DomainValidationError,
  optionalStringOrNull,
  requireNonEmptyString,
} from './schemaValidators.js';

export const CLOUDINARY_SECURE_URL_PREFIX = 'https://res.cloudinary.com/';
export const VALID_GALLERY_ASSET_STATUSES = new Set(Object.values(GALLERY_ASSET_STATUS));
export const VALID_GALLERY_IMAGE_FORMATS = new Set(Object.values(GALLERY_IMAGE_FORMATS));

/**
 * Validates that a URL is an HTTPS Cloudinary CDN asset URL.
 * @param {unknown} url
 * @returns {boolean}
 */
export function isValidCloudinarySecureUrl(url) {
  if (typeof url !== 'string') {
    return false;
  }
  const trimmed = url.trim();
  return (
    trimmed.length > CLOUDINARY_SECURE_URL_PREFIX.length &&
    trimmed.length <= 500 &&
    trimmed.startsWith(CLOUDINARY_SECURE_URL_PREFIX)
  );
}

/**
 * Validates and normalizes gallery asset editable metadata fields.
 * @param {Record<string, unknown>} raw
 * @returns {{
 *   studioId: string | null,
 *   caption: string | null,
 *   altText: string | null,
 *   order: number,
 * }}
 */
export function validateGalleryMetadataInput(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Payload metadata galeri tidak valid.');
  }

  const studioId = optionalStringOrNull(raw.studioId, 'studioId');
  if (studioId && studioId.length > 100) {
    throw new DomainValidationError('studioId maksimal 100 karakter.', 'studioId');
  }

  const caption = optionalStringOrNull(raw.caption, 'caption');
  if (caption && caption.length > 200) {
    throw new DomainValidationError('Caption maksimal 200 karakter.', 'caption');
  }

  const altText = optionalStringOrNull(raw.altText, 'altText');
  if (altText && altText.length > 200) {
    throw new DomainValidationError('Alt text maksimal 200 karakter.', 'altText');
  }

  const parsedOrder = raw.order === undefined || raw.order === null || raw.order === '' ? 0 : Number(raw.order);
  const order = requireSafeInt(parsedOrder, 'order', { min: 0, max: 10000 });

  return {
    studioId,
    caption,
    altText,
    order,
  };
}

/**
 * Validates a full gallery asset document stored under `businesses/{businessId}/galleryAssets/{assetId}`.
 * @param {Record<string, unknown>} raw
 */
export function validateGalleryAssetDoc(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen gallery asset tidak valid.');
  }

  const assetId = requireNonEmptyString(raw.assetId, 'assetId');
  const businessId = requireNonEmptyString(raw.businessId, 'businessId');
  const publicId = requireNonEmptyString(raw.publicId, 'publicId');
  if (publicId.length > 240 || publicId.includes('..')) {
    throw new DomainValidationError('Cloudinary publicId tidak valid.', 'publicId');
  }

  const secureUrl = requireNonEmptyString(raw.secureUrl, 'secureUrl');
  if (!isValidCloudinarySecureUrl(secureUrl)) {
    throw new DomainValidationError(
      `secureUrl wajib diawali "${CLOUDINARY_SECURE_URL_PREFIX}".`,
      'secureUrl',
    );
  }

  const format = requireNonEmptyString(raw.format, 'format').toLowerCase();
  if (!VALID_GALLERY_IMAGE_FORMATS.has(format)) {
    throw new DomainValidationError(`Format gambar tidak didukung: ${format}`, 'format');
  }

  const width = requireSafeInt(Number(raw.width), 'width', { min: 1, max: 20000 });
  const height = requireSafeInt(Number(raw.height), 'height', { min: 1, max: 20000 });
  const bytes = requireSafeInt(Number(raw.bytes), 'bytes', { min: 1, max: 52428800 });

  const status = requireNonEmptyString(raw.status, 'status');
  if (!VALID_GALLERY_ASSET_STATUSES.has(status)) {
    throw new DomainValidationError(`Status gallery asset tidak valid: ${status}`, 'status');
  }

  const metadata = validateGalleryMetadataInput(raw);
  const uploadedBy = requireNonEmptyString(raw.uploadedBy, 'uploadedBy');
  const updatedBy = optionalStringOrNull(raw.updatedBy, 'updatedBy') ?? uploadedBy;

  if (raw.uploadedAt == null) {
    throw new DomainValidationError('Field "uploadedAt" wajib diisi.', 'uploadedAt');
  }
  if (raw.createdAt == null) {
    throw new DomainValidationError('Field "createdAt" wajib diisi.', 'createdAt');
  }
  if (raw.updatedAt == null) {
    throw new DomainValidationError('Field "updatedAt" wajib diisi.', 'updatedAt');
  }

  const schemaVersion = requireSafeInt(
    raw.schemaVersion ?? SCHEMA_VERSIONS.GALLERY_ASSET,
    'schemaVersion',
    { min: 1, max: 100 },
  );

  return {
    assetId,
    businessId,
    studioId: metadata.studioId,
    publicId,
    secureUrl,
    format,
    width,
    height,
    bytes,
    caption: metadata.caption,
    altText: metadata.altText,
    order: metadata.order,
    status,
    uploadedBy,
    uploadedAt: raw.uploadedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    updatedBy,
    schemaVersion,
  };
}

/**
 * Extracts epoch milliseconds for deterministic gallery asset sorting.
 * @param {unknown} value
 * @returns {number}
 */
function toEpochMs(value) {
  if (!value) {
    return 0;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'object' && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return value.seconds * 1000;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return 0;
}

/**
 * Deterministic sorter: ascending `order`, then newest `createdAt`, then ascending `assetId`.
 * @template {{ order?: number, createdAt?: unknown, assetId?: string }} T
 * @param {T[]} assets
 * @returns {T[]}
 */
export function sortGalleryAssets(assets) {
  if (!Array.isArray(assets)) {
    return [];
  }
  return [...assets].sort((a, b) => {
    const orderDiff = (a?.order ?? 0) - (b?.order ?? 0);
    if (orderDiff !== 0) {
      return orderDiff;
    }
    const createdDiff = toEpochMs(b?.createdAt) - toEpochMs(a?.createdAt);
    if (createdDiff !== 0) {
      return createdDiff;
    }
    return String(a?.assetId || '').localeCompare(String(b?.assetId || ''));
  });
}
