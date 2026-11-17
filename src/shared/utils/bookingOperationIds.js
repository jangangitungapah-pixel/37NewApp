const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = '37musicstudio:booking-operation:v1';

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Idempotency payload must not contain non-finite numbers.');
  }
  return value;
}

export function canonicalizeOperationPayload(payload) {
  return JSON.stringify(canonicalize(payload));
}

async function stableDigest(value) {
  const input = new TextEncoder().encode(value);
  if (globalThis.crypto?.subtle?.digest) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  // Deterministic non-cryptographic fallback for constrained test/runtime environments.
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (const byte of input) {
    left = Math.imul(left ^ byte, 0x01000193);
    right = Math.imul(right ^ byte, 0x85ebca6b);
  }
  return [left, right].map((part) => (part >>> 0).toString(16).padStart(8, '0')).join('');
}

export function generateOperationRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Reuses a request ID for an identical user intent across modal reopen/reload.
 * This is a retry convenience only; Firestore Rules remain the authorization boundary.
 */
export async function getOrCreateOperationContext({
  businessId,
  actorUid,
  operationType,
  payload,
  now = Date.now(),
  requestId = null,
}) {
  if (!businessId || !actorUid || !operationType) {
    throw new TypeError('Business, actor and operation type are required for idempotency.');
  }
  const canonicalPayload = canonicalizeOperationPayload(payload);
  const payloadHash = await stableDigest(canonicalPayload);
  const storageKey = `${STORAGE_PREFIX}:${businessId}:${actorUid}:${operationType}`;
  let selectedRequestId = requestId;

  if (!selectedRequestId) {
    try {
      const storage = globalThis.localStorage;
      const stored = JSON.parse(storage.getItem(storageKey) || '{}');
      const entries = stored && typeof stored === 'object' ? stored : {};
      const existing = entries[payloadHash];
      if (
        existing?.requestId &&
        Number.isFinite(existing.createdAt) &&
        now - existing.createdAt <= REQUEST_TTL_MS
      ) {
        selectedRequestId = existing.requestId;
      } else {
        selectedRequestId = generateOperationRequestId();
      }
      entries[payloadHash] = { requestId: selectedRequestId, createdAt: now };
      for (const [hash, entry] of Object.entries(entries)) {
        if (!entry?.createdAt || now - entry.createdAt > REQUEST_TTL_MS) delete entries[hash];
      }
      storage.setItem(storageKey, JSON.stringify(entries));
    } catch {
      selectedRequestId = selectedRequestId || generateOperationRequestId();
    }
  }

  const operationSeed = `${businessId}|${actorUid}|${operationType}|${selectedRequestId}`;
  const operationId = `${operationType.replace(/[^a-zA-Z0-9_-]/g, '_')}__${(await stableDigest(operationSeed)).slice(0, 48)}`;
  return { requestId: selectedRequestId, operationId, payloadHash, storageKey };
}

export function clearOperationContext(context) {
  if (!context?.storageKey || !context?.payloadHash) return;
  try {
    const storage = globalThis.localStorage;
    const entries = JSON.parse(storage.getItem(context.storageKey) || '{}');
    if (entries?.[context.payloadHash]?.requestId === context.requestId) {
      delete entries[context.payloadHash];
      if (Object.keys(entries).length) storage.setItem(context.storageKey, JSON.stringify(entries));
      else storage.removeItem(context.storageKey);
    }
  } catch {
    // Storage cleanup must never turn a successful Firestore commit into a failure.
  }
}
