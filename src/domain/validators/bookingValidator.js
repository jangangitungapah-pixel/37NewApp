import {
  ACTIVITY_ENTITY_TYPE,
  ACTIVITY_EVENT_TYPE,
  BLOCKING_BOOKING_STATUSES,
  BOOKING_INITIAL_STATUS_POLICY,
  BOOKING_SLOT_KIND,
  BOOKING_SLOT_STATUS,
  BOOKING_STATUS,
  ROLES,
  SCHEMA_VERSIONS,
  SESSION_STATUS,
  STUDIO_STATUS,
} from '../enums/roles.js';
import { calculateOperatorCommission } from '../calculations/commissionCalculator.js';
import { calculateServicePrice } from '../calculations/pricingCalculator.js';
import { computeBookingSlotPlan, formatSlotId, isValidDateKey } from '../calculations/slotGenerator.js';
import {
  DomainValidationError,
  optionalStringOrNull,
  requireNonEmptyString,
} from './schemaValidators.js';
import { parseTimeToMinutes, requireSafeInt } from './masterDataValidators.js';

const VALID_BOOKING_STATUSES = new Set(Object.values(BOOKING_STATUS));
const BLOCKING_STATUS_SET = new Set(BLOCKING_BOOKING_STATUSES);
const VALID_SLOT_STATUSES = new Set(Object.values(BOOKING_SLOT_STATUS));
const VALID_SLOT_KINDS = new Set(Object.values(BOOKING_SLOT_KIND));
const VALID_EVENT_TYPES = new Set(Object.values(ACTIVITY_EVENT_TYPE));
const VALID_ENTITY_TYPES = new Set(Object.values(ACTIVITY_ENTITY_TYPE));
const VALID_INITIAL_STATUSES = new Set(Object.values(BOOKING_INITIAL_STATUS_POLICY));
const VALID_SESSION_STATUSES = new Set(Object.values(SESSION_STATUS));

/**
 * Complete booking operational + settlement lifecycle state transitions (Phase 03 + Phase 04).
 */
export const BOOKING_TRANSITIONS = Object.freeze({
  [BOOKING_STATUS.PENDING_CONFIRMATION]: Object.freeze([
    BOOKING_STATUS.CONFIRMED,
    BOOKING_STATUS.REJECTED,
    BOOKING_STATUS.CANCELLED,
  ]),
  [BOOKING_STATUS.CONFIRMED]: Object.freeze([
    BOOKING_STATUS.CANCELLED,
    BOOKING_STATUS.NO_SHOW,
    BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT,
  ]),
  [BOOKING_STATUS.IN_PROGRESS]: Object.freeze([
    BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT,
    BOOKING_STATUS.CANCELLED,
  ]),
  [BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT]: Object.freeze([
    BOOKING_STATUS.SETTLEMENT_REVIEW,
    BOOKING_STATUS.SETTLED,
  ]),
  [BOOKING_STATUS.SETTLEMENT_REVIEW]: Object.freeze([
    BOOKING_STATUS.SETTLED,
  ]),
  [BOOKING_STATUS.SETTLED]: Object.freeze([]),
  [BOOKING_STATUS.CANCELLED]: Object.freeze([]),
  [BOOKING_STATUS.NO_SHOW]: Object.freeze([]),
  [BOOKING_STATUS.REJECTED]: Object.freeze([]),
});

// Keep exported symbol name for Phase 03 compatibility
export const PHASE03_BOOKING_TRANSITIONS = BOOKING_TRANSITIONS;

export const RELEASING_BOOKING_STATUSES = new Set([
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.NO_SHOW,
  BOOKING_STATUS.REJECTED,
]);

export const RESCHEDULABLE_BOOKING_STATUSES = new Set([
  BOOKING_STATUS.PENDING_CONFIRMATION,
  BOOKING_STATUS.CONFIRMED,
]);

export function isBookingBlockingStatus(status) {
  return BLOCKING_STATUS_SET.has(status)
    && status !== BOOKING_STATUS.CANCELLED
    && status !== BOOKING_STATUS.NO_SHOW
    && status !== BOOKING_STATUS.REJECTED;
}

export function isBookingBlockingAvailability(booking) {
  return Boolean(booking && isBookingBlockingStatus(booking.status));
}

