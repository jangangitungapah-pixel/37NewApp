import {
  validateCommissionEntryDoc,
  validateLedgerEntryDoc,
} from '../../domain/validators/financeValidators.js';

function normalizeTimestamp(value) {
  if (!value) {
    return null;
  }
  if (typeof value.toDate === 'function') {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  return value;
}

/**
 * @param {import('firebase/firestore').DocumentSnapshot} snapshot
 */
export function mapLedgerEntrySnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) {
    return null;
  }
  const raw = snapshot.data();
  return validateLedgerEntryDoc({
    entryId: snapshot.id,
    businessId: snapshot.ref.parent.parent?.id || raw?.businessId,
    ...raw,
    createdAt: normalizeTimestamp(raw?.createdAt),
  });
}

/**
 * @param {import('firebase/firestore').DocumentSnapshot} snapshot
 */
export function mapCommissionEntrySnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) {
    return null;
  }
  const raw = snapshot.data();
  return validateCommissionEntryDoc({
    entryId: snapshot.id,
    businessId: snapshot.ref.parent.parent?.id || raw?.businessId,
    ...raw,
    createdAt: normalizeTimestamp(raw?.createdAt),
  });
}
