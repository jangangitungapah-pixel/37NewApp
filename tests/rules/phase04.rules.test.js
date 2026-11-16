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
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

let testEnv;

const RULES_PATH = resolve(process.cwd(), 'firestore.rules');
const BIZ_ID = 'studio-37-main';
const OWNER_UID = 'owner-uid-1';
const OP_A_UID = 'operator-a-uid';
const OP_B_UID = 'operator-b-uid';
const DATE_KEY = '2026-11-22';

async function seedPhase04Tenant() {
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
        displayName: uid.toUpperCase(),
        role: 'operator',
        status: 'active',
        assignedStudioIds: [studioId],
        permissions: { canManageBookings: true, canSettleBookings: false },
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      });

      await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'studios', studioId), {
        studioId,
        businessId: BIZ_ID,
        name: studioId.toUpperCase(),
        code: studioId.toUpperCase(),
        status: 'active',
        timezone: 'Asia/Jakarta',
        operatingHours: { openTime: '10:00', closeTime: '22:00' },
        slotGranularityMinutes: 15,
        description: null,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      });
    }

    // Seed completed bookings waiting settlement for Op A and Op B
    for (const [bkId, studioId, opUid] of [
      ['bk-op-a', 'studio-a', OP_A_UID],
      ['bk-op-b', 'studio-b', OP_B_UID],
    ]) {
      await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'bookings', bkId), {
        bookingId: bkId,
        businessId: BIZ_ID,
        studioId,
        serviceId: 'svc-1',
        customerId: 'cust-1',
        operatorUid: opUid,
        dateKey: DATE_KEY,
        timezone: 'Asia/Jakarta',
        startTime: '14:00',
        endTime: '16:00',
        durationMinutes: 120,
        bufferMinutes: 0,
        startAt: Timestamp.fromDate(new Date('2026-11-22T07:00:00Z')),
        endAt: Timestamp.fromDate(new Date('2026-11-22T09:00:00Z')),
        slotIds: [`${studioId}__${DATE_KEY}__56`],
        status: 'COMPLETED_PENDING_SETTLEMENT',
        studioSnapshot: { studioId, name: studioId.toUpperCase(), code: studioId.toUpperCase() },
        serviceSnapshot: { serviceId: 'svc-1', name: 'Rehearsal', configVersion: 1 },
        customerSnapshot: { customerId: 'cust-1', name: 'Band Satu', phone: '08123456789' },
        priceSnapshot: { currency: 'IDR', baseSubtotalMinor: 300000, discountMinor: 0, totalMinor: 300000 },
        commissionSnapshot: { currency: 'IDR', method: 'percentage', rateOrValue: 10, basis: 'settled_amount', amountMinor: 30000 },
        notes: null,
        cancelReason: null,
        cancelledBy: null,
        cancelledAt: null,
        checkedInAt: now,
        completedAt: now,
        settlement: null,
        rescheduleCount: 0,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: opUid,
        updatedBy: opUid,
      });
    }
  });
}

