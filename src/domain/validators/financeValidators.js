import {
  COMMISSION_BASIS,
  COMMISSION_DIRECTION,
  COMMISSION_ENTRY_STATUS,
  COMMISSION_ENTRY_TYPE,
  COMMISSION_METHOD,
  LEDGER_DIRECTION,
  LEDGER_ENTRY_TYPE,
  PAYMENT_METHOD,
  SCHEMA_VERSIONS,
} from '../enums/roles.js';
import { isValidDateKey } from '../calculations/slotGenerator.js';
import { requireSafeInt } from './masterDataValidators.js';
import {
  DomainValidationError,
  optionalStringOrNull,
  requireNonEmptyString,
} from './schemaValidators.js';

const VALID_PAYMENT_METHODS = new Set(Object.values(PAYMENT_METHOD));
const VALID_LEDGER_TYPES = new Set(Object.values(LEDGER_ENTRY_TYPE));
const VALID_LEDGER_DIRECTIONS = new Set(Object.values(LEDGER_DIRECTION));
const VALID_COMMISSION_TYPES = new Set(Object.values(COMMISSION_ENTRY_TYPE));
const VALID_COMMISSION_DIRECTIONS = new Set(Object.values(COMMISSION_DIRECTION));
const VALID_COMMISSION_STATUSES = new Set(Object.values(COMMISSION_ENTRY_STATUS));
const VALID_COMMISSION_METHODS = new Set(Object.values(COMMISSION_METHOD));
const VALID_COMMISSION_BASES = new Set(Object.values(COMMISSION_BASIS));

export function buildSettlementPaymentEntryId(bookingId) {
  return `settlement_payment__${requireNonEmptyString(bookingId, 'bookingId')}`;
}

export function buildEarnedCommissionEntryId(bookingId) {
  return `commission_earned__${requireNonEmptyString(bookingId, 'bookingId')}`;
}

export function buildLedgerReversalEntryId(originalEntryId) {
  return `reversal__${requireNonEmptyString(originalEntryId, 'originalEntryId')}`;
}

export function buildCommissionReversalEntryId(originalEntryId) {
  return `comm_reversal__${requireNonEmptyString(originalEntryId, 'originalEntryId')}`;
}

/**
 * Validates settlement payment form / transaction parameters.
 */
export function validateSettlementInput(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Payload settlement tidak valid.');
  }
  const paymentMethod = requireNonEmptyString(raw.paymentMethod, 'paymentMethod');
  if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
    throw new DomainValidationError(`Metode pembayaran tidak valid: ${paymentMethod}`, 'paymentMethod');
  }
  const paidAmountMinor = requireSafeInt(Number(raw.paidAmountMinor), 'paidAmountMinor', {
    min: 0,
  });
  const settlementReference = optionalStringOrNull(raw.settlementReference, 'settlementReference');
  if (settlementReference && settlementReference.length > 120) {
    throw new DomainValidationError('Referensi pembayaran maksimal 120 karakter.', 'settlementReference');
  }
  const settlementNotes = optionalStringOrNull(raw.settlementNotes, 'settlementNotes');
  if (settlementNotes && settlementNotes.length > 300) {
    throw new DomainValidationError('Catatan settlement maksimal 300 karakter.', 'settlementNotes');
  }

  return {
    paymentMethod,
    paidAmountMinor,
    settlementReference,
    settlementNotes,
  };
}

/**
 * Validates and normalizes an immutable `businesses/{businessId}/ledgerEntries/{entryId}`.
 */
export function validateLedgerEntryDoc(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen ledger entry tidak valid.');
  }

  const type = requireNonEmptyString(raw.type, 'type');
  if (!VALID_LEDGER_TYPES.has(type)) {
    throw new DomainValidationError(`Tipe ledger entry tidak dikenal: ${type}`, 'type');
  }

  const direction = requireNonEmptyString(raw.direction, 'direction');
  if (!VALID_LEDGER_DIRECTIONS.has(direction)) {
    throw new DomainValidationError(`Arah ledger tidak dikenal: ${direction}`, 'direction');
  }

  const dateKey = requireNonEmptyString(raw.dateKey, 'dateKey');
  if (!isValidDateKey(dateKey)) {
    throw new DomainValidationError(`dateKey ledger tidak valid: ${dateKey}`, 'dateKey');
  }

  const paymentMethod = raw.paymentMethod
    ? requireNonEmptyString(raw.paymentMethod, 'paymentMethod')
    : null;
  if (paymentMethod && !VALID_PAYMENT_METHODS.has(paymentMethod)) {
    throw new DomainValidationError(`Metode pembayaran ledger tidak valid: ${paymentMethod}`, 'paymentMethod');
  }

  const relatedEntryId = optionalStringOrNull(raw.relatedEntryId, 'relatedEntryId');
  const reason = optionalStringOrNull(raw.reason, 'reason');
  if (
    (type === LEDGER_ENTRY_TYPE.REFUND ||
      type === LEDGER_ENTRY_TYPE.ADJUSTMENT ||
      type === LEDGER_ENTRY_TYPE.REVERSAL) &&
    (!reason || reason.length < 3)
  ) {
    throw new DomainValidationError(
      'Refund, adjustment, atau reversal wajib menyertakan alasan minimal 3 karakter.',
      'reason',
    );
  }
  if ((type === LEDGER_ENTRY_TYPE.ADJUSTMENT || type === LEDGER_ENTRY_TYPE.REVERSAL) && !relatedEntryId) {
    throw new DomainValidationError(
      'Adjustment atau reversal wajib mereferensikan entry asal (`relatedEntryId`).',
      'relatedEntryId',
    );
  }

  return {
    entryId: requireNonEmptyString(raw.entryId, 'entryId'),
    businessId: requireNonEmptyString(raw.businessId, 'businessId'),
    bookingId: requireNonEmptyString(raw.bookingId, 'bookingId'),
    studioId: requireNonEmptyString(raw.studioId, 'studioId'),
    dateKey,
    type,
    direction,
    amountMinor: requireSafeInt(raw.amountMinor, 'amountMinor', { min: 0 }),
    currency: requireNonEmptyString(raw.currency || 'IDR', 'currency'),
    paymentMethod,
    reference: optionalStringOrNull(raw.reference, 'reference'),
    notes: optionalStringOrNull(raw.notes, 'notes'),
    relatedEntryId,
    reason,
    schemaVersion: requireSafeInt(raw.schemaVersion ?? SCHEMA_VERSIONS.LEDGER_ENTRY, 'schemaVersion', {
      min: 1,
    }),
    createdAt: raw.createdAt ?? null,
    createdBy: requireNonEmptyString(raw.createdBy, 'createdBy'),
  };
}

