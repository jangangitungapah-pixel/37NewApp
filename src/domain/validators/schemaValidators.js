import {
  BUSINESS_STATUS,
  MEMBER_STATUS,
  OPERATOR_DEFAULT_PERMISSIONS,
  OWNER_DEFAULT_PERMISSIONS,
  ROLES,
  SCHEMA_VERSIONS,
} from '../enums/roles.js';

/**
 * Pure domain validator error.
 */
export class DomainValidationError extends Error {
  /**
   * @param {string} message
   * @param {string} [field]
   */
  constructor(message, field = '') {
    super(message);
    this.name = 'DomainValidationError';
    this.code = 'validation';
    this.field = field;
  }
}

const VALID_ROLES = new Set(Object.values(ROLES));
const VALID_MEMBER_STATUSES = new Set(Object.values(MEMBER_STATUS));
const VALID_BUSINESS_STATUSES = new Set(Object.values(BUSINESS_STATUS));

/**
 * Ensures a required non-empty string field.
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
export function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainValidationError(`Field "${field}" wajib berupa string non-kosong.`, field);
  }
  return value.trim();
}

/**
 * Ensures an optional nullable string field.
 * @param {unknown} value
 * @param {string} field
 * @returns {string|null}
 */
export function optionalStringOrNull(value, field) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new DomainValidationError(`Field "${field}" harus berupa string atau null.`, field);
  }
  return value.trim();
}

/**
 * Validates and normalizes a global user profile document (`users/{uid}`).
 * Rejects any unexpected business permission properties if injected.
 *
 * @param {Record<string, unknown>} raw
 * @returns {{
 *   uid: string,
 *   displayName: string,
 *   email: string,
 *   photoURL: string | null,
 *   defaultBusinessId: string | null,
 *   schemaVersion: number,
 *   createdAt: unknown,
 *   updatedAt: unknown,
 * }}
 */
export function validateUserProfile(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen user profile tidak valid.');
  }
  const forbiddenKeys = ['role', 'status', 'permissions', 'assignedStudioIds'];
  for (const key of forbiddenKeys) {
    if (key in raw) {
      throw new DomainValidationError(
        `Dokumen user global tidak boleh menyimpan permission field "${key}".`,
        key,
      );
    }
  }

  return {
    uid: requireNonEmptyString(raw.uid, 'uid'),
    displayName: typeof raw.displayName === 'string' ? raw.displayName.trim() : '',
    email: requireNonEmptyString(raw.email, 'email'),
    photoURL: optionalStringOrNull(raw.photoURL, 'photoURL'),
    defaultBusinessId: optionalStringOrNull(raw.defaultBusinessId, 'defaultBusinessId'),
    schemaVersion:
      Number.isInteger(raw.schemaVersion) && raw.schemaVersion >= 1
        ? raw.schemaVersion
        : SCHEMA_VERSIONS.USER_PROFILE,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
}

/**
 * Validates and normalizes a business root document (`businesses/{businessId}`).
 *
 * @param {Record<string, unknown>} raw
 * @returns {{
 *   businessId: string,
 *   name: string,
 *   slug: string,
 *   ownerUid: string,
 *   timezone: string,
 *   currency: string,
 *   status: string,
 *   schemaVersion: number,
 *   createdAt: unknown,
 *   updatedAt: unknown,
 *   createdBy: string,
 *   updatedBy: string,
 * }}
 */
export function validateBusiness(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen business tidak valid.');
  }

  const status = requireNonEmptyString(raw.status, 'status');
  if (!VALID_BUSINESS_STATUSES.has(status)) {
    throw new DomainValidationError(`Status business tidak dikenali: ${status}`, 'status');
  }

  const schemaVersion = raw.schemaVersion;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new DomainValidationError('Field "schemaVersion" harus integer >= 1.', 'schemaVersion');
  }

  return {
    businessId: requireNonEmptyString(raw.businessId, 'businessId'),
    name: requireNonEmptyString(raw.name, 'name'),
    slug: typeof raw.slug === 'string' ? raw.slug.trim() : '',
    ownerUid: requireNonEmptyString(raw.ownerUid, 'ownerUid'),
    timezone: requireNonEmptyString(raw.timezone || 'Asia/Jakarta', 'timezone'),
    currency: requireNonEmptyString(raw.currency || 'IDR', 'currency'),
    status,
    schemaVersion,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    createdBy: requireNonEmptyString(raw.createdBy, 'createdBy'),
    updatedBy: requireNonEmptyString(raw.updatedBy, 'updatedBy'),
  };
}

/**
 * Validates and normalizes a business membership document (`businesses/{businessId}/members/{uid}`).
 * Invalid documents are rejected explicitly instead of entering application state silently.
 *
 * @param {Record<string, unknown>} raw
 * @returns {{
 *   uid: string,
 *   businessId: string,
 *   email: string,
 *   displayName: string,
 *   role: 'owner' | 'operator',
 *   status: 'active' | 'invited' | 'suspended' | 'revoked',
 *   assignedStudioIds: string[],
 *   permissions: Record<string, boolean>,
 *   schemaVersion: number,
 *   createdAt: unknown,
 *   updatedAt: unknown,
 *   createdBy: string,
 *   updatedBy: string,
 * }}
 */
export function validateMember(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen membership tidak valid.');
  }

  const role = requireNonEmptyString(raw.role, 'role');
  if (!VALID_ROLES.has(role)) {
    throw new DomainValidationError(`Role membership tidak dikenali: ${role}`, 'role');
  }

  const status = requireNonEmptyString(raw.status, 'status');
  if (!VALID_MEMBER_STATUSES.has(status)) {
    throw new DomainValidationError(`Status membership tidak dikenali: ${status}`, 'status');
  }

  if (!Array.isArray(raw.assignedStudioIds)) {
    throw new DomainValidationError('Field "assignedStudioIds" harus berupa array.', 'assignedStudioIds');
  }

  const assignedStudioIds = raw.assignedStudioIds.map((item, idx) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new DomainValidationError(
        `assignedStudioIds[${idx}] harus berupa string non-kosong.`,
        'assignedStudioIds',
      );
    }
    return item.trim();
  });

  const schemaVersion = raw.schemaVersion;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new DomainValidationError('Field "schemaVersion" harus integer >= 1.', 'schemaVersion');
  }

  const defaultPerms =
    role === ROLES.OWNER ? OWNER_DEFAULT_PERMISSIONS : OPERATOR_DEFAULT_PERMISSIONS;
  const rawPerms = raw.permissions && typeof raw.permissions === 'object' ? raw.permissions : {};
  const normalizedPerms = { ...defaultPerms };
  for (const key of Object.keys(defaultPerms)) {
    if (typeof rawPerms[key] === 'boolean') {
      normalizedPerms[key] = rawPerms[key];
    }
  }

  return {
    uid: requireNonEmptyString(raw.uid, 'uid'),
    businessId: requireNonEmptyString(raw.businessId, 'businessId'),
    email: typeof raw.email === 'string' ? raw.email.trim() : '',
    displayName: requireNonEmptyString(raw.displayName, 'displayName'),
    role: /** @type {'owner' | 'operator'} */ (role),
    status: /** @type {'active' | 'invited' | 'suspended' | 'revoked'} */ (status),
    assignedStudioIds,
    permissions: normalizedPerms,
    schemaVersion,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    createdBy: requireNonEmptyString(raw.createdBy, 'createdBy'),
    updatedBy: requireNonEmptyString(raw.updatedBy, 'updatedBy'),
  };
}
