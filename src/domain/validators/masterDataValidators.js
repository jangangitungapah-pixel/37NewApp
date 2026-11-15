import {
  BOOKING_INITIAL_STATUS_POLICY,
  BUSINESS_STATUS,
  COMMISSION_BASIS,
  COMMISSION_METHOD,
  CUSTOMER_STATUS,
  PRICING_MODEL,
  SCHEMA_VERSIONS,
  SERVICE_CATEGORY,
  SETTING_IDS,
  SLOT_GRANULARITY_OPTIONS,
  STUDIO_STATUS,
} from '../enums/roles.js';
import {
  DomainValidationError,
  optionalStringOrNull,
  requireNonEmptyString,
} from './schemaValidators.js';

const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const VALID_STUDIO_STATUSES = new Set(Object.values(STUDIO_STATUS));
const VALID_BUSINESS_STATUSES = new Set(Object.values(BUSINESS_STATUS));
const VALID_SERVICE_CATEGORIES = new Set(Object.values(SERVICE_CATEGORY));
const VALID_PRICING_MODELS = new Set(Object.values(PRICING_MODEL));
const VALID_COMMISSION_METHODS = new Set(Object.values(COMMISSION_METHOD));
const VALID_COMMISSION_BASES = new Set(Object.values(COMMISSION_BASIS));
const VALID_CUSTOMER_STATUSES = new Set(Object.values(CUSTOMER_STATUS));
const VALID_GRANULARITIES = new Set(SLOT_GRANULARITY_OPTIONS);
const VALID_SETTING_IDS = new Set(Object.values(SETTING_IDS));
const VALID_INITIAL_BOOKING_STATUSES = new Set(Object.values(BOOKING_INITIAL_STATUS_POLICY));

/**
 * Ensures an integer amount >= min && <= max.
 * @param {unknown} value
 * @param {string} field
 * @param {{ min?: number, max?: number }} [bounds]
 * @returns {number}
 */
export function requireSafeInt(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new DomainValidationError(
      `Field "${field}" harus berupa bilangan bulat antara ${min} dan ${max}.`,
      field,
    );
  }
  return value;
}

/**
 * Converts HH:mm string to minutes since midnight.
 * @param {unknown} timeStr
 * @param {string} field
 * @returns {number}
 */
