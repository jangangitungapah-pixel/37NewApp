/**
 * Environment configuration loader and validator.
 * Reads only public client config from import.meta.env.
 * Never store private secrets or service account credentials in Vite env vars.
 */

const REQUIRED_FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];

/**
 * Reads an env variable safely from Vite's import.meta.env.
 * @param {string} key
 * @param {Record<string, unknown>} [source]
 * @returns {string}
 */
function readEnvString(key, source = import.meta.env) {
  const val = source?.[key];
  return typeof val === 'string' ? val.trim() : '';
}

/**
 * Validates required Firebase environment configuration.
 * @param {Record<string, unknown>} [source]
 * @returns {{ valid: boolean, missingKeys: string[] }}
 */
export function validateFirebaseEnv(source = import.meta.env) {
  const missingKeys = REQUIRED_FIREBASE_ENV_KEYS.filter(
    (key) => readEnvString(key, source).length === 0,
  );
  return {
    valid: missingKeys.length === 0,
    missingKeys,
  };
}

/**
 * Returns structured runtime configuration separated by environment.
 * @param {Record<string, unknown>} [source]
 */
export function getAppConfig(source = import.meta.env) {
  const useEmulators = readEnvString('VITE_USE_FIREBASE_EMULATORS', source) === 'true';

  return {
    appEnv: readEnvString('VITE_APP_ENV', source) || 'development',
    defaultBusinessId: readEnvString('VITE_DEFAULT_BUSINESS_ID', source) || null,
    firebase: {
      apiKey: readEnvString('VITE_FIREBASE_API_KEY', source),
      authDomain: readEnvString('VITE_FIREBASE_AUTH_DOMAIN', source),
      projectId: readEnvString('VITE_FIREBASE_PROJECT_ID', source),
      messagingSenderId: readEnvString('VITE_FIREBASE_MESSAGING_SENDER_ID', source),
      appId: readEnvString('VITE_FIREBASE_APP_ID', source),
      measurementId: readEnvString('VITE_FIREBASE_MEASUREMENT_ID', source),
      // musicstudio37app provisions an Enterprise Edition database named "default"
      databaseId: readEnvString('VITE_FIREBASE_DATABASE_ID', source) || 'default',
      appCheckSiteKey: readEnvString('VITE_FIREBASE_APP_CHECK_SITE_KEY', source),
    },
    emulators: {
      enabled: useEmulators,
      firestoreHost: readEnvString('VITE_FIRESTORE_EMULATOR_HOST', source) || '127.0.0.1',
      firestorePort: Number(readEnvString('VITE_FIRESTORE_EMULATOR_PORT', source) || '8080'),
      authUrl: readEnvString('VITE_AUTH_EMULATOR_URL', source) || 'http://127.0.0.1:9099',
    },
    cloudinary: {
      cloudName: readEnvString('VITE_CLOUDINARY_CLOUD_NAME', source),
      uploadPreset: readEnvString('VITE_CLOUDINARY_UPLOAD_PRESET', source),
    },
  };
}
