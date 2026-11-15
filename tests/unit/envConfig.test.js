import { describe, expect, it } from 'vitest';
import { getAppConfig, validateFirebaseEnv } from '../../src/infrastructure/config/env.js';

describe('Environment Configuration (env.js)', () => {
  it('defaults Firestore databaseId to "(default)" when VITE_FIREBASE_DATABASE_ID is omitted', () => {
    const config = getAppConfig({
      VITE_FIREBASE_API_KEY: 'key',
      VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'musicstudio37app',
      VITE_FIREBASE_APP_ID: '1:123:web:abc',
    });

    expect(config.firebase.databaseId).toBe('(default)');
  });

  it('uses explicit VITE_FIREBASE_DATABASE_ID when provided', () => {
    const config = getAppConfig({
      VITE_FIREBASE_DATABASE_ID: 'staging-db',
    });

    expect(config.firebase.databaseId).toBe('staging-db');
  });

  it('reports missing required Firebase keys via validateFirebaseEnv', () => {
    const result = validateFirebaseEnv({ VITE_FIREBASE_PROJECT_ID: 'musicstudio37app' });
    expect(result.valid).toBe(false);
    expect(result.missingKeys).toEqual([
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_APP_ID',
    ]);
  });
});
