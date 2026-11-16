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
});

export const ACTIVITY_ENTITY_TYPE = Object.freeze({
  BOOKING: 'booking',
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