export function parseTimeToMinutes(timeStr, field = 'time') {
  if (typeof timeStr !== 'string') {
    throw new DomainValidationError(`Format jam "${field}" harus berupa string HH:mm.`, field);
  }
  const trimmed = timeStr.trim();
  const match = HH_MM_PATTERN.exec(trimmed);
  if (!match) {
    throw new DomainValidationError(`Format jam "${field}" harus HH:mm (contoh 10:00).`, field);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Validates and normalizes daily operating hours (`{ openTime, closeTime }`).
 * @param {unknown} rawHours
 * @returns {{ openTime: string, closeTime: string }}
 */
export function validateOperatingHours(rawHours) {
  if (!rawHours || typeof rawHours !== 'object') {
    throw new DomainValidationError('Jam operasional wajib diisi.', 'operatingHours');
  }
  const openTime = typeof rawHours.openTime === 'string' ? rawHours.openTime.trim() : '';
  const closeTime = typeof rawHours.closeTime === 'string' ? rawHours.closeTime.trim() : '';
  const openMins = parseTimeToMinutes(openTime, 'openTime');
  const closeMins = parseTimeToMinutes(closeTime, 'closeTime');

  if (closeMins <= openMins) {
    throw new DomainValidationError(
      'Jam tutup operasional harus lebih lambat daripada jam buka.',
      'closeTime',
    );
  }

  return { openTime, closeTime };
}

/**
 * Validates and normalizes `businesses/{businessId}/profile/main`.
 * @param {Record<string, unknown>} raw
 */
export function validateBusinessProfile(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen business profile tidak valid.');
  }
  const status = requireNonEmptyString(raw.status || BUSINESS_STATUS.ACTIVE, 'status');
  if (!VALID_BUSINESS_STATUSES.has(status)) {
    throw new DomainValidationError(`Status profil bisnis tidak dikenal: ${status}`, 'status');
  }

  return {
    businessId: requireNonEmptyString(raw.businessId, 'businessId'),
    displayName: requireNonEmptyString(raw.displayName, 'displayName').slice(0, 120),
    legalName: optionalStringOrNull(raw.legalName, 'legalName'),
    phone: optionalStringOrNull(raw.phone, 'phone'),
    email: optionalStringOrNull(raw.email, 'email'),
    address: optionalStringOrNull(raw.address, 'address'),
    timezone: requireNonEmptyString(raw.timezone || 'Asia/Jakarta', 'timezone'),
    currency: requireNonEmptyString(raw.currency || 'IDR', 'currency'),
    status,
    schemaVersion: requireSafeInt(raw.schemaVersion ?? SCHEMA_VERSIONS.BUSINESS_PROFILE, 'schemaVersion', { min: 1 }),
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    createdBy: requireNonEmptyString(raw.createdBy, 'createdBy'),
    updatedBy: requireNonEmptyString(raw.updatedBy, 'updatedBy'),
  };
}

/**
 * Returns baseline Phase 02 default settings for a businessId.
 */
export function createDefaultSettingsPayloads(businessId, actorUid) {
  return {
    [SETTING_IDS.BUSINESS]: {
      settingId: SETTING_IDS.BUSINESS,
      businessId,
      defaultTimezone: 'Asia/Jakarta',
      currency: 'IDR',
      allowMultiStudio: true,
      configVersion: 1,
      schemaVersion: SCHEMA_VERSIONS.SETTINGS,
      createdBy: actorUid,
      updatedBy: actorUid,
    },
    [SETTING_IDS.SCHEDULE]: {
      settingId: SETTING_IDS.SCHEDULE,
      businessId,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
      bufferMinutes: 0,
      configVersion: 1,
      schemaVersion: SCHEMA_VERSIONS.SETTINGS,
      createdBy: actorUid,
      updatedBy: actorUid,
    },
    [SETTING_IDS.PRICING]: {
      settingId: SETTING_IDS.PRICING,
      businessId,
      currency: 'IDR',
      taxPercent: 0,
      allowOperatorDiscount: false,
      roundingUnitMinor: 1,
      configVersion: 1,
      schemaVersion: SCHEMA_VERSIONS.SETTINGS,
      createdBy: actorUid,
      updatedBy: actorUid,
    },
    [SETTING_IDS.COMMISSION]: {
      settingId: SETTING_IDS.COMMISSION,
      businessId,
      defaultMethod: COMMISSION_METHOD.PERCENTAGE,
      defaultRatePercent: 10,
      defaultFixedAmountMinor: 0,
      basis: COMMISSION_BASIS.SETTLED_AMOUNT,
      applyOnStatus: 'settled',
      configVersion: 1,
      schemaVersion: SCHEMA_VERSIONS.SETTINGS,
      createdBy: actorUid,
      updatedBy: actorUid,
    },
    [SETTING_IDS.BOOKING_POLICY]: {
      settingId: SETTING_IDS.BOOKING_POLICY,
      businessId,
      defaultInitialStatus: BOOKING_INITIAL_STATUS_POLICY.CONFIRMED,
      requireCustomerPhone: true,
      allowSameDayReschedule: true,
      cancellationNoticeMinutes: 120,
      configVersion: 1,
      schemaVersion: SCHEMA_VERSIONS.SETTINGS,
      createdBy: actorUid,
      updatedBy: actorUid,
    },
  };
}

/**
 * Validates and normalizes `businesses/{businessId}/settings/{settingId}`.
 * @param {string} settingId
 * @param {Record<string, unknown>} raw
 */
export function validateSettingsDoc(settingId, raw) {
  if (!VALID_SETTING_IDS.has(settingId)) {
    throw new DomainValidationError(`Setting ID tidak valid: ${settingId}`, 'settingId');
  }
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen settings tidak valid.');
  }

  const base = {
    settingId,
    businessId: requireNonEmptyString(raw.businessId, 'businessId'),
    configVersion: requireSafeInt(raw.configVersion ?? 1, 'configVersion', { min: 1 }),
    schemaVersion: requireSafeInt(raw.schemaVersion ?? SCHEMA_VERSIONS.SETTINGS, 'schemaVersion', { min: 1 }),
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    createdBy: requireNonEmptyString(raw.createdBy, 'createdBy'),
    updatedBy: requireNonEmptyString(raw.updatedBy, 'updatedBy'),
  };

  switch (settingId) {
    case SETTING_IDS.BUSINESS:
      return {
        ...base,
        defaultTimezone: requireNonEmptyString(raw.defaultTimezone || 'Asia/Jakarta', 'defaultTimezone'),
        currency: requireNonEmptyString(raw.currency || 'IDR', 'currency'),
        allowMultiStudio: Boolean(raw.allowMultiStudio ?? true),
      };
    case SETTING_IDS.SCHEDULE: {
      const granularity = Number(raw.slotGranularityMinutes ?? 15);
      if (!VALID_GRANULARITIES.has(granularity)) {
        throw new DomainValidationError(
          'slotGranularityMinutes hanya mendukung 15, 30, atau 60 menit.',
          'slotGranularityMinutes',
        );
      }
      return {
        ...base,
        operatingHours: validateOperatingHours(raw.operatingHours || { openTime: '10:00', closeTime: '22:00' }),
        slotGranularityMinutes: granularity,
        bufferMinutes: requireSafeInt(raw.bufferMinutes ?? 0, 'bufferMinutes', { min: 0, max: 120 }),
      };
    }
    case SETTING_IDS.PRICING:
      return {
        ...base,
        currency: requireNonEmptyString(raw.currency || 'IDR', 'currency'),
        taxPercent: requireSafeInt(raw.taxPercent ?? 0, 'taxPercent', { min: 0, max: 100 }),
        allowOperatorDiscount: Boolean(raw.allowOperatorDiscount ?? false),
        roundingUnitMinor: requireSafeInt(raw.roundingUnitMinor ?? 1, 'roundingUnitMinor', { min: 1, max: 10000 }),
      };
    case SETTING_IDS.COMMISSION: {
      const defaultMethod = requireNonEmptyString(
        raw.defaultMethod || COMMISSION_METHOD.PERCENTAGE,
        'defaultMethod',
      );
      if (
        defaultMethod !== COMMISSION_METHOD.NONE &&
        defaultMethod !== COMMISSION_METHOD.PERCENTAGE &&
        defaultMethod !== COMMISSION_METHOD.FIXED_PER_BOOKING
      ) {
        throw new DomainValidationError(
          `Metode komisi default tidak valid: ${defaultMethod}`,
          'defaultMethod',
        );
      }
      const basis = requireNonEmptyString(raw.basis || COMMISSION_BASIS.SETTLED_AMOUNT, 'basis');
      if (!VALID_COMMISSION_BASES.has(basis)) {
        throw new DomainValidationError(`Basis komisi tidak valid: ${basis}`, 'basis');
      }
      return {
        ...base,
        defaultMethod,
        defaultRatePercent: requireSafeInt(raw.defaultRatePercent ?? 0, 'defaultRatePercent', { min: 0, max: 100 }),
        defaultFixedAmountMinor: requireSafeInt(
          raw.defaultFixedAmountMinor ?? 0,
          'defaultFixedAmountMinor',
          { min: 0 },
        ),
        basis,
        applyOnStatus: 'settled',
      };
    }
    case SETTING_IDS.BOOKING_POLICY: {
      const defaultInitialStatus = requireNonEmptyString(
        raw.defaultInitialStatus || BOOKING_INITIAL_STATUS_POLICY.CONFIRMED,
        'defaultInitialStatus',
      );
      if (!VALID_INITIAL_BOOKING_STATUSES.has(defaultInitialStatus)) {
        throw new DomainValidationError(
          `Initial booking status policy tidak valid: ${defaultInitialStatus}`,
          'defaultInitialStatus',
        );
      }
      return {
        ...base,
        defaultInitialStatus,
        requireCustomerPhone: Boolean(raw.requireCustomerPhone ?? true),
        allowSameDayReschedule: Boolean(raw.allowSameDayReschedule ?? true),
        cancellationNoticeMinutes: requireSafeInt(
          raw.cancellationNoticeMinutes ?? 120,
          'cancellationNoticeMinutes',
          { min: 0, max: 10080 },
        ),
      };
    }
    default:
      throw new DomainValidationError(`Setting ID tidak dikenali: ${settingId}`, 'settingId');
  }
}

