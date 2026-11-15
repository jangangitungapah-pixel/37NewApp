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

export const SCHEMA_VERSIONS = Object.freeze({
  USER_PROFILE: 1,
  BUSINESS: 1,
  MEMBER: 1,
  BUSINESS_PROFILE: 1,
  SETTINGS: 1,
  STUDIO: 1,
  SERVICE: 1,
  CUSTOMER: 1,
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
