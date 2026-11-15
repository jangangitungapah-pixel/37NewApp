/**
 * Safe client logger that avoids leaking credential fields into console logs.
 */

const SENSITIVE_KEYS = new Set(['password', 'token', 'accessToken', 'apiKey', 'secret']);

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map(sanitizePayload);
  }
  const clean = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.has(key)) {
      clean[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      clean[key] = sanitizePayload(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export const logger = {
  info(scope, message, context) {
    if (import.meta.env?.DEV) {
      console.info(`[37MS:${scope}] ${message}`, context ? sanitizePayload(context) : '');
    }
  },
  warn(scope, message, context) {
    console.warn(`[37MS:${scope}] ${message}`, context ? sanitizePayload(context) : '');
  },
  error(scope, message, error) {
    console.error(`[37MS:${scope}] ${message}`, error?.code || error?.message || error);
  },
};