/**
 * Validates and normalizes `businesses/{businessId}/studios/{studioId}`.
 * @param {Record<string, unknown>} raw
 */
export function validateStudio(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen studio tidak valid.');
  }

  const name = requireNonEmptyString(raw.name, 'name');
  if (name.length < 2 || name.length > 80) {
    throw new DomainValidationError('Nama studio harus 2–80 karakter.', 'name');
  }

  const code = requireNonEmptyString(raw.code, 'code').toUpperCase();
  if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
    throw new DomainValidationError(
      'Kode studio harus 2–20 karakter alfanumerik, "-" atau "_" (contoh STUDIO-A).',
      'code',
    );
  }

  const status = requireNonEmptyString(raw.status || STUDIO_STATUS.ACTIVE, 'status');
  if (!VALID_STUDIO_STATUSES.has(status)) {
    throw new DomainValidationError(`Status studio tidak valid: ${status}`, 'status');
  }

  const granularity = Number(raw.slotGranularityMinutes ?? 15);
  if (!VALID_GRANULARITIES.has(granularity)) {
    throw new DomainValidationError(
      'Granularitas slot studio harus 15, 30, atau 60 menit.',
      'slotGranularityMinutes',
    );
  }

  return {
    studioId: requireNonEmptyString(raw.studioId, 'studioId'),
    businessId: requireNonEmptyString(raw.businessId, 'businessId'),
    name,
    code,
    status,
    timezone: requireNonEmptyString(raw.timezone || 'Asia/Jakarta', 'timezone'),
    operatingHours: validateOperatingHours(raw.operatingHours || { openTime: '10:00', closeTime: '22:00' }),
    slotGranularityMinutes: granularity,
    description: optionalStringOrNull(raw.description, 'description'),
    schemaVersion: requireSafeInt(raw.schemaVersion ?? SCHEMA_VERSIONS.STUDIO, 'schemaVersion', { min: 1 }),
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    createdBy: requireNonEmptyString(raw.createdBy, 'createdBy'),
    updatedBy: requireNonEmptyString(raw.updatedBy, 'updatedBy'),
  };
}

