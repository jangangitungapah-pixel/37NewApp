import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { ROLES } from '../../domain/enums/roles.js';
import {
  canAccessStudio,
  canViewBusinessAnalytics,
  isActiveMember,
} from '../../domain/policies/accessPolicy.js';
import { AppError, ERROR_CATEGORY, mapFirebaseError } from '../firebase/errorMapper.js';
import { getFirebaseServices } from '../firebase/firebaseClient.js';
import { mapBookingSnapshot } from '../mappers/bookingMappers.js';
import {
  mapCommissionEntrySnapshot,
  mapLedgerEntrySnapshot,
} from '../mappers/financeMappers.js';

export const ANALYTICS_BOOKINGS_CAP = 250;
export const ANALYTICS_FINANCE_CAP = 250;

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function sliceWithCapInfo(docs, mapper, capLimit) {
  const reachedCap = docs.length > capLimit;
  const trimmedDocs = reachedCap ? docs.slice(0, capLimit) : docs;
  return {
    items: trimmedDocs.map(mapper).filter(Boolean),
    reachedCap,
    capLimit,
  };
}

/**
 * Fetches a bounded on-demand booking slice for Spark-safe dashboard analytics (`limit(capLimit + 1)`).
 */
export async function fetchBookingsAnalyticsSlice({
  businessId,
  member,
  studioId = 'all',
  startDateKey,
  endDateKey,
  capLimit = ANALYTICS_BOOKINGS_CAP,
}) {
  if (!businessId || !isActiveMember(member)) {
    return { items: [], reachedCap: false, capLimit };
  }

  const isOwner = member.role === ROLES.OWNER;
  const assignedIds = Array.isArray(member.assignedStudioIds) ? member.assignedStudioIds : [];

  if (!isOwner && assignedIds.length === 0) {
    return { items: [], reachedCap: false, capLimit };
  }

  try {
    const { db } = getFirebaseServices();
    const bookingsCol = collection(db, 'businesses', businessId, 'bookings');

    if (studioId && studioId !== 'all') {
      if (!canAccessStudio(member, studioId)) {
        throw new AppError({
          category: ERROR_CATEGORY.PERMISSION_DENIED,
          code: 'authz/analytics-studio-denied',
          message: 'Anda tidak memiliki akses analitik untuk studio yang dipilih.',
        });
      }
      const q = query(
        bookingsCol,
        where('studioId', '==', studioId),
        where('dateKey', '>=', startDateKey),
        where('dateKey', '<=', endDateKey),
        orderBy('dateKey', 'asc'),
        orderBy('startAt', 'asc'),
        limit(capLimit + 1),
      );
      const snap = await getDocs(q);
      return sliceWithCapInfo(snap.docs, mapBookingSnapshot, capLimit);
    }

    if (isOwner) {
      const q = query(
        bookingsCol,
        where('dateKey', '>=', startDateKey),
        where('dateKey', '<=', endDateKey),
        orderBy('dateKey', 'asc'),
        orderBy('startAt', 'asc'),
        limit(capLimit + 1),
      );
      const snap = await getDocs(q);
      return sliceWithCapInfo(snap.docs, mapBookingSnapshot, capLimit);
    }

    const chunks = chunkArray(assignedIds, 10);
    const chunkSnaps = await Promise.all(
      chunks.map((chunkIds) =>
        getDocs(
          query(
            bookingsCol,
            where('studioId', 'in', chunkIds),
            where('dateKey', '>=', startDateKey),
            where('dateKey', '<=', endDateKey),
            orderBy('dateKey', 'asc'),
            orderBy('startAt', 'asc'),
            limit(capLimit + 1),
          ),
        ),
      ),
    );

    const deduped = new Map();
    let anyReachedCap = false;
    for (const snap of chunkSnaps) {
      if (snap.docs.length > capLimit) {
        anyReachedCap = true;
      }
      for (const docSnap of snap.docs.slice(0, capLimit)) {
        const mapped = mapBookingSnapshot(docSnap);
        if (mapped) {
          deduped.set(mapped.bookingId, mapped);
        }
      }
    }

    const sorted = Array.from(deduped.values()).sort((a, b) => {
      if (a.dateKey !== b.dateKey) {
        return a.dateKey.localeCompare(b.dateKey);
      }
      return (a.startAt?.getTime?.() || 0) - (b.startAt?.getTime?.() || 0);
    });

    return {
      items: sorted.slice(0, capLimit),
      reachedCap: anyReachedCap || sorted.length > capLimit,
      capLimit,
    };
  } catch (error) {
    throw error instanceof AppError ? error : mapFirebaseError(error);
  }
}

/**
 * Fetches a bounded on-demand ledger slice strictly for Owners (`limit(capLimit + 1)`).
 */
export async function fetchLedgerAnalyticsSlice({
  businessId,
  member,
  studioId = 'all',
  startDateKey,
  endDateKey,
  capLimit = ANALYTICS_FINANCE_CAP,
}) {
  if (!businessId || !canViewBusinessAnalytics(member)) {
    return { items: [], reachedCap: false, capLimit };
  }

  try {
    const { db } = getFirebaseServices();
    const colRef = collection(db, 'businesses', businessId, 'ledgerEntries');
    const constraints = [];
    if (studioId && studioId !== 'all') {
      constraints.push(where('studioId', '==', studioId));
    }
    constraints.push(
      where('dateKey', '>=', startDateKey),
      where('dateKey', '<=', endDateKey),
      orderBy('dateKey', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(capLimit + 1),
    );

    const snap = await getDocs(query(colRef, ...constraints));
    return sliceWithCapInfo(snap.docs, mapLedgerEntrySnapshot, capLimit);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/**
 * Fetches a bounded on-demand commission slice scoped strictly by role:
 * - Owner: all business commission entries in window
 * - Operator: `where('operatorUid', '==', member.uid)` only
 */
export async function fetchCommissionAnalyticsSlice({
  businessId,
  member,
  startDateKey,
  endDateKey,
  capLimit = ANALYTICS_FINANCE_CAP,
}) {
  if (!businessId || !isActiveMember(member) || !member.uid) {
    return { items: [], reachedCap: false, capLimit };
  }

  try {
    const { db } = getFirebaseServices();
    const colRef = collection(db, 'businesses', businessId, 'commissionEntries');
    const constraints = [];

    if (member.role !== ROLES.OWNER) {
      constraints.push(where('operatorUid', '==', member.uid));
    }
    constraints.push(
      where('dateKey', '>=', startDateKey),
      where('dateKey', '<=', endDateKey),
      orderBy('dateKey', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(capLimit + 1),
    );

    const snap = await getDocs(query(colRef, ...constraints));
    return sliceWithCapInfo(snap.docs, mapCommissionEntrySnapshot, capLimit);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}
