/**
 * Documented role, membership, business, and master-data enums for 37MusicStudio.
 * Never invent ad-hoc status strings outside these constants.
 */

export const ROLES = Object.freeze({
  OWNER: 'owner',
  OPERATOR: 'operator',
});

export const MEMBER_STATUS = Object.freeze({
  ACTIVE: 'active',
  INVITED: 'invited',
  SUSPENDED: 'suspended',
  REVOKED: 'revoked',
});

export const BUSINESS_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

export const STUDIO_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

export const SERVICE_CATEGORY = Object.freeze({
  REHEARSAL: 'rehearsal',
  RECORDING: 'recording',
  MIXING: 'mixing',
  MASTERING: 'mastering',
});

export const PRICING_MODEL = Object.freeze({
  HOURLY: 'hourly',
  PACKAGE: 'package',
  FIXED_SESSION: 'fixed_session',
});

export const COMMISSION_METHOD = Object.freeze({
  INHERIT: 'inherit',
  NONE: 'none',
  PERCENTAGE: 'percentage',
  FIXED_PER_BOOKING: 'fixed_per_booking',
});

export const COMMISSION_BASIS = Object.freeze({
  SUBTOTAL: 'subtotal',
  SETTLED_AMOUNT: 'settled_amount',
});

export const CUSTOMER_STATUS = Object.freeze({
  ACTIVE: 'active',
  ARCHIVED: 'archived',
});

export const SETTING_IDS = Object.freeze({
  BUSINESS: 'business',
  SCHEDULE: 'schedule',
  PRICING: 'pricing',
  COMMISSION: 'commission',
  BOOKING_POLICY: 'bookingPolicy',
});

export const BOOKING_INITIAL_STATUS_POLICY = Object.freeze({
  CONFIRMED: 'CONFIRMED',
  PENDING_CONFIRMATION: 'PENDING_CONFIRMATION',
});

export const SLOT_GRANULARITY_OPTIONS = Object.freeze([15, 30, 60]);

export const BASE_SLOT_BUCKET_MINUTES = 15;

export const BOOKING_STATUS = Object.freeze({
  PENDING_CONFIRMATION: 'PENDING_CONFIRMATION',
  CONFIRMED: 'CONFIRMED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED_PENDING_SETTLEMENT: 'COMPLETED_PENDING_SETTLEMENT',
  SETTLEMENT_REVIEW: 'SETTLEMENT_REVIEW',
  SETTLED: 'SETTLED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
  REJECTED: 'REJECTED',
});

export const SESSION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  UPCOMING: 'UPCOMING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  NO_SHOW: 'NO_SHOW',
  CANCELLED: 'CANCELLED',
});

export const SESSION_ACTION = Object.freeze({
  CHECK_IN: 'check_in',
  START: 'start',
  COMPLETE: 'complete',
  NO_SHOW: 'no_show',
  CANCEL: 'cancel',
  REJECT: 'reject',
});

export const BOOKING_SESSION_EVENT_TYPE = Object.freeze({
  CHECK_IN: 'check_in',
  START: 'start',
  COMPLETE: 'complete',
  NO_SHOW: 'no_show',
  CANCEL: 'cancel',
  REJECT: 'reject',
});

export const BOOKING_OPERATION_TYPE = Object.freeze({
  CREATE: 'booking.create',
  DECISION: 'booking.decision',
  RESCHEDULE: 'booking.reschedule',
  SESSION: 'booking.session',
});

export const BLOCKING_BOOKING_STATUSES = Object.freeze([
  BOOKING_STATUS.PENDING_CONFIRMATION,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.IN_PROGRESS,
  BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT,
  BOOKING_STATUS.SETTLEMENT_REVIEW,
  BOOKING_STATUS.SETTLED,
]);

export const BOOKING_SLOT_STATUS = Object.freeze({
  ACTIVE: 'active',
  RELEASED: 'released',
});

export const BOOKING_SLOT_KIND = Object.freeze({
  SESSION: 'session',
  BUFFER: 'buffer',
});

