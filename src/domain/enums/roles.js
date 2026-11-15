/**
 * Documented role, membership, and business status enums for 37MusicStudio.
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

export const SCHEMA_VERSIONS = Object.freeze({
  USER_PROFILE: 1,
  BUSINESS: 1,
  MEMBER: 1,
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