export function deriveSessionStatusFromBookingStatus(status) {
  switch (status) {
    case BOOKING_STATUS.PENDING_CONFIRMATION:
      return 'PENDING';
    case BOOKING_STATUS.CONFIRMED:
      return 'UPCOMING';
    case BOOKING_STATUS.IN_PROGRESS:
      return 'IN_PROGRESS';
    case BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT:
    case BOOKING_STATUS.SETTLEMENT_REVIEW:
    case BOOKING_STATUS.SETTLED:
      return 'COMPLETED';
    case BOOKING_STATUS.NO_SHOW:
      return 'NO_SHOW';
    case BOOKING_STATUS.CANCELLED:
    case BOOKING_STATUS.REJECTED:
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
}

export function canTransitionBookingStatus(fromStatus, toStatus) {
  const allowed = BOOKING_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

export function assertValidBookingTransition(fromStatus, toStatus) {
  if (!canTransitionBookingStatus(fromStatus, toStatus)) {
    throw new DomainValidationError(
      `Transisi status booking dari "${fromStatus}" ke "${toStatus}" tidak diizinkan.`,
      'status',
    );
  }
}

export function assertBookingNotInPast(startAt, referenceNow = new Date(), walkInGraceMinutes = 15) {
  const startMs = startAt instanceof Date ? startAt.getTime() : Number(startAt);
  const nowMs = referenceNow instanceof Date ? referenceNow.getTime() : Number(referenceNow);
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) {
    throw new DomainValidationError('Timestamp booking tidak valid.', 'startAt');
  }
  const thresholdMs = nowMs - walkInGraceMinutes * 60 * 1000;
  if (startMs < thresholdMs) {
    throw new DomainValidationError(
      'Tidak dapat membuat atau menjadwalkan booking pada waktu yang sudah lewat.',
      'startTime',
    );
  }
}

/**
 * Validates and builds complete deterministic booking creation payload + slot plan
 * from Master Data references (Studio, Service, Customer, Settings).
 */
export function buildValidatedNewBookingPayload({
  bookingId,
  businessId,
  actorUid,
  studio,
  service,
  customer,
  operatorUid = null,
  dateKey,
  startTime,
  durationMinutes,
  discountMinor = 0,
  notes = null,
  requestedInitialStatus = null,
  scheduleSetting = null,
  pricingSetting = null,
  commissionSetting = null,
  bookingPolicySetting = null,
  referenceNow = new Date(),
  allowPastForTest = false,
}) {
  if (!studio || studio.status !== STUDIO_STATUS.ACTIVE) {
    throw new DomainValidationError('Studio harus berstatus aktif untuk menerima booking.', 'studioId');
  }
  if (!service || service.active !== true) {
    throw new DomainValidationError('Layanan harus berstatus aktif untuk dipilih.', 'serviceId');
  }
  if (
    Array.isArray(service.applicableStudioIds) &&
    service.applicableStudioIds.length > 0 &&
    !service.applicableStudioIds.includes(studio.studioId)
  ) {
    throw new DomainValidationError(
      `Layanan "${service.name}" tidak berlaku pada "${studio.name}".`,
      'serviceId',
    );
  }
  if (!customer || customer.status !== 'active') {
    throw new DomainValidationError('Customer harus berstatus aktif.', 'customerId');
  }
  if (bookingPolicySetting?.requireCustomerPhone !== false && !customer.phone) {
    throw new DomainValidationError('Kebijakan bisnis mewajibkan nomor telepon customer.', 'customerId');
  }

  const slotPlan = computeBookingSlotPlan({
    studioId: studio.studioId,
    dateKey,
    startTime,
    durationMinutes,
    bufferMinutes: scheduleSetting?.bufferMinutes ?? 0,
    timezone: studio.timezone || 'Asia/Jakarta',
    operatingHours: studio.operatingHours,
    slotGranularityMinutes: studio.slotGranularityMinutes || scheduleSetting?.slotGranularityMinutes || 15,
  });

  if (!allowPastForTest) {
    assertBookingNotInPast(slotPlan.startAt, referenceNow);
  }

  const priceSnapshot = calculateServicePrice({
    service,
    durationMinutes: slotPlan.durationMinutes,
    discountMinor,
    taxPercent: pricingSetting?.taxPercent ?? 0,
  });

  const commissionSnapshot = calculateOperatorCommission({
    service,
    commissionSetting,
    grossAmountMinor: priceSnapshot.baseSubtotalMinor,
    netAmountMinor: priceSnapshot.totalMinor,
  });

  const policyDefault =
    bookingPolicySetting?.defaultInitialStatus || BOOKING_INITIAL_STATUS_POLICY.CONFIRMED;
  const initialStatus = requestedInitialStatus || policyDefault;
  if (!VALID_INITIAL_STATUSES.has(initialStatus)) {
    throw new DomainValidationError(`Status awal booking tidak valid: ${initialStatus}`, 'status');
  }

  const booking = validateBookingDoc({
    bookingId,
    businessId,
    studioId: studio.studioId,
    serviceId: service.serviceId,
    customerId: customer.customerId,
    operatorUid: optionalStringOrNull(operatorUid, 'operatorUid') || actorUid,
    dateKey: slotPlan.dateKey,
    timezone: slotPlan.timezone,
    startTime: slotPlan.startTime,
    endTime: slotPlan.endTime,
    durationMinutes: slotPlan.durationMinutes,
    bufferMinutes: slotPlan.bufferMinutes,
    startAt: slotPlan.startAt,
    endAt: slotPlan.endAt,
    slotIds: slotPlan.slotIds,
    status: initialStatus,
    sessionStatus: deriveSessionStatusFromBookingStatus(initialStatus),
    studioSnapshot: {
      studioId: studio.studioId,
      name: studio.name,
      code: studio.code,
      timezone: studio.timezone,
      operatingHours: studio.operatingHours,
      slotGranularityMinutes: studio.slotGranularityMinutes,
    },
    serviceSnapshot: {
      serviceId: service.serviceId,
      name: service.name,
      category: service.category,
      pricingModel: service.pricingModel,
      configVersion: service.configVersion || 1,
      basePriceMinor: service.basePriceMinor,
    },
    customerSnapshot: {
      customerId: customer.customerId,
      name: customer.name,
      phone: customer.phone,
      bandOrActName: customer.bandOrActName || null,
    },
    priceSnapshot: { ...priceSnapshot },
    commissionSnapshot: { ...commissionSnapshot },
    notes: optionalStringOrNull(notes, 'notes'),
    cancelReason: null,
    cancelledBy: null,
    cancelledAt: null,
    checkedInAt: null,
    completedAt: null,
    rescheduleCount: 0,
    schemaVersion: SCHEMA_VERSIONS.BOOKING,
    createdBy: actorUid,
    updatedBy: actorUid,
  });

  return { booking, slotPlan };
}

/**
 * Validates and normalizes `businesses/{businessId}/bookings/{bookingId}`.
 * @param {Record<string, unknown>} raw
 */
export function validateBookingDoc(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen booking tidak valid.');
  }

  const status = requireNonEmptyString(raw.status, 'status');
  if (!VALID_BOOKING_STATUSES.has(status)) {
    throw new DomainValidationError(`Status booking tidak dikenal: ${status}`, 'status');
  }

  const sessionStatus = raw.sessionStatus || deriveSessionStatusFromBookingStatus(status);
  if (!VALID_SESSION_STATUSES.has(sessionStatus)) {
    throw new DomainValidationError(`Status sesi tidak dikenal: ${sessionStatus}`, 'sessionStatus');
  }

  const dateKey = requireNonEmptyString(raw.dateKey, 'dateKey');
  if (!isValidDateKey(dateKey)) {
    throw new DomainValidationError(`dateKey booking tidak valid: ${dateKey}`, 'dateKey');
  }

  const startTime = requireNonEmptyString(raw.startTime, 'startTime');
  const endTime = requireNonEmptyString(raw.endTime, 'endTime');
  parseTimeToMinutes(startTime, 'startTime');
  parseTimeToMinutes(endTime, 'endTime');

  const durationMinutes = requireSafeInt(raw.durationMinutes, 'durationMinutes', {
    min: 15,
    max: 1440,
  });

  const bufferMinutes = requireSafeInt(raw.bufferMinutes ?? 0, 'bufferMinutes', {
    min: 0,
    max: 120,
  });

  if (!Array.isArray(raw.slotIds) || raw.slotIds.length === 0 || raw.slotIds.length > 96) {
    throw new DomainValidationError('Booking wajib memiliki 1–96 slotIds.', 'slotIds');
  }

  const normalizedNotes = optionalStringOrNull(raw.notes, 'notes');
  if (normalizedNotes && normalizedNotes.length > 500) {
    throw new DomainValidationError('Catatan booking maksimal 500 karakter.', 'notes');
  }

  const cancelReason = optionalStringOrNull(raw.cancelReason, 'cancelReason');
  if (cancelReason && cancelReason.length > 300) {
    throw new DomainValidationError('Alasan pembatalan maksimal 300 karakter.', 'cancelReason');
  }

  const priceSnapshot = raw.priceSnapshot;
  if (
    !priceSnapshot ||
    typeof priceSnapshot !== 'object' ||
    !Number.isSafeInteger(priceSnapshot.totalMinor) ||
    priceSnapshot.totalMinor < 0
  ) {
    throw new DomainValidationError('priceSnapshot wajib berisi totalMinor integer IDR >= 0.', 'priceSnapshot');
  }

  const commissionSnapshot = raw.commissionSnapshot;
  if (
    !commissionSnapshot ||
    typeof commissionSnapshot !== 'object' ||
    !Number.isSafeInteger(commissionSnapshot.amountMinor) ||
    commissionSnapshot.amountMinor < 0
  ) {
    throw new DomainValidationError(
      'commissionSnapshot wajib berisi amountMinor integer IDR >= 0.',
      'commissionSnapshot',
    );
  }

  return {
    bookingId: requireNonEmptyString(raw.bookingId, 'bookingId'),
    businessId: requireNonEmptyString(raw.businessId, 'businessId'),
    studioId: requireNonEmptyString(raw.studioId, 'studioId'),
    serviceId: requireNonEmptyString(raw.serviceId, 'serviceId'),
    customerId: requireNonEmptyString(raw.customerId, 'customerId'),
    operatorUid: optionalStringOrNull(raw.operatorUid, 'operatorUid'),
    dateKey,
    timezone: requireNonEmptyString(raw.timezone || 'Asia/Jakarta', 'timezone'),
    startTime,
    endTime,
    durationMinutes,
    bufferMinutes,
    startAt: raw.startAt,
    endAt: raw.endAt,
    slotIds: Array.from(new Set(raw.slotIds.map((id) => requireNonEmptyString(id, 'slotIds')))),
    status,
    studioSnapshot: raw.studioSnapshot,
    serviceSnapshot: raw.serviceSnapshot,
    customerSnapshot: raw.customerSnapshot,
    priceSnapshot,
    commissionSnapshot,
    notes: normalizedNotes,
    cancelReason,
    cancelledBy: optionalStringOrNull(raw.cancelledBy, 'cancelledBy'),
    cancelledAt: raw.cancelledAt ?? null,
    sessionStatus,
    checkedInAt: raw.checkedInAt ?? null,
    checkedInByUid: optionalStringOrNull(raw.checkedInByUid, 'checkedInByUid'),
    checkedInByName: optionalStringOrNull(raw.checkedInByName, 'checkedInByName'),
    actualStartAt: raw.actualStartAt ?? null,
    actualStartByUid: optionalStringOrNull(raw.actualStartByUid, 'actualStartByUid'),
    actualStartByName: optionalStringOrNull(raw.actualStartByName, 'actualStartByName'),
    actualEndAt: raw.actualEndAt ?? null,
    actualEndByUid: optionalStringOrNull(raw.actualEndByUid, 'actualEndByUid'),
    actualEndByName: optionalStringOrNull(raw.actualEndByName, 'actualEndByName'),
    actualDurationMinutes: raw.actualDurationMinutes == null ? null : requireSafeInt(raw.actualDurationMinutes, 'actualDurationMinutes', { min: 0, max: 10080 }),
    noShowAt: raw.noShowAt ?? null,
    noShowByUid: optionalStringOrNull(raw.noShowByUid, 'noShowByUid'),
    noShowByName: optionalStringOrNull(raw.noShowByName, 'noShowByName'),
    noShowReason: optionalStringOrNull(raw.noShowReason, 'noShowReason'),
    lastSessionEventId: optionalStringOrNull(raw.lastSessionEventId, 'lastSessionEventId'),
    lastSessionEventAt: raw.lastSessionEventAt ?? null,
    lastSessionEventType: optionalStringOrNull(raw.lastSessionEventType, 'lastSessionEventType'),
    completedAt: raw.completedAt ?? null,
    settlement: raw.settlement ?? null,
    rescheduleCount: requireSafeInt(raw.rescheduleCount ?? 0, 'rescheduleCount', { min: 0 }),
    schemaVersion: requireSafeInt(raw.schemaVersion ?? SCHEMA_VERSIONS.BOOKING, 'schemaVersion', { min: 1 }),
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    createdBy: requireNonEmptyString(raw.createdBy, 'createdBy'),
    updatedBy: requireNonEmptyString(raw.updatedBy, 'updatedBy'),
  };
}

