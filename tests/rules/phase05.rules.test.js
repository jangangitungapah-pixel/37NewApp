import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

let testEnv;

const RULES_PATH = resolve(process.cwd(), 'firestore.rules');
const BIZ_ID = 'studio-37-main';
const OWNER_UID = 'owner-uid-1';
const OP_A_UID = 'operator-a-uid';
const OP_B_UID = 'operator-b-uid';
const OUTSIDER_UID = 'outsider-uid-1';

async function seedPhase05Tenant() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    const now = new Date();

    await setDoc(doc(adminDb, 'businesses', BIZ_ID), {
      businessId: BIZ_ID,
      name: '37 Music Studio',
      slug: '37-music-studio',
      ownerUid: OWNER_UID,
      timezone: 'Asia/Jakarta',
      currency: 'IDR',
      status: 'active',
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'members', OWNER_UID), {
      uid: OWNER_UID,
      businessId: BIZ_ID,
      email: 'owner@test.id',
      displayName: 'Owner',
      role: 'owner',
      status: 'active',
      assignedStudioIds: [],
      permissions: { canManageBookings: true, canSettleBookings: true },
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    for (const [uid, studioId] of [
      [OP_A_UID, 'studio-a'],
      [OP_B_UID, 'studio-b'],
    ]) {
      await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'members', uid), {
        uid,
        businessId: BIZ_ID,
        email: `${uid}@test.id`,
        displayName: uid,
        role: 'operator',
        status: 'active',
        assignedStudioIds: [studioId],
        permissions: { canManageBookings: true },
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      });

      await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'activityLogs', `ev_${studioId}`), {
        eventId: `ev_${studioId}`,
        businessId: BIZ_ID,
        studioId,
        eventType: 'booking.created',
        entityType: 'booking',
        entityId: `bk_${studioId}`,
        operationId: `ev_${studioId}`,
        actorUid: uid,
        actorRole: 'operator',
        beforeStatus: null,
        afterStatus: 'CONFIRMED',
        reason: null,
        summary: `Aktivitas pada ${studioId}`,
        schemaVersion: 1,
        createdAt: now,
      });
    }
  });
}

