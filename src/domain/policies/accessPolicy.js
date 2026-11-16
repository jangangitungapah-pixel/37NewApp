import { MEMBER_STATUS, ROLES } from '../enums/roles.js';

/**
 * Checks whether a member document represents an active membership.
 * @param {{ status?: string } | null | undefined} member
 * @returns {boolean}
 */
export function isActiveMember(member) {
  return Boolean(member && member.status === MEMBER_STATUS.ACTIVE);
}

/**
 * Checks whether a member is an active Owner.
 * @param {{ role?: string, status?: string } | null | undefined} member
 * @returns {boolean}
 */
export function isOwnerMember(member) {
  return isActiveMember(member) && member.role === ROLES.OWNER;
}

/**
 * Checks whether a member is an active Operator.
 * @param {{ role?: string, status?: string } | null | undefined} member
 * @returns {boolean}
 */
export function isOperatorMember(member) {
  return isActiveMember(member) && member.role === ROLES.OPERATOR;
}

/**
 * Resolves the home portal path for an active member.
 * Returns null if the user has no active membership.
 * @param {{ role?: string, status?: string } | null | undefined} member
 * @returns {string | null}
 */
export function resolveDefaultPortalPath(member) {
  if (!isActiveMember(member)) {
    return null;
  }
  if (member.role === ROLES.OWNER) {
    return '/owner';
  }
  if (member.role === ROLES.OPERATOR) {
    return '/operator';
  }
  return null;
}

/**
 * Evaluates portal route authorization in UX guards.
 * Security enforcement remains governed by Firestore Security Rules.
 *
 * @param {{ role?: string, status?: string } | null | undefined} member
 * @param {'owner' | 'operator'} requiredRole
 * @returns {boolean}
 */
export function canAccessPortal(member, requiredRole) {
  if (!isActiveMember(member)) {
    return false;
  }
  return member.role === requiredRole;
}

/**
 * Evaluates whether a member can access a given studioId.
 * Owners can access all studios within their business; Operators only assigned studios.
 *
 * @param {{ role?: string, status?: string, assignedStudioIds?: string[] } | null | undefined} member
 * @param {string} studioId
 * @returns {boolean}
 */
export function canAccessStudio(member, studioId) {
  if (!isActiveMember(member) || !studioId) {
    return false;
  }
  if (member.role === ROLES.OWNER) {
    return true;
  }
  return Array.isArray(member.assignedStudioIds) && member.assignedStudioIds.includes(studioId);
}

/**
 * Evaluates a fine-grained boolean permission on an active member.
 * Owners always retain owner capabilities.
 *
 * @param {{ role?: string, status?: string, permissions?: Record<string, boolean> } | null | undefined} member
 * @param {string} permissionKey
 * @returns {boolean}
 */
export function hasMemberPermission(member, permissionKey) {
  if (!isActiveMember(member)) {
    return false;
  }
  if (member.role === ROLES.OWNER) {
    return true;
  }
  return Boolean(member.permissions && member.permissions[permissionKey] === true);
}

/**
 * Evaluates whether a member can manage studio/service/settings/team master data.
 * Restricted strictly to active Owners by default policy.
 *
 * @param {{ role?: string, status?: string } | null | undefined} member
 * @returns {boolean}
 */
export function canManageMasterData(member) {
  return isOwnerMember(member);
}

/**
 * Evaluates whether a member can create/update active customer operational profiles.
 * @param {{ role?: string, status?: string, permissions?: Record<string, boolean> } | null | undefined} member
 * @returns {boolean}
 */
export function canManageCustomers(member) {
  return isOwnerMember(member) || hasMemberPermission(member, 'canManageCustomers');
}

/**
 * Evaluates whether a member can archive customers (historical preservation requires Owner).
 * @param {{ role?: string, status?: string } | null | undefined} member
 * @returns {boolean}
 */
export function canArchiveCustomers(member) {
  return isOwnerMember(member);
}

/**
 * Filters a list of studios according to the member's role and assignedStudioIds.
 * @template {{ studioId?: string }} T
 * @param {{ role?: string, status?: string, assignedStudioIds?: string[] } | null | undefined} member
 * @param {T[]} studios
 * @returns {T[]}
 */
export function filterAccessibleStudios(member, studios) {
  if (!Array.isArray(studios) || !isActiveMember(member)) {
    return [];
  }
  if (member.role === ROLES.OWNER) {
    return studios;
  }
  return studios.filter((studio) => canAccessStudio(member, studio?.studioId || ''));
}

/**
 * Evaluates whether a member can manage bookings operationally.
 * @param {{ role?: string, status?: string, permissions?: Record<string, boolean> } | null | undefined} member
 * @returns {boolean}
 */
export function canManageBookings(member) {
  return isOwnerMember(member) || hasMemberPermission(member, 'canManageBookings');
}

/**
 * Evaluates whether a member can read/create/mutate bookings in a given studio.
 * @param {{ role?: string, status?: string, assignedStudioIds?: string[], permissions?: Record<string, boolean> } | null | undefined} member
 * @param {string} studioId
 * @returns {boolean}
 */
export function canOperateStudioBooking(member, studioId) {
  return canManageBookings(member) && canAccessStudio(member, studioId);
}

/**
 * Evaluates whether a member may enter a booking discount under business pricing policy.
 * @param {{ role?: string, status?: string, permissions?: Record<string, boolean> } | null | undefined} member
 * @param {{ allowOperatorDiscount?: boolean } | null | undefined} pricingSetting
 * @returns {boolean}
 */
export function canApplyBookingDiscount(member, pricingSetting) {
  if (isOwnerMember(member)) {
    return true;
  }
  return (
    isActiveMember(member) &&
    Boolean(pricingSetting?.allowOperatorDiscount) &&
    hasMemberPermission(member, 'canApplyDiscount')
  );
}