/**
 * Validates and normalizes `businesses/{businessId}/bookingSlots/{slotId}`.
 * @param {Record<string, unknown>} raw
 */
export function validateBookingSlotDoc(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen booking slot tidak valid.');
  }

  const studioId = requireNonEmptyString(raw.studioId, 'studioId');
  const dateKey = requireNonEmptyString(raw.dateKey, 'dateKey');
  const bucketIndex = requireSafeInt(raw.bucketIndex, 'bucketIndex', { min: 0, max: 95 });
  const expectedId = formatSlotId(studioId, dateKey, bucketIndex);
  const slotId = requireNonEmptyString(raw.slotId, 'slotId');
  if (slotId !== expectedId) {
    throw new DomainValidationError(`slotId "${slotId}" tidak cocok dengan format deterministik "${expectedId}".`, 'slotId');
  }

  const status = requireNonEmptyString(raw.status, 'status');
  if (!VALID_SLOT_STATUSES.has(status)) {
    throw new DomainValidationError(`Status slot tidak valid: ${status}`, 'status');
  }

  const kind = requireNonEmptyString(raw.kind || BOOKING_SLOT_KIND.SESSION, 'kind');
  if (!VALID_SLOT_KINDS.has(kind)) {
    throw new DomainValidationError(`Jenis slot tidak valid: ${kind}`, 'kind');
  }

  const bookingId = optionalStringOrNull(raw.bookingId, 'bookingId');
  if (status === BOOKING_SLOT_STATUS.ACTIVE && !bookingId) {
    throw new DomainValidationError('Slot berstatus active wajib terhubung ke bookingId.', 'bookingId');
  }
  if (status === BOOKING_SLOT_STATUS.RELEASED && bookingId !== null) {
    throw new DomainValidationError('Slot berstatus released harus memiliki bookingId = null.', 'bookingId');
  }

  return {
    slotId,
    businessId: requireNonEmptyString(raw.businessId, 'businessId'),
    studioId,
    dateKey,
    bucketIndex,
    slotTime: requireNonEmptyString(raw.slotTime, 'slotTime'),
    kind,
    status,
    bookingId,
    slotStartAt: raw.slotStartAt,
    slotEndAt: raw.slotEndAt,
    reservedBy: requireNonEmptyString(raw.reservedBy, 'reservedBy'),
    reservedAt: raw.reservedAt ?? null,
    releasedAt: raw.releasedAt ?? null,
    schemaVersion: requireSafeInt(raw.schemaVersion ?? SCHEMA_VERSIONS.BOOKING_SLOT, 'schemaVersion', { min: 1 }),
    updatedAt: raw.updatedAt ?? null,
    updatedBy: requireNonEmptyString(raw.updatedBy, 'updatedBy'),
  };
}

