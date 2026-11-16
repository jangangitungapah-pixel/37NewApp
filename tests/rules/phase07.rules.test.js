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
  getDocs,
  limit,
  orderBy,
  query,
  doc,
  setDoc,
  where,
} from 'firebase/firestore';

let testEnv;

const RULES_PATH = resolve(process.cwd(), 'firestore.rules');
const BIZ_ID = 'studio-37-main';
const OWNER_UID = 'owner-uid-1';
const OP_A_UID = 'operator-a-uid';
const OP_B_UID = 'operator-b-uid';

async function seedPhase07AnalyticsData() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    const now = new Date();
    const t1 = new Date('2026-11-16T03:00:00Z');
    const t2 = new Date('2026-11-16T05:00:00Z');

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

      await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'studios', studioId), {
        studioId,
        businessId: BIZ_ID,
        name: studioId.toUpperCase(),
        status: 'active',
        operatingHours: { openTime: '10:00', closeTime: '22:00' },
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      });

      await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'bookings', `bk_${studioId}`), {
        bookingId: `bk_${studioId}`,
        businessId: BIZ_ID,
        studioId,
        studioName: studioId.toUpperCase(),
        customerId: 'cust-1',
        customerName: 'Band Test',
        serviceId: 'svc-1',
        serviceName: 'Rehearsal',
        serviceCategory: 'rehearsal',
        operatorUid: uid,
        dateKey: '2026-11-16',
        startTime: '10:00',
        endTime: '12:00',
        startAt: t1,
        endAt: t2,
        durationMinutes: 120,
        status: 'SETTLED',
        priceSnapshot: {
          baseSubtotalMinor: 200000,
          discountMinor: 0,
          taxMinor: 0,
          totalMinor: 200000,
          currency: 'IDR',
          pricingModel: 'hourly',
          configVersion: 1,
        },
        commissionSnapshot: {
          method: 'percentage',
          rateOrValue: 10,
          basis: 'settled_amount',
          amountMinor: 20000,
          source: 'business_default',
        },
        paidAmountMinor: 200000,
        paymentMethod: 'qris',
        settledAt: now,
        settledBy: OWNER_UID,
        createdBy: uid,
        updatedBy: OWNER_UID,
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
      });

      await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'ledgerEntries', `led_${studioId}`), {
        entryId: `led_${studioId}`,
        businessId: BIZ_ID,
        bookingId: `bk_${studioId}`,
        studioId,
        dateKey: '2026-11-16',
        type: 'PAYMENT_RECEIVED',
        direction: 'inflow',
        amountMinor: 200000,
        currency: 'IDR',
        paymentMethod: 'qris',
        reference: 'QR-1',
        notes: 'Settled',
        relatedEntryId: null,
        reason: null,
        schemaVersion: 1,
        createdAt: now,
        createdBy: OWNER_UID,
      });

      await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'commissionEntries', `comm_${studioId}`), {
        entryId: `comm_${studioId}`,
        businessId: BIZ_ID,
        bookingId: `bk_${studioId}`,
        studioId,
        dateKey: '2026-11-16',
        operatorUid: uid,
        entryType: 'EARNED',
        direction: 'credit',
        amountMinor: 20000,
        currency: 'IDR',
        method: 'percentage',
        rateOrValue: 10,
        basis: 'settled_amount',
        basisAmountMinor: 200000,
        source: 'business_default',
        relatedEntryId: null,
        reason: null,
        status: 'RECORDED',
        schemaVersion: 1,
        createdAt: now,
        createdBy: OWNER_UID,
      });
    }
  });
}

describe('Phase 07 Spark-Safe Analytics Queries — Emulator Rules & Privacy Isolation', () => {
  beforeAll(async () => {
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    const [host, portStr] = emulatorHost.split(':');
    testEnv = await initializeTestEnvironment({
      projectId: 'musicstudio37app-phase07-rules',
      firestore: {
        host,
        port: Number(portStr),
        rules: readFileSync(RULES_PATH, 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedPhase07AnalyticsData();
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it('executes bounded Owner analytics queries and blocks cross-studio / ledger / other-operator leaks for Operators', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opADb = testEnv.authenticatedContext(OP_A_UID).firestore();

    // 1. Owner loads business-wide bounded analytics slices cleanly
    const ownerBookings = await assertSucceeds(
      getDocs(
        query(
          collection(ownerDb, 'businesses', BIZ_ID, 'bookings'),
          where('dateKey', '>=', '2026-11-01'),
          where('dateKey', '<=', '2026-11-30'),
          orderBy('dateKey', 'asc'),
          orderBy('startAt', 'asc'),
          limit(251),
        ),
      ),
    );
    expect(ownerBookings.docs).toHaveLength(2);

    const ownerLedger = await assertSucceeds(
      getDocs(
        query(
          collection(ownerDb, 'businesses', BIZ_ID, 'ledgerEntries'),
          where('dateKey', '>=', '2026-11-01'),
          where('dateKey', '<=', '2026-11-30'),
          orderBy('dateKey', 'desc'),
          orderBy('createdAt', 'desc'),
          limit(251),
        ),
      ),
    );
    expect(ownerLedger.docs).toHaveLength(2);

    const ownerComms = await assertSucceeds(
      getDocs(
        query(
          collection(ownerDb, 'businesses', BIZ_ID, 'commissionEntries'),
          where('dateKey', '>=', '2026-11-01'),
          where('dateKey', '<=', '2026-11-30'),
          orderBy('dateKey', 'desc'),
          orderBy('createdAt', 'desc'),
          limit(251),
        ),
      ),
    );
    expect(ownerComms.docs).toHaveLength(2);

    // 2. Operator queries ONLY assigned studio bookings + own UID commissions
    const opABookings = await assertSucceeds(
      getDocs(
        query(
          collection(opADb, 'businesses', BIZ_ID, 'bookings'),
          where('studioId', 'in', ['studio-a']),
          where('dateKey', '>=', '2026-11-01'),
          where('dateKey', '<=', '2026-11-30'),
          orderBy('dateKey', 'asc'),
          orderBy('startAt', 'asc'),
          limit(251),
        ),
      ),
    );
    expect(opABookings.docs).toHaveLength(1);

    const opAComms = await assertSucceeds(
      getDocs(
        query(
          collection(opADb, 'businesses', BIZ_ID, 'commissionEntries'),
          where('operatorUid', '==', OP_A_UID),
          where('dateKey', '>=', '2026-11-01'),
          where('dateKey', '<=', '2026-11-30'),
          orderBy('dateKey', 'desc'),
          orderBy('createdAt', 'desc'),
          limit(251),
        ),
      ),
    );
    expect(opAComms.docs).toHaveLength(1);

    // 3. Operator CANNOT read global bookings, unassigned studio-b bookings, ledgerEntries, or OP_B commissions
    await assertFails(getDocs(collection(opADb, 'businesses', BIZ_ID, 'bookings')));
    await assertFails(
      getDocs(
        query(
          collection(opADb, 'businesses', BIZ_ID, 'bookings'),
          where('studioId', '==', 'studio-b'),
        ),
      ),
    );
    await assertFails(getDocs(collection(opADb, 'businesses', BIZ_ID, 'ledgerEntries')));
    await assertFails(
      getDocs(
        query(
          collection(opADb, 'businesses', BIZ_ID, 'commissionEntries'),
          where('operatorUid', '==', OP_B_UID),
        ),
      ),
    );
  });
});
