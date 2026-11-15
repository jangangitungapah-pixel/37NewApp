import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { getFirebaseServices } from '../firebase/firebaseClient.js';
import { mapFirebaseError } from '../firebase/errorMapper.js';

/**
 * Signs in an existing user using email and password.
 * @param {{ email: string, password: string }} params
 */
export async function signInWithEmail({ email, password }) {
  try {
    const { auth } = getFirebaseServices();
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    return credential.user;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/**
 * Registers a new Firebase Auth account for initial owner onboarding.
 * Business access still requires explicit Firestore membership creation.
 * @param {{ email: string, password: string, displayName: string }} params
 */
export async function registerAuthAccount({ email, password, displayName }) {
  try {
    const { auth } = getFirebaseServices();
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (displayName?.trim()) {
      await updateProfile(credential.user, { displayName: displayName.trim() });
    }
    return credential.user;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/**
 * Ends the Firebase Auth session.
 */
export async function signOutAuth() {
  try {
    const { auth } = getFirebaseServices();
    await signOut(auth);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/**
 * Subscribes to Firebase Auth state changes.
 * @param {(user: import('firebase/auth').User | null) => void} onChange
 * @returns {() => void}
 */
export function subscribeAuthState(onChange) {
  const { auth } = getFirebaseServices();
  return onAuthStateChanged(auth, onChange);
}