/**
 * Validates and normalizes an immutable `businesses/{businessId}/commissionEntries/{entryId}`.
 */
export function validateCommissionEntryDoc(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen commission entry tidak valid.');
  }

  const entryType = requireNonEmptyString(raw.entryType, 'entryType');
  if (!VALID_COMMISSION_TYPES.has(entryType)) {
    throw new DomainValidationError(`Tipe commission entry tidak valid: ${entryType}`, 'entryType');
  }

  const direction = requireNonEmptyString(raw.direction, 'direction');
  if (!VALID_COMMISSION_DIRECTIONS.has(direction)) {
    throw new DomainValidationError(`Arah komisi tidak valid: ${direction}`, 'direction');
  }

  const status = requireNonEmptyString(raw.status || COMMISSION_ENTRY_STATUS.RECORDED, 'status');
  if (!VALID_COMMISSION_STATUSES.has(status)) {
    throw new DomainValidationError(`Status komisi tidak valid: ${status}`, 'status');
  }

  const method = requireNonEmptyString(raw.method || COMMISSION_METHOD.NONE, 'method');
  if (!VALID_COMMISSION_METHODS.has(method)) {
    throw new DomainValidationError(`Metode komisi tidak valid: ${method}`, 'method');
  }

  const basis = requireNonEmptyString(raw.basis || COMMISSION_BASIS.SETTLED_AMOUNT, 'basis');
  if (!VALID_COMMISSION_BASES.has(basis)) {
    throw new DomainValidationError(`Basis komisi tidak valid: ${basis}`, 'basis');
  }

  const dateKey = requireNonEmptyString(raw.dateKey, 'dateKey');
  if (!isValidDateKey(dateKey)) {
    throw new DomainValidationError(`dateKey komisi tidak valid: ${dateKey}`, 'dateKey');
  }

  const relatedEntryId = optionalStringOrNull(raw.relatedEntryId, 'relatedEntryId');
  const reason = optionalStringOrNull(raw.reason, 'reason');
  if (entryType !== COMMISSION_ENTRY_TYPE.EARNED) {
    if (!relatedEntryId) {
      throw new DomainValidationError(
        'Adjustment atau reversal komisi wajib mereferensikan entry asal.',
        'relatedEntryId',
      );
    }
    if (!reason || reason.length < 3) {
      throw new DomainValidationError(
        'Adjustment atau reversal komisi wajib disertai alasan minimal 3 karakter.',
        'reason',
      );
    }
  }

  return {
    entryId: requireNonEmptyString(raw.entryId, 'entryId'),
    businessId: requireNonEmptyString(raw.businessId, 'businessId'),
    bookingId: requireNonEmptyString(raw.bookingId, 'bookingId'),
    studioId: requireNonEmptyString(raw.studioId, 'studioId'),
    dateKey,
    operatorUid: requireNonEmptyString(raw.operatorUid, 'operatorUid'),
    entryType,
    direction,
    amountMinor: requireSafeInt(raw.amountMinor, 'amountMinor', { min: 0 }),
    currency: requireNonEmptyString(raw.currency || 'IDR', 'currency'),
    method,
    rateOrValue: requireSafeInt(raw.rateOrValue ?? 0, 'rateOrValue', { min: 0 }),
    basis,
    basisAmountMinor: requireSafeInt(raw.basisAmountMinor ?? 0, 'basisAmountMinor', { min: 0 }),
    source: requireNonEmptyString(raw.source || 'business_default', 'source'),
    relatedEntryId,
    reason,
    status,
    schemaVersion: requireSafeInt(
      raw.schemaVersion ?? SCHEMA_VERSIONS.COMMISSION_ENTRY,
      'schemaVersion',
      { min: 1 },
    ),
    createdAt: raw.createdAt ?? null,
    createdBy: requireNonEmptyString(raw.createdBy, 'createdBy'),
  };
}