/**
 * Validates and normalizes append-only `businesses/{businessId}/activityLogs/{eventId}`.
 * @param {Record<string, unknown>} raw
 */
export function validateActivityLogDoc(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DomainValidationError('Dokumen activity log tidak valid.');
  }
  const eventType = requireNonEmptyString(raw.eventType, 'eventType');
  if (!VALID_EVENT_TYPES.has(eventType)) {
    throw new DomainValidationError(`eventType tidak valid: ${eventType}`, 'eventType');
  }
  const actorRole = requireNonEmptyString(raw.actorRole, 'actorRole');
  if (![ROLES.OWNER, ROLES.OPERATOR].includes(actorRole)) {
    throw new DomainValidationError(`actorRole tidak valid: ${actorRole}`, 'actorRole');
  }
  const entityType = raw.entityType || ACTIVITY_ENTITY_TYPE.BOOKING;
  if (!VALID_ENTITY_TYPES.has(entityType)) {
    throw new DomainValidationError(`entityType tidak valid: ${entityType}`, 'entityType');
  }
  const summary = requireNonEmptyString(raw.summary, 'summary').slice(0, 300);

  return {
    eventId: requireNonEmptyString(raw.eventId, 'eventId'),
    businessId: requireNonEmptyString(raw.businessId, 'businessId'),
    studioId: requireNonEmptyString(raw.studioId, 'studioId'),
    eventType,
    entityType,
    entityId: requireNonEmptyString(raw.entityId, 'entityId'),
    operationId: requireNonEmptyString(raw.operationId, 'operationId'),
    actorUid: requireNonEmptyString(raw.actorUid, 'actorUid'),
    actorRole,
    beforeStatus: optionalStringOrNull(raw.beforeStatus, 'beforeStatus'),
    afterStatus: requireNonEmptyString(raw.afterStatus, 'afterStatus'),
    reason: optionalStringOrNull(raw.reason, 'reason'),
    summary,
    schemaVersion: requireSafeInt(raw.schemaVersion ?? SCHEMA_VERSIONS.ACTIVITY_LOG, 'schemaVersion', { min: 1 }),
    createdAt: raw.createdAt ?? null,
  };
}