describe('Phase 04 Firestore Security Rules (Settlement, Immutable Ledger & Commission Privacy)', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'musicstudio37app-phase04-rules',
      firestore: {
        rules: readFileSync(RULES_PATH, 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedPhase04Tenant();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it('executes atomic Owner settlement with existsAfter ledger/commission link and prevents duplicate retry writes', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opADb = testEnv.authenticatedContext(OP_A_UID).firestore();

    const bookingRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-op-a');
    const paymentId = 'settlement_payment__bk-op-a';
    const commId = 'commission_earned__bk-op-a';
    const paymentRef = doc(ownerDb, 'businesses', BIZ_ID, 'ledgerEntries', paymentId);
    const commRef = doc(ownerDb, 'businesses', BIZ_ID, 'commissionEntries', commId);

    // Operator CANNOT mark SETTLEMENT_REVIEW or SETTLED even for assigned studio booking
    await assertFails(
      updateDoc(doc(opADb, 'businesses', BIZ_ID, 'bookings', 'bk-op-a'), {
        status: 'SETTLEMENT_REVIEW',
        updatedBy: OP_A_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    // Owner CANNOT update booking status -> SETTLED without creating ledgerEntries & commissionEntries in same tx
    await assertFails(
      updateDoc(bookingRef, {
        status: 'SETTLED',
        settlement: {
          paidAmountMinor: 300000,
          paymentMethod: 'transfer',
          ledgerEntryId: paymentId,
          commissionEntryId: commId,
        },
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    // Atomic Owner settlement transaction (Booking + Ledger + Commission + ActivityLog) succeeds
    await assertSucceeds(
      runTransaction(ownerDb, async (tx) => {
        await Promise.all([tx.get(bookingRef), tx.get(paymentRef), tx.get(commRef)]);

        tx.update(bookingRef, {
          status: 'SETTLED',
          settlement: {
            paidAmountMinor: 300000,
            paymentMethod: 'transfer',
            settlementReference: 'BCA-01',
            settlementNotes: null,
            reviewReason: null,
            ledgerEntryId: paymentId,
            commissionEntryId: commId,
            settledBy: OWNER_UID,
            settledAt: serverTimestamp(),
          },
          updatedBy: OWNER_UID,
          updatedAt: serverTimestamp(),
        });

        tx.set(paymentRef, {
          entryId: paymentId,
          businessId: BIZ_ID,
          bookingId: 'bk-op-a',
          studioId: 'studio-a',
          dateKey: DATE_KEY,
          type: 'PAYMENT_RECEIVED',
          direction: 'inflow',
          amountMinor: 300000,
          currency: 'IDR',
          paymentMethod: 'transfer',
          reference: 'BCA-01',
          notes: null,
          relatedEntryId: null,
          reason: null,
          schemaVersion: 1,
          createdAt: serverTimestamp(),
          createdBy: OWNER_UID,
        });

        tx.set(commRef, {
          entryId: commId,
          businessId: BIZ_ID,
          bookingId: 'bk-op-a',
          studioId: 'studio-a',
          dateKey: DATE_KEY,
          operatorUid: OP_A_UID,
          entryType: 'EARNED',
          direction: 'credit',
          amountMinor: 30000,
          currency: 'IDR',
          method: 'percentage',
          rateOrValue: 10,
          basis: 'settled_amount',
          basisAmountMinor: 300000,
          source: 'business_default',
          relatedEntryId: null,
          reason: null,
          status: 'RECORDED',
          schemaVersion: 1,
          createdAt: serverTimestamp(),
          createdBy: OWNER_UID,
        });

        tx.set(doc(ownerDb, 'businesses', BIZ_ID, 'activityLogs', 'booking.settled__bk-op-a'), {
          eventId: 'booking.settled__bk-op-a',
          businessId: BIZ_ID,
          studioId: 'studio-a',
          eventType: 'booking.settled',
          entityType: 'booking',
          entityId: 'bk-op-a',
          operationId: 'booking.settled__bk-op-a',
          actorUid: OWNER_UID,
          actorRole: 'owner',
          beforeStatus: 'COMPLETED_PENDING_SETTLEMENT',
          afterStatus: 'SETTLED',
          reason: null,
          summary: 'Booking settled',
          schemaVersion: 1,
          createdAt: serverTimestamp(),
        });
      }),
    );

    // Deterministic ID retry/overwrite FAILS; SETTLED booking status cannot be altered afterwards
    await assertFails(
      setDoc(paymentRef, {
        entryId: paymentId,
        businessId: BIZ_ID,
        bookingId: 'bk-op-a',
        studioId: 'studio-a',
        dateKey: DATE_KEY,
        type: 'PAYMENT_RECEIVED',
        direction: 'inflow',
        amountMinor: 999999,
        currency: 'IDR',
        paymentMethod: 'cash',
        reference: null,
        notes: null,
        relatedEntryId: null,
        reason: null,
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        createdBy: OWNER_UID,
      }),
    );

    await assertFails(
      updateDoc(bookingRef, {
        status: 'CANCELLED',
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('enforces ledger/commission immutability, adjustment parent checks, Operator commission privacy, and Phase 05+ locks', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opADb = testEnv.authenticatedContext(OP_A_UID).firestore();
    const opBDb = testEnv.authenticatedContext(OP_B_UID).firestore();

    // Seed settled ledger + commissions for BOTH Op A and Op B cleanly
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      const now = new Date();
      await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'ledgerEntries', 'settlement_payment__bk-op-a'), {
        entryId: 'settlement_payment__bk-op-a',
        businessId: BIZ_ID,
        bookingId: 'bk-op-a',
        studioId: 'studio-a',
        dateKey: DATE_KEY,
        type: 'PAYMENT_RECEIVED',
        direction: 'inflow',
        amountMinor: 300000,
        currency: 'IDR',
        paymentMethod: 'transfer',
        reference: null,
        notes: null,
        relatedEntryId: null,
        reason: null,
        schemaVersion: 1,
        createdAt: now,
        createdBy: OWNER_UID,
      });
      await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'commissionEntries', 'commission_earned__bk-op-a'), {
        entryId: 'commission_earned__bk-op-a',
        businessId: BIZ_ID,
        bookingId: 'bk-op-a',
        studioId: 'studio-a',
        dateKey: DATE_KEY,
        operatorUid: OP_A_UID,
        entryType: 'EARNED',
        direction: 'credit',
        amountMinor: 30000,
        currency: 'IDR',
        method: 'percentage',
        rateOrValue: 10,
        basis: 'settled_amount',
        basisAmountMinor: 300000,
        source: 'business_default',
        relatedEntryId: null,
        reason: null,
        status: 'RECORDED',
        schemaVersion: 1,
        createdAt: now,
        createdBy: OWNER_UID,
      });
      await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'commissionEntries', 'commission_earned__bk-op-b'), {
        entryId: 'commission_earned__bk-op-b',
        businessId: BIZ_ID,
        bookingId: 'bk-op-b',
        studioId: 'studio-b',
        dateKey: DATE_KEY,
        operatorUid: OP_B_UID,
        entryType: 'EARNED',
        direction: 'credit',
        amountMinor: 30000,
        currency: 'IDR',
        method: 'percentage',
        rateOrValue: 10,
        basis: 'settled_amount',
        basisAmountMinor: 300000,
        source: 'business_default',
        relatedEntryId: null,
        reason: null,
        status: 'RECORDED',
        schemaVersion: 1,
        createdAt: now,
        createdBy: OWNER_UID,
      });
    });

    // 1. Ledger & Commission entries are strictly immutable (no update, no delete, even for Owner)
    await assertFails(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'ledgerEntries', 'settlement_payment__bk-op-a'), {
        amountMinor: 1000,
      }),
    );
    await assertFails(
      deleteDoc(doc(ownerDb, 'businesses', BIZ_ID, 'ledgerEntries', 'settlement_payment__bk-op-a')),
    );
    await assertFails(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'commissionEntries', 'commission_earned__bk-op-a'), {
        amountMinor: 1000,
      }),
    );
    await assertFails(
      deleteDoc(doc(ownerDb, 'businesses', BIZ_ID, 'commissionEntries', 'commission_earned__bk-op-a')),
    );

    // 2. Owner can create valid REVERSAL referencing existing entry; dangling parent reference FAILS
    await assertSucceeds(
      setDoc(
        doc(ownerDb, 'businesses', BIZ_ID, 'ledgerEntries', 'reversal__settlement_payment__bk-op-a'),
        {
          entryId: 'reversal__settlement_payment__bk-op-a',
          businessId: BIZ_ID,
          bookingId: 'bk-op-a',
          studioId: 'studio-a',
          dateKey: DATE_KEY,
          type: 'REVERSAL',
          direction: 'outflow',
          amountMinor: 300000,
          currency: 'IDR',
          paymentMethod: 'transfer',
          reference: null,
          notes: null,
          relatedEntryId: 'settlement_payment__bk-op-a',
          reason: 'Reversal salah nominal transfer',
          schemaVersion: 1,
          createdAt: serverTimestamp(),
          createdBy: OWNER_UID,
        },
      ),
    );
    await assertFails(
      setDoc(doc(ownerDb, 'businesses', BIZ_ID, 'ledgerEntries', 'adj-dangling'), {
        entryId: 'adj-dangling',
        businessId: BIZ_ID,
        bookingId: 'bk-op-a',
        studioId: 'studio-a',
        dateKey: DATE_KEY,
        type: 'ADJUSTMENT',
        direction: 'outflow',
        amountMinor: 10000,
        currency: 'IDR',
        paymentMethod: 'cash',
        reference: null,
        notes: null,
        relatedEntryId: 'does-not-exist',
        reason: 'Dangling ref',
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        createdBy: OWNER_UID,
      }),
    );

    // 3. Operator isolation on ledger & commissions
    await assertFails(getDocs(collection(opADb, 'businesses', BIZ_ID, 'ledgerEntries')));
    await assertFails(getDocs(collection(opADb, 'businesses', BIZ_ID, 'commissionEntries')));
    await assertFails(getDoc(doc(opADb, 'businesses', BIZ_ID, 'commissionEntries', 'commission_earned__bk-op-b')));
    await assertFails(
      getDocs(
        query(
          collection(opBDb, 'businesses', BIZ_ID, 'commissionEntries'),
          where('operatorUid', '==', OP_A_UID),
        ),
      ),
    );

    const opAScopedSnap = await assertSucceeds(
      getDocs(
        query(
          collection(opADb, 'businesses', BIZ_ID, 'commissionEntries'),
          where('operatorUid', '==', OP_A_UID),
          orderBy('dateKey', 'desc'),
          orderBy('createdAt', 'desc'),
        ),
      ),
    );
    expect(opAScopedSnap.docs).toHaveLength(1);

    // 4. Phase 06+ collections remain strictly locked `if false` even for active Owner
    await assertFails(getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-1')));
  });
});
