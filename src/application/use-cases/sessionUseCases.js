import {
  registerAuthAccount,
  signInWithEmail,
  signOutAuth,
} from '../../data/repositories/authRepository.js';
import {
  bootstrapInitialBusiness,
  ensureUserProfile,
} from '../../data/repositories/membershipRepository.js';
import { subscriptionRegistry } from '../../data/subscriptions/subscriptionRegistry.js';
import { AppError, ERROR_CATEGORY } from '../../data/firebase/errorMapper.js';

/**
 * Signs in with email and password. Membership and portal access are then
 * resolved reactively via Firestore in AuthSessionProvider.
 *
 * @param {{ email: string, password: string }} command
 */
export async function signInUseCase({ email, password }) {
  if (!email || !email.trim()) {
    throw new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'validation/email-required',
      message: 'Email wajib diisi.',
    });
  }
  if (!password || password.length < 6) {
    throw new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'validation/password-length',
      message: 'Kata sandi minimal 6 karakter.',
    });
  }
  return signInWithEmail({ email, password });
}

/**
 * Registers a brand-new Owner account and links it to a newly created studio business.
 *
 * @param {{ email: string, password: string, displayName: string, businessName: string }} command
 */
export async function registerOwnerWorkspaceUseCase({
  email,
  password,
  displayName,
  businessName,
}) {
  if (!displayName?.trim()) {
    throw new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'validation/display-name-required',
      message: 'Nama lengkap wajib diisi.',
    });
  }
  if (!businessName?.trim() || businessName.trim().length < 2) {
    throw new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'validation/business-name-required',
      message: 'Nama studio/bisnis minimal 2 karakter.',
    });
  }
  const user = await registerAuthAccount({ email, password, displayName });
  await ensureUserProfile(user);
  return bootstrapInitialBusiness({
    uid: user.uid,
    email: user.email || email,
    displayName: displayName.trim(),
    businessName: businessName.trim(),
  });
}

/**
 * Creates the initial business workspace for an already signed-in user who has no membership yet.
 *
 * @param {{ user: import('firebase/auth').User, businessName: string }} command
 */
export async function createInitialBusinessUseCase({ user, businessName }) {
  if (!user?.uid) {
    throw new AppError({
      category: ERROR_CATEGORY.UNAUTHENTICATED,
      code: 'auth/required',
      message: 'Silakan login terlebih dahulu.',
    });
  }
  if (!businessName?.trim() || businessName.trim().length < 2) {
    throw new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'validation/business-name-required',
      message: 'Nama bisnis minimal 2 karakter.',
    });
  }
  await ensureUserProfile(user);
  return bootstrapInitialBusiness({
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email || 'Studio Owner',
    businessName: businessName.trim(),
  });
}

/**
 * Signs out the active user and guarantees every active Firestore listener
 * in SubscriptionRegistry is unsubscribed.
 *
 * @param {{ registry?: typeof subscriptionRegistry, onResetState?: () => void }} [options]
 */
export async function signOutUseCase(options = {}) {
  const registry = options.registry || subscriptionRegistry;
  registry.unsubscribeAll();
  if (typeof options.onResetState === 'function') {
    options.onResetState();
  }
  await signOutAuth();
}
