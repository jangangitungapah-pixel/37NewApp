import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAppConfig, validateFirebaseEnv } from '../../infrastructure/config/env.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { AppError, ERROR_CATEGORY } from './errorMapper.js';

let cachedServices = null;
let emulatorConnected = false;

/**
 * Lazily initializes and returns singleton Firebase App, Auth, and Firestore instances.
 * Targets the configured named database (defaulting to "default" for musicstudio37app).
 */
export function getFirebaseServices() {
  if (cachedServices) {
    return cachedServices;
  }

  const envCheck = validateFirebaseEnv();
  if (!envCheck.valid) {
    throw new AppError({
      category: ERROR_CATEGORY.CONFIG,
      code: 'config/missing-firebase-env',
      message: `Konfigurasi Firebase environment belum lengkap: ${envCheck.missingKeys.join(', ')}`,
      retryable: false,
    });
  }

  const config = getAppConfig();
  const firebaseConfig = {
    apiKey: config.firebase.apiKey,
    authDomain: config.firebase.authDomain,
    projectId: config.firebase.projectId,
    messagingSenderId: config.firebase.messagingSenderId,
    appId: config.firebase.appId,
    ...(config.firebase.measurementId ? { measurementId: config.firebase.measurementId } : {}),
  };

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);

  // Use persistent browser session when running in browser contexts
  if (typeof window !== 'undefined') {
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      logger.warn('firebaseClient', 'Fallback persistence digunakan', { code: err?.code });
    });
  }

  const databaseId = config.firebase.databaseId;
  let db;
  try {
    db =
      databaseId && databaseId !== '(default)'
        ? initializeFirestore(app, {}, databaseId)
        : initializeFirestore(app, {});
  } catch {
    db =
      databaseId && databaseId !== '(default)'
        ? getFirestore(app, databaseId)
        : getFirestore(app);
  }

  if (config.emulators.enabled && !emulatorConnected) {
    connectAuthEmulator(auth, config.emulators.authUrl, { disableWarnings: true });
    connectFirestoreEmulator(db, config.emulators.firestoreHost, config.emulators.firestorePort);
    emulatorConnected = true;
    logger.info('firebaseClient', 'Terhubung ke Firebase Local Emulator Suite', {
      databaseId,
      firestoreHost: config.emulators.firestoreHost,
      firestorePort: config.emulators.firestorePort,
    });
  }

  // Optional App Check mitigation when configured for production domain
  if (
    typeof window !== 'undefined' &&
    !config.emulators.enabled &&
    config.firebase.appCheckSiteKey
  ) {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(config.firebase.appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (err) {
      logger.warn('firebaseClient', 'App Check inisialisasi dilewati', { code: err?.code });
    }
  }

  cachedServices = { app, auth, db, databaseId, config };
  return cachedServices;
}
