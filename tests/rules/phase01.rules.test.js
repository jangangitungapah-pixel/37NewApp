import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

let testEnv;

const RULES_PATH = resolve(process.cwd(), 'firestore.rules');
const BIZ_ID = 'studio-37-main';
const OWNER_UID = 'owner-uid-1';
const OPERATOR_UID = 'operator-uid-1';
const OUTSIDER_UID = 'outsider-uid-1';

function buildMemberPayload(overrides = {}) {
  return {
    uid: OWNER_UID,
    businessId: BIZ_ID,
    email: 'owner@37musicstudio.test',
    displayName: 'Studio Owner',
    role: 'owner',
    status: 'active',
    assignedStudioIds: [],
    permissions: { canManageBookings: true },
    schemaVersion: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: OWNER_UID,
    updatedBy: OWNER_UID,
    ...overrides,
  };
}

describe('Phase 01 Firestore Security Rules (Deny-by-Default)', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'musicstudio37app-rules-test',
      firestore: {
        rules: readFileSync(RULES_PATH, 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it('denies all unauthenticated reads and writes', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthDb, 'users', OWNER_UID)));
    await assertFails(getDoc(doc(unauthDb, 'businesses', BIZ_ID)));
    await assertFails(getDoc(doc(unauthDb, 'businesses', BIZ_ID, 'members', OWNER_UID)));
    await assertFails(
      setDoc(doc(unauthDb, 'users', OWNER_UID), { uid: OWNER_UID, email: 'x@test.com' }),
    );
  });

  it('enforces user profile isolation and blocks permission field injection in users/{uid}', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore();

    await assertSucceeds(
      setDoc(doc(ownerDb, 'users', OWNER_UID), {
        uid: OWNER_UID,
        displayName: 'Owner',
        email: 'owner@37musicstudio.test',
        photoURL: null,
        defaultBusinessId: null,
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // Cross-user access denied
    await assertFails(getDoc(doc(outsiderDb, 'users', OWNER_UID)));

    // Permission injection in users/{uid} denied
    await assertFails(
      setDoc(doc(outsiderDb, 'users', OUTSIDER_UID), {
        uid: OUTSIDER_UID,
        displayName: 'Attacker',
        email: 'attacker@test.com',
        role: 'owner',
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('allows atomic initial business + founder owner bootstrap and blocks rogue owner join', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore();

    const batch = writeBatch(ownerDb);
    batch.set(doc(ownerDb, 'businesses', BIZ_ID), {
      businessId: BIZ_ID,
      name: '37 Music Studio',
      slug: '37-music-studio',
      ownerUid: OWNER_UID,
      timezone: 'Asia/Jakarta',
      currency: 'IDR',
      status: 'active',
      schemaVersion: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });
    batch.set(doc(ownerDb, 'businesses', BIZ_ID, 'members', OWNER_UID), buildMemberPayload());

    await assertSucceeds(batch.commit());

    // Outsider cannot self-register as owner or operator in existing business
    await assertFails(
      setDoc(
        doc(outsiderDb, 'businesses', BIZ_ID, 'members', OUTSIDER_UID),
        buildMemberPayload({
          uid: OUTSIDER_UID,
          email: 'outsider@test.com',
          displayName: 'Outsider',
          createdBy: OUTSIDER_UID,
          updatedBy: OUTSIDER_UID,
        }),
      ),
    );
  });

  it('enforces Owner vs Operator permissions, denies self-elevation, and keeps Phase 02+ collections locked', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const operatorDb = testEnv.authenticatedContext(OPERATOR_UID).firestore();
    const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore();

    // Seed business + owner + operator via admin rules-bypass
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'businesses', BIZ_ID), {
        businessId: BIZ_ID,
        name: '37 Music Studio',
        slug: '37-music-studio',
        ownerUid: OWNER_UID,
        timezone: 'Asia/Jakarta',
        currency: 'IDR',
        status: 'active',
        schemaVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      });
      await setDoc(
        doc(adminDb, 'businesses', BIZ_ID, 'members', OWNER_UID),
        buildMemberPayload({ createdAt: new Date(), updatedAt: new Date() }),
      );
      await setDoc(
        doc(adminDb, 'businesses', BIZ_ID, 'members', OPERATOR_UID),
        buildMemberPayload({
          uid: OPERATOR_UID,
          email: 'op@37musicstudio.test',
          displayName: 'Operator One',
          role: 'operator',
          assignedStudioIds: ['studio-a'],
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
    });

    // Operator can read own membership & own business, plus query own membership via collectionGroup
    await assertSucceeds(getDoc(doc(operatorDb, 'businesses', BIZ_ID, 'members', OPERATOR_UID)));
    await assertSucceeds(getDoc(doc(operatorDb, 'businesses', BIZ_ID)));
    await assertSucceeds(
      getDocs(query(collectionGroup(operatorDb, 'members'), where('uid', '==', OPERATOR_UID))),
    );

    // Operator cannot list all members or read owner member doc
    await assertFails(getDocs(collection(operatorDb, 'businesses', BIZ_ID, 'members')));
    await assertFails(getDoc(doc(operatorDb, 'businesses', BIZ_ID, 'members', OWNER_UID)));

    // Operator cannot self-elevate role or change assignedStudioIds
    await assertFails(
      updateDoc(doc(operatorDb, 'businesses', BIZ_ID, 'members', OPERATOR_UID), {
        role: 'owner',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(operatorDb, 'businesses', BIZ_ID, 'members', OPERATOR_UID), {
        assignedStudioIds: ['studio-a', 'studio-b'],
        updatedAt: serverTimestamp(),
      }),
    );

    // Outsider cannot read business
    await assertFails(getDoc(doc(outsiderDb, 'businesses', BIZ_ID)));

    // Owner can suspend Operator -> subsequent business read by Operator fails
    await assertSucceeds(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'members', OPERATOR_UID), {
        status: 'suspended',
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(getDoc(doc(operatorDb, 'businesses', BIZ_ID)));

    // Unauthenticated/outsider bookings & ledger stay blocked; Phase 05+ collections remain locked even for Owner
    await assertFails(getDoc(doc(outsiderDb, 'businesses', BIZ_ID, 'bookings', 'b-1')));
    await assertFails(getDoc(doc(outsiderDb, 'businesses', BIZ_ID, 'ledgerEntries', 'l-1')));
    await assertFails(getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'notifications', 'n-1')));
  });
});