export const ACTIVITY_EVENT_TYPE = Object.freeze({
  BOOKING_CREATED: 'booking.created',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_STARTED: 'booking.started',
  BOOKING_COMPLETED: 'booking.completed',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_NO_SHOW: 'booking.no_show',
  BOOKING_RESCHEDULED: 'booking.rescheduled',
  BOOKING_SETTLED: 'booking.settled',
  BOOKING_SETTLEMENT_REVIEW: 'booking.settlement_review',
  LEDGER_ADJUSTED: 'ledger.adjusted',
  COMMISSION_ADJUSTED: 'commission.adjusted',
});

export const ACTIVITY_ENTITY_TYPE = Object.freeze({
  BOOKING: 'booking',
  LEDGER_ENTRY: 'ledger_entry',
  COMMISSION_ENTRY: 'commission_entry',
});

export const PAYMENT_METHOD = Object.freeze({
  CASH: 'cash',
  TRANSFER: 'transfer',
  QRIS: 'qris',
  CARD: 'card',
  OTHER: 'other',
});

export const LEDGER_ENTRY_TYPE = Object.freeze({
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  REFUND: 'REFUND',
  ADJUSTMENT: 'ADJUSTMENT',
  REVERSAL: 'REVERSAL',
});

export const LEDGER_DIRECTION = Object.freeze({
  INFLOW: 'inflow',
  OUTFLOW: 'outflow',
});

export const COMMISSION_ENTRY_TYPE = Object.freeze({
  EARNED: 'EARNED',
  ADJUSTMENT: 'ADJUSTMENT',
  REVERSAL: 'REVERSAL',
});

export const COMMISSION_DIRECTION = Object.freeze({
  CREDIT: 'credit',
  DEBIT: 'debit',
});

export const COMMISSION_ENTRY_STATUS = Object.freeze({
  RECORDED: 'RECORDED',
  ADJUSTED: 'ADJUSTED',
  REVERSED: 'REVERSED',
});

export const NOTIFICATION_TYPE = Object.freeze({
  BOOKING_CREATED: 'BOOKING_CREATED',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_STARTED: 'BOOKING_STARTED',
  BOOKING_COMPLETED: 'BOOKING_COMPLETED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_RESCHEDULED: 'BOOKING_RESCHEDULED',
  BOOKING_SETTLED: 'BOOKING_SETTLED',
  SETTLEMENT_REVIEW_REQUIRED: 'SETTLEMENT_REVIEW_REQUIRED',
  TEAM_ASSIGNMENT_UPDATED: 'TEAM_ASSIGNMENT_UPDATED',
});

export const NOTIFICATION_CHANNEL = Object.freeze({
  IN_APP: 'in_app',
});

export const GALLERY_ASSET_STATUS = Object.freeze({
  ACTIVE: 'active',
  ARCHIVED: 'archived',
});

export const GALLERY_IMAGE_FORMATS = Object.freeze({
  JPG: 'jpg',
  JPEG: 'jpeg',
  PNG: 'png',
  WEBP: 'webp',
});

export const SCHEMA_VERSIONS = Object.freeze({
  USER_PROFILE: 1,
  BUSINESS: 1,
  MEMBER: 1,
  BUSINESS_PROFILE: 1,
  SETTINGS: 1,
  STUDIO: 1,
  SERVICE: 1,
  CUSTOMER: 1,
  BOOKING: 1,
  BOOKING_SLOT: 1,
  ACTIVITY_LOG: 1,
  LEDGER_ENTRY: 1,
  COMMISSION_ENTRY: 1,
  NOTIFICATION: 1,
  GALLERY_ASSET: 1,
  BOOKING_SESSION_EVENT: 1,
  BOOKING_OPERATION: 1,
});

export const OPERATOR_DEFAULT_PERMISSIONS = Object.freeze({
  canManageBookings: true,
  canManageCustomers: true,
  canManageGallery: false,
  canApplyDiscount: false,
  canSettleBookings: false,
  canManagePricing: false,
  canManageTeam: false,
  canManageSettings: false,
});

export const OWNER_DEFAULT_PERMISSIONS = Object.freeze({
  canManageBookings: true,
  canManageCustomers: true,
  canManageGallery: true,
  canApplyDiscount: true,
  canSettleBookings: true,
  canManagePricing: true,
  canManageTeam: true,
  canManageSettings: true,
});