/**
 * Validates and normalizes `businesses/{businessId}/services/{serviceId}`.
 * Uses strict integer money (IDR) and versioned config metadata.
 * @param {Record<string, unknown>} raw
 */
export function validateService(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen service tidak valid.');
  }

  const name = requireNonEmptyString(raw.name, 'name');
  if (name.length < 2 || name.length > 80) {
    throw new DomainValidationError('Nama service harus 2–80 karakter.', 'name');
  }

  const category = requireNonEmptyString(raw.category, 'category').toLowerCase();
  if (!VALID_SERVICE_CATEGORIES.has(category)) {
    throw new DomainValidationError(`Kategori service tidak valid: ${category}`, 'category');
  }

  const pricingModel = requireNonEmptyString(raw.pricingModel || PRICING_MODEL.HOURLY, 'pricingModel');
  if (!VALID_PRICING_MODELS.has(pricingModel)) {
    throw new DomainValidationError(`Model pricing tidak valid: ${pricingModel}`, 'pricingModel');
  }

  if (!Array.isArray(raw.durationOptions) || raw.durationOptions.length === 0) {
    throw new DomainValidationError('Minimal satu opsi durasi (menit) wajib ditentukan.', 'durationOptions');
  }
  const uniqueDurations = Array.from(
    new Set(
      raw.durationOptions.map((item) =>
        requireSafeInt(Number(item), 'durationOptions', { min: 15, max: 1440 }),
      ),
    ),
  ).sort((a, b) => a - b);

  if (uniqueDurations.length > 12) {
    throw new DomainValidationError('Maksimal 12 opsi durasi per service.', 'durationOptions');
  }

  const basePriceMinor = requireSafeInt(raw.basePriceMinor, 'basePriceMinor', { min: 0 });

  const rawDurationPrices =
    raw.durationPricesMinor && typeof raw.durationPricesMinor === 'object'
      ? raw.durationPricesMinor
      : {};
  const durationPricesMinor = {};
  for (const durationKey of Object.keys(rawDurationPrices)) {
    const val = rawDurationPrices[durationKey];
    if (val !== undefined && val !== null && val !== '') {
      durationPricesMinor[String(durationKey)] = requireSafeInt(
        Number(val),
        `durationPricesMinor.${durationKey}`,
        { min: 0 },
      );
    }
  }

  const commissionMethod = requireNonEmptyString(
    raw.commissionMethod || COMMISSION_METHOD.INHERIT,
    'commissionMethod',
  );
  if (!VALID_COMMISSION_METHODS.has(commissionMethod)) {
    throw new DomainValidationError(
      `Metode komisi service tidak valid: ${commissionMethod}`,
      'commissionMethod',
    );
  }
  const maxCommissionValue = commissionMethod === COMMISSION_METHOD.PERCENTAGE ? 100 : Number.MAX_SAFE_INTEGER;
  const commissionValue = requireSafeInt(raw.commissionValue ?? 0, 'commissionValue', {
    min: 0,
    max: maxCommissionValue,
  });

  const applicableStudioIds = Array.isArray(raw.applicableStudioIds)
    ? raw.applicableStudioIds.map((id) => requireNonEmptyString(id, 'applicableStudioIds'))
    : [];

  return {
    serviceId: requireNonEmptyString(raw.serviceId, 'serviceId'),
    businessId: requireNonEmptyString(raw.businessId, 'businessId'),
    name,
    category,
    pricingModel,
    durationOptions: uniqueDurations,
    basePriceMinor,
    durationPricesMinor,
    commissionMethod,
    commissionValue,
    applicableStudioIds: Array.from(new Set(applicableStudioIds)),
    active: Boolean(raw.active ?? true),
    description: optionalStringOrNull(raw.description, 'description'),
    configVersion: requireSafeInt(raw.configVersion ?? 1, 'configVersion', { min: 1 }),
    schemaVersion: requireSafeInt(raw.schemaVersion ?? SCHEMA_VERSIONS.SERVICE, 'schemaVersion', { min: 1 }),
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    createdBy: requireNonEmptyString(raw.createdBy, 'createdBy'),
    updatedBy: requireNonEmptyString(raw.updatedBy, 'updatedBy'),
  };
}