describe('Phase 05 Firestore Security Rules (Scoped Notifications & Activity Collaboration)', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'musicstudio37app-phase05-rules',
      firestore: {
        rules: readFileSync(RULES_PATH, 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedPhase05Tenant();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it('enforces recipient-only notification read, MapDiff readAt-only mark read, and anti-delete', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opADb = testEnv.authenticatedContext(OP_A_UID).firestore();
    const opBDb = testEnv.authenticatedContext(OP_B_UID).firestore();

    const notifId = `BOOKING_SETTLED__booking.settled__bk-1__${OP_A_UID}`;
    await assertSucceeds(
      setDoc(doc(ownerDb, 'businesses', BIZ_ID, 'notifications', notifId), {
        notificationId: notifId,
        businessId: BIZ_ID,
        studioId: 'studio-a',
        recipientUid: OP_A_UID,
        eventId: 'booking.settled__bk-1',
        type: 'BOOKING_SETTLED',
        channel: 'in_app',
        entityType: 'settlement',
        entityId: 'bk-1',
        title: 'Settlement Selesai',
        message: 'Booking studio-a sudah disettle Owner.',
        actionPath: '/operator/commissions',
        readAt: null,
        createdBy: OWNER_UID,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
      }),
    );

    // Operator A can query & read own notifications
    const opAInbox = await assertSucceeds(
      getDocs(
        query(
          collection(opADb, 'businesses', BIZ_ID, 'notifications'),
          where('recipientUid', '==', OP_A_UID),
          orderBy('createdAt', 'desc'),
        ),
      ),
    );
    expect(opAInbox.docs).toHaveLength(1);

    // Operator B & even Owner CANNOT read Operator A's private notification or list unfiltered
    await assertFails(getDoc(doc(opBDb, 'businesses', BIZ_ID, 'notifications', notifId)));
    await assertFails(getDocs(collection(opBDb, 'businesses', BIZ_ID, 'notifications')));
    await assertFails(getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'notifications', notifId)));

    // Operator A can update ONLY `readAt` to `request.time`, cannot tamper message or delete
    await assertSucceeds(
      updateDoc(doc(opADb, 'businesses', BIZ_ID, 'notifications', notifId), {
        readAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(opADb, 'businesses', BIZ_ID, 'notifications', notifId), {
        message: 'Tampered',
        readAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(ownerDb, 'businesses', BIZ_ID, 'notifications', notifId)));
  });

  it('constrains Operator notification dispatch by studio scope/type and guards cross-portal activityLogs + Phase 06 lock', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opADb = testEnv.authenticatedContext(OP_A_UID).firestore();

    // Operator A notifies Owner for assigned studio-a booking event -> SUCCEEDS
    const opToOwnerId = `BOOKING_COMPLETED__ev-1__${OWNER_UID}`;
    await assertSucceeds(
      setDoc(doc(opADb, 'businesses', BIZ_ID, 'notifications', opToOwnerId), {
        notificationId: opToOwnerId,
        businessId: BIZ_ID,
        studioId: 'studio-a',
        recipientUid: OWNER_UID,
        eventId: 'ev-1',
        type: 'BOOKING_COMPLETED',
        channel: 'in_app',
        entityType: 'booking',
        entityId: 'bk-1',
        title: 'Sesi Selesai',
        message: 'Siap settlement.',
        actionPath: '/owner/finance',
        readAt: null,
        createdBy: OP_A_UID,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
      }),
    );

    // Operator A CANNOT spoof settlement/team alerts, unassigned studio, pre-readAt, or outsider recipient
    await assertFails(
      setDoc(doc(opADb, 'businesses', BIZ_ID, 'notifications', 'spoof-settled'), {
        notificationId: 'spoof-settled',
        businessId: BIZ_ID,
        studioId: 'studio-a',
        recipientUid: OWNER_UID,
        eventId: 'ev-2',
        type: 'BOOKING_SETTLED',
        channel: 'in_app',
        entityType: 'settlement',
        entityId: 'bk-1',
        title: 'Spoof',
        message: 'Spoof',
        actionPath: '/owner/finance',
        readAt: null,
        createdBy: OP_A_UID,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
      }),
    );
    await assertFails(
      setDoc(doc(opADb, 'businesses', BIZ_ID, 'notifications', 'wrong-studio'), {
        notificationId: 'wrong-studio',
        businessId: BIZ_ID,
        studioId: 'studio-b',
        recipientUid: OWNER_UID,
        eventId: 'ev-3',
        type: 'BOOKING_CREATED',
        channel: 'in_app',
        entityType: 'booking',
        entityId: 'bk-2',
        title: 'Cross studio',
        message: 'Unassigned',
        actionPath: '/owner/bookings',
        readAt: null,
        createdBy: OP_A_UID,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
      }),
    );
    await assertFails(
      setDoc(doc(opADb, 'businesses', BIZ_ID, 'notifications', 'outsider-target'), {
        notificationId: 'outsider-target',
        businessId: BIZ_ID,
        studioId: 'studio-a',
        recipientUid: OUTSIDER_UID,
        eventId: 'ev-4',
        type: 'BOOKING_CREATED',
        channel: 'in_app',
        entityType: 'booking',
        entityId: 'bk-3',
        title: 'Leak',
        message: 'External target',
        actionPath: '/owner/bookings',
        readAt: null,
        createdBy: OP_A_UID,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
      }),
    );

    // Activity timeline query: Owner sees both studios; Operator sees ONLY assigned studio-a
    const ownerTimeline = await assertSucceeds(
      getDocs(query(collection(ownerDb, 'businesses', BIZ_ID, 'activityLogs'), orderBy('createdAt', 'desc'))),
    );
    expect(ownerTimeline.docs).toHaveLength(2);

    const opATimeline = await assertSucceeds(
      getDocs(
        query(
          collection(opADb, 'businesses', BIZ_ID, 'activityLogs'),
          where('studioId', 'in', ['studio-a']),
          orderBy('createdAt', 'desc'),
        ),
      ),
    );
    expect(opATimeline.docs).toHaveLength(1);
    await assertFails(getDocs(collection(opADb, 'businesses', BIZ_ID, 'activityLogs')));

    // Phase 06+ galleryAssets MUST remain locked `if false` even for active Owner
    await assertFails(getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-1')));
    await assertFails(
      setDoc(doc(ownerDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-1'), {
        businessId: BIZ_ID,
        createdAt: serverTimestamp(),
      }),
    );
  });
});
