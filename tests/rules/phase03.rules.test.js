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
import { computeBookingSlotPlan } from '../../src/domain/calculations/slotGenerator.js';

let testEnv;

const RULES_PATH = resolve(process.cwd(), 'firestore.rules');
const BIZ_ID = 'studio-37-main';
const OWNER_UID = 'owner-uid-1';
const OP_A_UID = 'operator-a-uid';
const OP_RESTRICTED_UID = 'operator-restricted-uid';
const DATE_KEY = '2026-11-20';

function makeBookingPayload({
  bookingId,
  studioId,
  actorUid,
  slotPlan,
  status = 'CONFIRMED',
  discountMinor = 0,
  totalMinor = 300000,
}) {
  return {
    bookingId,
    businessId: BIZ_ID,
    studioId,
    serviceId: 'svc-rehearsal',
    customerId: 'cust-1',
    operatorUid: actorUid,
    dateKey: slotPlan.dateKey,
    timezone: 'Asia/Jakarta',
    startTime: slotPlan.startTime,
    endTime: slotPlan.endTime,
    durationMinutes: slotPlan.durationMinutes,
    bufferMinutes: slotPlan.bufferMinutes,
    startAt: Timestamp.fromDate(slotPlan.startAt),
    endAt: Timestamp.fromDate(slotPlan.endAt),
    slotIds: slotPlan.slotIds,
    status,
    studioSnapshot: { studioId, name: studioId.toUpperCase(), code: studioId.toUpperCase() },
    serviceSnapshot: { serviceId: 'svc-rehearsal', name: 'Rehearsal', configVersion: 1 },
    customerSnapshot: { customerId: 'cust-1', name: 'Band Satu', phone: '08123456789' },
    priceSnapshot: {
      currency: 'IDR',
      baseSubtotalMinor: totalMinor + discountMinor,
      discountMinor,
      totalMinor,
    },
    commissionSnapshot: { currency: 'IDR', method: 'percentage', amountMinor: 30000 },
    notes: null,
    cancelReason: null,
    cancelledBy: null,
    cancelledAt: null,
    checkedInAt: null,
    completedAt: null,
    rescheduleCount: 0,
    schemaVersion: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: actorUid,
    updatedBy: actorUid,
  };
}

function makeSlotPayload({ slot, bookingId, actorUid }) {
  return {
    slotId: slot.slotId,
    businessId: BIZ_ID,
    studioId: slot.slotId.split('__')[0],
    dateKey: slot.slotId.split('__')[1],
    bucketIndex: slot.bucketIndex,
    slotTime: slot.slotTime,
    kind: slot.kind,
    status: 'active',
    bookingId,
    slotStartAt: Timestamp.fromDate(slot.slotStartAt),
    slotEndAt: Timestamp.fromDate(slot.slotEndAt),
    reservedBy: actorUid,
    reservedAt: serverTimestamp(),
    releasedAt: null,
    schemaVersion: 1,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}

async function seedTenantForPhase03() {
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

    await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'settings', 'pricing'), {
      settingId: 'pricing',
      businessId: BIZ_ID,
      currency: 'IDR',
      taxPercent: 0,
      allowOperatorDiscount: false,
      roundingUnitMinor: 1,
      configVersion: 1,
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
      permissions: { canManageBookings: true, canApplyDiscount: true },
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'members', OP_A_UID), {
      uid: OP_A_UID,
      businessId: BIZ_ID,
      email: 'op-a@test.id',
      displayName: 'Operator Studio A',
      role: 'operator',
      status: 'active',
      assignedStudioIds: ['studio-a'],
      permissions: { canManageBookings: true, canManageCustomers: true, canApplyDiscount: true },
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'members', OP_RESTRICTED_UID), {
      uid: OP_RESTRICTED_UID,
      businessId: BIZ_ID,
      email: 'op-rest@test.id',
      displayName: 'Operator Restricted',
      role: 'operator',
      status: 'active',
      assignedStudioIds: ['studio-b'],
      permissions: { canManageBookings: false },
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    for (const studioId of ['studio-a', 'studio-b']) {
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
  });
}