/**
 * Validates and normalizes `businesses/{businessId}/customers/{customerId}`.
 * @param {Record<string, unknown>} raw
 */
export function validateCustomer(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen customer tidak valid.');
  }

  const name = requireNonEmptyString(raw.name, 'name');
  if (name.length < 2 || name.length > 120) {
    throw new DomainValidationError('Nama customer harus 2–120 karakter.', 'name');
  }

  const phone = requireNonEmptyString(raw.phone, 'phone').replace(/\s+/g, ' ');
  if (phone.length < 6 || phone.length > 24) {
    throw new DomainValidationError('Nomor telepon/WhatsApp customer harus 6–24 karakter.', 'phone');
  }

  const email = optionalStringOrNull(raw.email, 'email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new DomainValidationError('Format email customer tidak valid.', 'email');
  }

  const status = requireNonEmptyString(raw.status || CUSTOMER_STATUS.ACTIVE, 'status');
  if (!VALID_CUSTOMER_STATUSES.has(status)) {
    throw new DomainValidationError(`Status customer tidak valid: ${status}`, 'status');
  }

  return {
    customerId: requireNonEmptyString(raw.customerId, 'customerId'),
    businessId: requireNonEmptyString(raw.businessId, 'businessId'),
    name,
    nameLower: name.toLowerCase(),
    phone,
    email,
    bandOrActName: optionalStringOrNull(raw.bandOrActName, 'bandOrActName'),
    notes: optionalStringOrNull(raw.notes, 'notes'),
    status,
    schemaVersion: requireSafeInt(raw.schemaVersion ?? SCHEMA_VERSIONS.CUSTOMER, 'schemaVersion', { min: 1 }),
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    createdBy: requireNonEmptyString(raw.createdBy, 'createdBy'),
    updatedBy: requireNonEmptyString(raw.updatedBy, 'updatedBy'),
  };
}
