import { describe, expect, it, vi } from 'vitest';
import { SubscriptionRegistry } from '../../src/data/subscriptions/subscriptionRegistry.js';
import { ERROR_CATEGORY, mapFirebaseError } from '../../src/data/firebase/errorMapper.js';
import { DomainValidationError } from '../../src/domain/validators/schemaValidators.js';

vi.mock('../../src/data/repositories/authRepository.js', () => ({
  signInWithEmail: vi.fn(),
  registerAuthAccount: vi.fn(),
  signOutAuth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/data/repositories/membershipRepository.js', () => ({
  ensureUserProfile: vi.fn(),
  bootstrapInitialBusiness: vi.fn(),
}));

import { signOutUseCase } from '../../src/application/use-cases/sessionUseCases.js';
import { signOutAuth } from '../../src/data/repositories/authRepository.js';

describe('Subscription Registry, Logout Teardown & Error Mapping', () => {
  it('replaces duplicate listener keys cleanly and tears down all listeners on logout', async () => {
    const registry = new SubscriptionRegistry();
    const unsub1Old = vi.fn();
    const unsub1New = vi.fn();
    const unsub2 = vi.fn();
    const resetSpy = vi.fn();

    registry.register('session:member', unsub1Old);
    registry.register('session:member', unsub1New);
    registry.register('session:business', unsub2);

    expect(unsub1Old).toHaveBeenCalledTimes(1);
    expect(registry.getActiveCount()).toBe(2);

    await signOutUseCase({ registry, onResetState: resetSpy });

    expect(unsub1New).toHaveBeenCalledTimes(1);
    expect(unsub2).toHaveBeenCalledTimes(1);
    expect(registry.getActiveCount()).toBe(0);
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(signOutAuth).toHaveBeenCalledTimes(1);
  });

  it('centralizes error mapping for Firebase and Domain errors', () => {
    expect(mapFirebaseError({ code: 'permission-denied' }).category).toBe(
      ERROR_CATEGORY.PERMISSION_DENIED,
    );
    expect(mapFirebaseError({ code: 'unavailable' }).category).toBe(ERROR_CATEGORY.UNAVAILABLE);
    expect(mapFirebaseError({ code: 'aborted' }).category).toBe(ERROR_CATEGORY.CONFLICT);
    expect(mapFirebaseError({ code: 'resource-exhausted' }).category).toBe(
      ERROR_CATEGORY.QUOTA_EXHAUSTED,
    );
    expect(mapFirebaseError({ code: 'not-found' }).category).toBe(ERROR_CATEGORY.NOT_FOUND);
    expect(mapFirebaseError({ code: 'auth/invalid-credential' }).category).toBe(
      ERROR_CATEGORY.UNAUTHENTICATED,
    );
    expect(mapFirebaseError(new DomainValidationError('bad payload')).category).toBe(
      ERROR_CATEGORY.VALIDATION,
    );
  });
});
