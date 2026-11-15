import { describe, expect, it } from 'vitest';
import {
  DomainValidationError,
  validateBusiness,
  validateMember,
  validateUserProfile,
} from '../../src/domain/validators/schemaValidators.js';
import {
  canAccessPortal,
  canAccessStudio,
  hasMemberPermission,
  isActiveMember,
  resolveDefaultPortalPath,
} from '../../src/domain/policies/accessPolicy.js';
import { MEMBER_STATUS, ROLES } from '../../src/domain/enums/roles.js';

describe('Schema Validators & Domain Access Policy', () => {
  it('rejects permission fields inside global user profile docs', () => {
    expect(() =>
      validateUserProfile({
        uid: 'u-1',
        email: 'user@example.com',
        displayName: 'User',
        role: 'owner',
        schemaVersion: 1,
      }),
    ).toThrow(DomainValidationError);
  });

  it('rejects malformed member docs with unknown role or non-array assignedStudioIds', () => {
    expect(() =>
      validateMember({
        uid: 'u-2',
        businessId: 'biz-1',
        displayName: 'Bad Role',
        role: 'superadmin',
        status: 'active',
        assignedStudioIds: [],
        schemaVersion: 1,
        createdBy: 'u-1',
        updatedBy: 'u-1',
      }),
    ).toThrow(DomainValidationError);

    expect(() =>
      validateMember({
        uid: 'u-2',
        businessId: 'biz-1',
        displayName: 'Bad Studios',
        role: 'operator',
        status: 'active',
        assignedStudioIds: 'studio-1',
        schemaVersion: 1,
        createdBy: 'u-1',
        updatedBy: 'u-1',
      }),
    ).toThrow(DomainValidationError);
  });

  it('validates business and resolves portal paths & studio scope by role', () => {
    const biz = validateBusiness({
      businessId: 'biz-37',
      name: '37 Music Studio',
      ownerUid: 'owner-1',
      timezone: 'Asia/Jakarta',
      currency: 'IDR',
      status: 'active',
      schemaVersion: 1,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
    });
    expect(biz.currency).toBe('IDR');

    const owner = validateMember({
      uid: 'owner-1',
      businessId: 'biz-37',
      displayName: 'Owner',
      role: ROLES.OWNER,
      status: MEMBER_STATUS.ACTIVE,
      assignedStudioIds: [],
      schemaVersion: 1,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
    });

    const operator = validateMember({
      uid: 'op-1',
      businessId: 'biz-37',
      displayName: 'Operator A',
      role: ROLES.OPERATOR,
      status: MEMBER_STATUS.ACTIVE,
      assignedStudioIds: ['room-a'],
      permissions: { canManageGallery: true },
      schemaVersion: 1,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
    });

    expect(resolveDefaultPortalPath(owner)).toBe('/owner');
    expect(resolveDefaultPortalPath(operator)).toBe('/operator');
    expect(canAccessPortal(owner, ROLES.OWNER)).toBe(true);
    expect(canAccessPortal(operator, ROLES.OWNER)).toBe(false);
    expect(canAccessStudio(owner, 'room-z')).toBe(true);
    expect(canAccessStudio(operator, 'room-a')).toBe(true);
    expect(canAccessStudio(operator, 'room-b')).toBe(false);
    expect(hasMemberPermission(operator, 'canManageGallery')).toBe(true);
    expect(hasMemberPermission(operator, 'canSettleBookings')).toBe(false);

    const suspended = { ...operator, status: MEMBER_STATUS.SUSPENDED };
    expect(isActiveMember(suspended)).toBe(false);
    expect(resolveDefaultPortalPath(suspended)).toBeNull();
    expect(canAccessPortal(suspended, ROLES.OPERATOR)).toBe(false);
    expect(canAccessStudio(suspended, 'room-a')).toBe(false);
  });
});