describe('Phase 03 Firestore Security Rules & Atomic Transactions', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'musicstudio37app-phase03-rules',
      firestore: {
        rules: readFileSync(RULES_PATH, 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedTenantForPhase03();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it('prevents overlapping double booking, blocks active slot hijacking, and supports atomic release + re-claim', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opADb = testEnv.authenticatedContext(OP_A_UID).firestore();

    const plan1 = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '14:00',
      durationMinutes: 90,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });

    // Booking 1 claims 14:00-15:30 (6 deterministic slots)
    await assertSucceeds(
      runTransaction(ownerDb, async (tx) => {
        const bkRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-1');
        const slotRefs = plan1.allSlots.map((s) =>
          doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', s.slotId),
        );
        await tx.get(bkRef);
        await Promise.all(slotRefs.map((ref) => tx.get(ref)));

        tx.set(bkRef, makeBookingPayload({ bookingId: 'bk-1', studioId: 'studio-a', actorUid: OWNER_UID, slotPlan: plan1 }));
        plan1.allSlots.forEach((slot, i) => {
          tx.set(slotRefs[i], makeSlotPayload({ slot, bookingId: 'bk-1', actorUid: OWNER_UID }));
        });
        tx.set(doc(ownerDb, 'businesses', BIZ_ID, 'activityLogs', 'booking.created__bk-1'), {
          eventId: 'booking.created__bk-1',
          businessId: BIZ_ID,
          studioId: 'studio-a',
          eventType: 'booking.created',
          entityType: 'booking',
          entityId: 'bk-1',
          operationId: 'booking.created__bk-1',
          actorUid: OWNER_UID,
          actorRole: 'owner',
          beforeStatus: null,
          afterStatus: 'CONFIRMED',
          reason: null,
          summary: 'Booking 1 dibuat',
          schemaVersion: 1,
          createdAt: serverTimestamp(),
        });
      }),
    );

    // Concurrent/rogue overwrite of already-active slot 15:00 (`__60`) by another booking FAILS in Rules
    const overlapSlotId = 'studio-a__2026-11-20__60';
    await assertFails(
      updateDoc(doc(opADb, 'businesses', BIZ_ID, 'bookingSlots', overlapSlotId), {
        bookingId: 'bk-hijack',
        status: 'active',
        updatedBy: OP_A_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    // Cancel bk-1 atomically releasing slots ('active' -> 'released', bookingId: null)
    await assertSucceeds(
      runTransaction(ownerDb, async (tx) => {
        const bkRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-1');
        tx.update(bkRef, {
          status: 'CANCELLED',
          cancelReason: 'Band batal',
          cancelledBy: OWNER_UID,
          cancelledAt: serverTimestamp(),
          updatedBy: OWNER_UID,
          updatedAt: serverTimestamp(),
        });
        for (const sId of plan1.slotIds) {
          tx.update(doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', sId), {
            status: 'released',
            bookingId: null,
            releasedAt: serverTimestamp(),
            updatedBy: OWNER_UID,
            updatedAt: serverTimestamp(),
          });
        }
      }),
    );

    // Another booking bk-2 can now atomically re-claim previously released slot 15:00
    await assertSucceeds(
      updateDoc(doc(opADb, 'businesses', BIZ_ID, 'bookingSlots', overlapSlotId), {
        bookingId: 'bk-2',
        status: 'active',
        reservedBy: OP_A_UID,
        reservedAt: serverTimestamp(),
        releasedAt: null,
        updatedBy: OP_A_UID,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('allows long 8-hour (32-slot) Operator booking on assigned studio while strictly blocking cross-studio & revoked access', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opADb = testEnv.authenticatedContext(OP_A_UID).firestore();
    const opRestrictedDb = testEnv.authenticatedContext(OP_RESTRICTED_UID).firestore();

    // 8-hour session = 32 contiguous 15-min slots (proves tx stays well under Rules get/exists limits)
    const longPlan = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '10:00',
      durationMinutes: 480,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });
    expect(longPlan.allSlots).toHaveLength(32);

    await assertSucceeds(
      runTransaction(opADb, async (tx) => {
        const bkRef = doc(opADb, 'businesses', BIZ_ID, 'bookings', 'bk-long');
        const slotRefs = longPlan.allSlots.map((s) =>
          doc(opADb, 'businesses', BIZ_ID, 'bookingSlots', s.slotId),
        );
        // Reads non-existent slots using split('__')[0] Rule support
        await Promise.all(slotRefs.map((ref) => tx.get(ref)));

        tx.set(bkRef, makeBookingPayload({ bookingId: 'bk-long', studioId: 'studio-a', actorUid: OP_A_UID, slotPlan: longPlan, totalMinor: 1200000 }));
        longPlan.allSlots.forEach((slot, i) => {
          tx.set(slotRefs[i], makeSlotPayload({ slot, bookingId: 'bk-long', actorUid: OP_A_UID }));
        });
      }),
    );

    // Scoped list queries succeed on studio-a; unfiltered list or studio-b fail for Operator A
    await assertSucceeds(
      getDocs(
        query(
          collection(opADb, 'businesses', BIZ_ID, 'bookings'),
          where('studioId', 'in', ['studio-a']),
          where('dateKey', '>=', DATE_KEY),
          where('dateKey', '<=', DATE_KEY),
          orderBy('dateKey', 'asc'),
          orderBy('startAt', 'asc'),
        ),
      ),
    );
    await assertFails(getDocs(collection(opADb, 'businesses', BIZ_ID, 'bookings')));
    await assertFails(
      setDoc(
        doc(opADb, 'businesses', BIZ_ID, 'bookings', 'bk-unassigned'),
        makeBookingPayload({
          bookingId: 'bk-unassigned',
          studioId: 'studio-b',
          actorUid: OP_A_UID,
          slotPlan: computeBookingSlotPlan({
            studioId: 'studio-b',
            dateKey: DATE_KEY,
            startTime: '10:00',
            durationMinutes: 60,
            operatingHours: { openTime: '10:00', closeTime: '22:00' },
          }),
        }),
      ),
    );

    // Operator without canManageBookings cannot book even on own assigned studio-b
    await assertFails(getDoc(doc(opRestrictedDb, 'businesses', BIZ_ID, 'bookingSlots', 'studio-b__2026-11-20__40')));

    // Owner revokes studio-a from OP_A_UID -> immediate read failure on bk-long
    await assertSucceeds(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'members', OP_A_UID), {
        assignedStudioIds: [],
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(getDoc(doc(opADb, 'businesses', BIZ_ID, 'bookings', 'bk-long')));
  });

  it('enforces discount policy, price snapshot immutability, Phase 04 transition lock, append-only activityLogs, and Phase 04+ locks', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opADb = testEnv.authenticatedContext(OP_A_UID).firestore();

    const plan = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '18:00',
      durationMinutes: 60,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });

    // Operator cannot apply discount when settings/pricing.allowOperatorDiscount is false
    await assertFails(
      setDoc(
        doc(opADb, 'businesses', BIZ_ID, 'bookings', 'bk-disc-fail'),
        makeBookingPayload({
          bookingId: 'bk-disc-fail',
          studioId: 'studio-a',
          actorUid: OP_A_UID,
          slotPlan: plan,
          discountMinor: 50000,
          totalMinor: 100000,
        }),
      ),
    );

    // Owner creates valid booking + append-only activity log
    await assertSucceeds(
      setDoc(
        doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-imm'),
        makeBookingPayload({
          bookingId: 'bk-imm',
          studioId: 'studio-a',
          actorUid: OWNER_UID,
          slotPlan: plan,
          status: 'CONFIRMED',
        }),
      ),
    );
    await assertSucceeds(
      setDoc(doc(ownerDb, 'businesses', BIZ_ID, 'activityLogs', 'ev-imm'), {
        eventId: 'ev-imm',
        businessId: BIZ_ID,
        studioId: 'studio-a',
        eventType: 'booking.created',
        entityType: 'booking',
        entityId: 'bk-imm',
        operationId: 'ev-imm',
        actorUid: OWNER_UID,
        actorRole: 'owner',
        beforeStatus: null,
        afterStatus: 'CONFIRMED',
        reason: null,
        summary: 'Dibuat',
        schemaVersion: 1,
        createdAt: serverTimestamp(),
      }),
    );

    // Owner cannot edit priceSnapshot during status transition, nor jump to SETTLED before Phase 04
    await assertFails(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-imm'), {
        status: 'IN_PROGRESS',
        priceSnapshot: { currency: 'IDR', baseSubtotalMinor: 300000, discountMinor: 0, totalMinor: 1000 },
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-imm'), {
        status: 'SETTLED',
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    // Valid transition CONFIRMED -> IN_PROGRESS -> COMPLETED_PENDING_SETTLEMENT succeeds cleanly
    await assertSucceeds(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-imm'), {
        status: 'IN_PROGRESS',
        checkedInAt: serverTimestamp(),
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-imm'), {
        status: 'COMPLETED_PENDING_SETTLEMENT',
        completedAt: serverTimestamp(),
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    // Hard delete / log overwrite denied; Phase 04+ finance & gallery collections stay locked
    await assertFails(deleteDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-imm')));
    await assertFails(updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'activityLogs', 'ev-imm'), { summary: 'Tampered' }));
    await assertFails(deleteDoc(doc(ownerDb, 'businesses', BIZ_ID, 'activityLogs', 'ev-imm')));
    await assertFails(getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'ledgerEntries', 'led-1')));
    await assertFails(getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'commissionEntries', 'comm-1')));
  });

  it('prevents concurrent race double-booking across two simultaneous clients and executes partial-overlap atomic reschedule', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opADb = testEnv.authenticatedContext(OP_A_UID).firestore();

    const slotPlanInitial = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '12:00',
      durationMinutes: 60,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });

    const attemptConcurrentBook = (dbClient, bookingId, actorUid) =>
      runTransaction(dbClient, async (tx) => {
        const bkRef = doc(dbClient, 'businesses', BIZ_ID, 'bookings', bookingId);
        const slotRefs = slotPlanInitial.allSlots.map((s) =>
          doc(dbClient, 'businesses', BIZ_ID, 'bookingSlots', s.slotId),
        );
        const slotSnaps = await Promise.all(slotRefs.map((r) => tx.get(r)));
        if (slotSnaps.some((s) => s.exists() && s.data().status === 'active')) {
          throw new Error('slot-conflict');
        }
        tx.set(bkRef, makeBookingPayload({ bookingId, studioId: 'studio-a', actorUid, slotPlan: slotPlanInitial }));
        slotPlanInitial.allSlots.forEach((slot, i) => {
          tx.set(slotRefs[i], makeSlotPayload({ slot, bookingId, actorUid }));
        });
      });

    const [resOwner, resOp] = await Promise.allSettled([
      attemptConcurrentBook(ownerDb, 'bk-race-owner', OWNER_UID),
      attemptConcurrentBook(opADb, 'bk-race-op', OP_A_UID),
    ]);

    const fulfilled = [resOwner, resOp].filter((r) => r.status === 'fulfilled');
    const rejected = [resOwner, resOp].filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const winnerIsOwner = resOwner.status === 'fulfilled';
    const winnerDb = winnerIsOwner ? ownerDb : opADb;
    const winnerUid = winnerIsOwner ? OWNER_UID : OP_A_UID;
    const winnerBookingId = winnerIsOwner ? 'bk-race-owner' : 'bk-race-op';

    // Partial-overlap reschedule: 12:00-13:00 (`48..51`) -> 12:30-13:30 (`50..53`)
    const slotPlanShifted = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '12:30',
      durationMinutes: 60,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });

    await assertSucceeds(
      runTransaction(winnerDb, async (tx) => {
        const bkRef = doc(winnerDb, 'businesses', BIZ_ID, 'bookings', winnerBookingId);
        const bkSnap = await tx.get(bkRef);
        const current = bkSnap.data();

        const oldSet = new Set(current.slotIds);
        const newSet = new Set(slotPlanShifted.slotIds);
        const unionIds = Array.from(new Set([...current.slotIds, ...slotPlanShifted.slotIds]));
        const refMap = new Map(
          unionIds.map((id) => [id, doc(winnerDb, 'businesses', BIZ_ID, 'bookingSlots', id)]),
        );
        const snapEntries = await Promise.all(
          unionIds.map(async (id) => [id, await tx.get(refMap.get(id))]),
        );
        const snapMap = new Map(snapEntries);

        tx.update(bkRef, {
          startTime: slotPlanShifted.startTime,
          endTime: slotPlanShifted.endTime,
          startAt: Timestamp.fromDate(slotPlanShifted.startAt),
          endAt: Timestamp.fromDate(slotPlanShifted.endAt),
          slotIds: slotPlanShifted.slotIds,
          rescheduleCount: current.rescheduleCount + 1,
          updatedBy: winnerUid,
          updatedAt: serverTimestamp(),
        });

        for (const oldId of current.slotIds) {
          if (!newSet.has(oldId)) {
            tx.update(refMap.get(oldId), {
              status: 'released',
              bookingId: null,
              releasedAt: serverTimestamp(),
              updatedBy: winnerUid,
              updatedAt: serverTimestamp(),
            });
          }
        }

        for (const newSlot of slotPlanShifted.allSlots) {
          if (!oldSet.has(newSlot.slotId) && !snapMap.get(newSlot.slotId)?.exists()) {
            tx.set(refMap.get(newSlot.slotId), makeSlotPayload({ slot: newSlot, bookingId: winnerBookingId, actorUid: winnerUid }));
          }
        }
      }),
    );

    // Released bucket 48 (12:00) is genuinely released (`bookingId: null`); claimed bucket 52 (13:00) is active
    const releasedSnap = await getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', 'studio-a__2026-11-20__48'));
    const claimedSnap = await getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', 'studio-a__2026-11-20__52'));
    expect(releasedSnap.data().status).toBe('released');
    expect(releasedSnap.data().bookingId).toBeNull();
    expect(claimedSnap.data().status).toBe('active');
    expect(claimedSnap.data().bookingId).toBe(winnerBookingId);
  });
});
