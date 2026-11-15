import {
  collection,
  doc,
  endAt,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  startAt,
  updateDoc,
  where,
  getDocs,
} from 'firebase/firestore';
import { CUSTOMER_STATUS, SCHEMA_VERSIONS } from '../../domain/enums/roles.js';
import { validateCustomer } from '../../domain/validators/masterDataValidators.js';
import { getFirebaseServices } from '../firebase/firebaseClient.js';
import { mapFirebaseError } from '../firebase/errorMapper.js';
import { mapCustomerSnapshot } from '../mappers/masterDataMappers.js';

/**
 * Fetches a single cursor-paginated slice of customers (`businesses/{businessId}/customers`).
 * Avoids downloading entire customer history on load to protect Spark quota.
 *
 * @param {{
 *   businessId: string,
 *   status?: 'active' | 'archived',
 *   pageSize?: number,
 *   cursorDoc?: import('firebase/firestore').QueryDocumentSnapshot | null,
 *   searchPrefix?: string,
 * }} params
 */
export async function fetchCustomersPage({
  businessId,
  status = CUSTOMER_STATUS.ACTIVE,
  pageSize = 20,
  cursorDoc = null,
  searchPrefix = '',
}) {
  try {
    const { db } = getFirebaseServices();
    const colRef = collection(db, 'businesses', businessId, 'customers');
    const normalizedPrefix = searchPrefix.trim().toLowerCase();

    const constraints = [
      where('status', '==', status),
      orderBy('nameLower', 'asc'),
      orderBy('__name__', 'asc'),
    ];

    if (normalizedPrefix) {
      constraints.push(startAt(normalizedPrefix));
      constraints.push(endAt(`${normalizedPrefix}\uf8ff`));
    } else if (cursorDoc) {
      constraints.push(startAfter(cursorDoc));
    }

    constraints.push(limit(pageSize + 1));

    const snap = await getDocs(query(colRef, ...constraints));
    const hasMore = snap.docs.length > pageSize;
    const pageDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
    const items = pageDocs.map(mapCustomerSnapshot).filter(Boolean);
    const lastDoc = pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

    return {
      items,
      hasMore: normalizedPrefix ? false : hasMore,
      lastDoc,
    };
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/**
 * Creates or updates a customer document without permitting hard deletion.
 */
export async function saveCustomerDoc({ businessId, actorUid, data, existingCustomer = null }) {
  try {
    const { db } = getFirebaseServices();
    const colRef = collection(db, 'businesses', businessId, 'customers');
    const ref = existingCustomer?.customerId ? doc(colRef, existingCustomer.customerId) : doc(colRef);
    const customerId = ref.id;

    const validated = validateCustomer({
      ...data,
      customerId,
      businessId,
      schemaVersion: SCHEMA_VERSIONS.CUSTOMER,
      createdBy: existingCustomer?.createdBy || actorUid,
      updatedBy: actorUid,
    });

    if (!existingCustomer) {
      await setDoc(ref, {
        ...validated,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const { createdAt: _cAt, createdBy: _cBy, ...updateFields } = validated;
      await updateDoc(ref, {
        ...updateFields,
        updatedBy: actorUid,
        updatedAt: serverTimestamp(),
      });
    }

    return validated;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}
