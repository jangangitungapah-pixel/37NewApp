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

function makeOperationContext({
  bookingId,
  studioId,
  actorUid,
  actorRole,
  operationType,
  action,
  resultBookingStatus,
  resultSessionStatus,
}) {
  const operationId = `${operationType.replace(/[^a-zA-Z0-9_-]/g, '_')}__${action}__${bookingId}`;
  const requestId = `request-${action}-${bookingId}`;
  const payloadHash = 'a'.repeat(64);
  return {
    operationId,
    requestId,
    payloadHash,
    marker: {
      operationId,
      requestId,
      payloadHash,
      operationType,
      action,
      businessId: BIZ_ID,
      bookingId,
      studioId,
      actorUid,
      actorRole,
      resultBookingStatus,
      resultSessionStatus,
      schemaVersion: 1,
      createdAt: serverTimestamp(),
    },
  };
}

function makeBookingPayload({
  bookingId,
  studioId,
  actorUid,
  slotPlan,
  status = 'CONFIRMED',
  discountMinor = 0,
  totalMinor = 300000,
  operationContext = null,
}) {
  const sessionStatus = status === 'PENDING_CONFIRMATION' ? 'PENDING' : 'UPCOMING';
  const op = operationContext || makeOperationContext({
    bookingId,
    studioId,
    actorUid,
    actorRole: actorUid === OWNER_UID ? 'owner' : 'operator',
    operationType: 'booking.create',
    action: 'create',
    resultBookingStatus: status,
    resultSessionStatus: sessionStatus,
  });

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
    sessionStatus,
    lastOperationId: op.operationId,
    lastOperationType: 'booking.create',
    lastOperationPayloadHash: op.payloadHash,
    studioSnapshot: { studioId, name: studioId.toUpperCase(), code: studioId.toUpperCase(), timezone: 'Asia/Jakarta' },
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
    checkedInByUid: null,
    checkedInByName: null,
    actualStartAt: null,
    actualStartByUid: null,
    actualStartByName: null,
    actualEndAt: null,
    actualEndByUid: null,
    actualEndByName: null,
    actualDurationMinutes: null,
    noShowAt: null,
    noShowByUid: null,
    noShowByName: null,
    noShowReason: null,
    lastSessionEventId: null,
    lastSessionEventAt: null,
    lastSessionEventType: null,
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

function stageBookingCreate(tx, dbClient, {
  bookingId,
  studioId,
  actorUid,
  actorRole = actorUid === OWNER_UID ? 'owner' : 'operator',
  slotPlan,
  status = 'CONFIRMED',
  discountMinor = 0,
  totalMinor = 300000,
  slotSnapshots = [],
}) {
  const sessionStatus = status === 'PENDING_CONFIRMATION' ? 'PENDING' : 'UPCOMING';
  const operationContext = makeOperationContext({
    bookingId,
    studioId,
    actorUid,
    actorRole,
    operationType: 'booking.create',
    action: 'create',
    resultBookingStatus: status,
    resultSessionStatus: sessionStatus,
  });
  tx.set(
    doc(dbClient, 'businesses', BIZ_ID, 'bookings', bookingId),
    makeBookingPayload({
      bookingId, studioId, actorUid, slotPlan, status,
      discountMinor, totalMinor, operationContext,
    }),
  );

  slotPlan.allSlots.forEach((slot, index) => {
    const slotRef = doc(dbClient, 'businesses', BIZ_ID, 'bookingSlots', slot.slotId);
    const payload = makeSlotPayload({ slot, bookingId, actorUid });
    if (slotSnapshots[index]?.exists()) tx.update(slotRef, payload);
    else tx.set(slotRef, payload);
  });

  tx.set(
    doc(dbClient, 'businesses', BIZ_ID, 'bookingOperations', operationContext.operationId),
    operationContext.marker,
  );

  const activityId = `booking.created__${bookingId}`;
  tx.set(doc(dbClient, 'businesses', BIZ_ID, 'activityLogs', activityId), {
    eventId: activityId,
    businessId: BIZ_ID,
    studioId,
    eventType: 'booking.created',
    entityType: 'booking',
    entityId: bookingId,
    operationId: activityId,
    actorUid,
    actorRole,
    beforeStatus: null,
    afterStatus: status,
    reason: null,
    summary: `Booking ${bookingId} dibuat`,
    schemaVersion: 1,
    createdAt: serverTimestamp(),
  });
}

async function runSessionTransition(dbClient, {
  bookingId,
  actorUid,
  actorRole = actorUid === OWNER_UID ? 'owner' : 'operator',
  action,
  reason = null,
}) {
  const resultByAction = {
    check_in: { bookingStatus: 'CONFIRMED', sessionStatus: 'UPCOMING' },
    start: { bookingStatus: 'CONFIRMED', sessionStatus: 'IN_PROGRESS' },
    complete: { bookingStatus: 'COMPLETED_PENDING_SETTLEMENT', sessionStatus: 'COMPLETED' },
    no_show: { bookingStatus: 'NO_SHOW', sessionStatus: 'NO_SHOW' },
    cancel: { bookingStatus: 'CANCELLED', sessionStatus: 'CANCELLED' },
    reject: { bookingStatus: 'REJECTED', sessionStatus: 'CANCELLED' },
  };
  const result = resultByAction[action];
  if (!result) throw new Error(`Unsupported test action: ${action}`);

  const operationContext = makeOperationContext({
    bookingId,
    studioId: 'studio-a',
    actorUid,
    actorRole,
    operationType: 'booking.session',
    action,
    resultBookingStatus: result.bookingStatus,
    resultSessionStatus: result.sessionStatus,
  });

  return runTransaction(dbClient, async (tx) => {
    const bookingRef = doc(dbClient, 'businesses', BIZ_ID, 'bookings', bookingId);
    const operationRef = doc(dbClient, 'businesses', BIZ_ID, 'bookingOperations', operationContext.operationId);
    const eventRef = doc(dbClient, 'businesses', BIZ_ID, 'bookingSessionEvents', operationContext.operationId);
    const [bookingSnap, operationSnap] = await Promise.all([
      tx.get(bookingRef),
      tx.get(operationRef),
    ]);
    if (!bookingSnap.exists()) throw new Error('booking-not-found');
    if (operationSnap.exists()) return;

    const booking = bookingSnap.data();
    const fromStatus = booking.sessionStatus || (booking.status === 'PENDING_CONFIRMATION' ? 'PENDING' : 'UPCOMING');
    const slotRefs = ['cancel', 'reject', 'no_show'].includes(action)
      ? (booking.slotIds || []).map((slotId) => doc(dbClient, 'businesses', BIZ_ID, 'bookingSlots', slotId))
      : [];
    const slotSnapshots = await Promise.all(slotRefs.map((ref) => tx.get(ref)));

    const bookingUpdate = {
      status: result.bookingStatus,
      sessionStatus: result.sessionStatus,
      lastSessionEventId: operationContext.operationId,
      lastSessionEventAt: serverTimestamp(),
      lastSessionEventType: action,
      lastOperationId: operationContext.operationId,
      lastOperationType: 'booking.session',
      lastOperationPayloadHash: operationContext.payloadHash,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    };

    if (action === 'check_in') {
      bookingUpdate.checkedInAt = serverTimestamp();
      bookingUpdate.checkedInByUid = actorUid;
      bookingUpdate.checkedInByName = 'Test Actor';
    } else if (action === 'start') {
      bookingUpdate.actualStartAt = serverTimestamp();
      bookingUpdate.actualStartByUid = actorUid;
      bookingUpdate.actualStartByName = 'Test Actor';
    } else if (action === 'complete') {
      const actualStart = booking.actualStartAt?.toDate?.() || new Date();
      bookingUpdate.actualEndAt = serverTimestamp();
      bookingUpdate.actualEndByUid = actorUid;
      bookingUpdate.actualEndByName = 'Test Actor';
      bookingUpdate.actualDurationMinutes = Math.max(0, Math.floor((Date.now() - actualStart.getTime()) / 60000));
      bookingUpdate.completedAt = serverTimestamp();
    } else if (action === 'no_show') {
      bookingUpdate.noShowAt = serverTimestamp();
      bookingUpdate.noShowByUid = actorUid;
      bookingUpdate.noShowByName = 'Test Actor';
      bookingUpdate.noShowReason = reason;
    } else {
      bookingUpdate.cancelReason = reason;
      bookingUpdate.cancelledBy = actorUid;
      bookingUpdate.cancelledAt = serverTimestamp();
    }

    tx.update(bookingRef, bookingUpdate);

    if (slotRefs.length) {
      for (let index = 0; index < slotRefs.length; index += 1) {
        const snap = slotSnapshots[index];
        if (snap.exists() && snap.data().status === 'active' && snap.data().bookingId === bookingId) {
          tx.update(slotRefs[index], {
            status: 'released',
            bookingId: null,
            releasedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedBy: actorUid,
          });
        }
      }
    }

    tx.set(eventRef, {
      eventId: operationContext.operationId,
      businessId: BIZ_ID,
      bookingId,
      studioId: booking.studioId,
      action,
      fromStatus,
      toStatus: result.sessionStatus,
      actorUid,
      actorRole,
      actorName: 'Test Actor',
      reason,
      operationId: operationContext.operationId,
      requestId: operationContext.requestId,
      payloadHash: operationContext.payloadHash,
      schemaVersion: 1,
      createdAt: serverTimestamp(),
    });
    tx.set(operationRef, operationContext.marker);
  });
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

    const members = [
      {
        uid: OWNER_UID,
        email: 'owner@37musicstudio.test',
        displayName: 'Studio Owner',
        role: 'owner',
        assignedStudioIds: [],
        permissions: { canManageBookings: true },
      },
      {
        uid: OP_A_UID,
        email: 'operator-a@37musicstudio.test',
        displayName: 'Operator Studio A',
        role: 'operator',
        assignedStudioIds: ['studio-a'],
        permissions: { canManageBookings: true },
      },
      {
        uid: OP_RESTRICTED_UID,
        email: 'operator-restricted@37musicstudio.test',
        displayName: 'Restricted Operator',
        role: 'operator',
        assignedStudioIds: [],
        permissions: { canManageBookings: true },
      },
    ];

    await Promise.all(members.map((member) => setDoc(
      doc(adminDb, 'businesses', BIZ_ID, 'members', member.uid),
      {
        ...member,
        businessId: BIZ_ID,
        status: 'active',
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      },
    )));

    const studios = [
      { studioId: 'studio-a', name: 'Studio A (Main)', code: 'STUDIO-A', slotGranularityMinutes: 15 },
      { studioId: 'studio-b', name: 'Studio B (Mixing)', code: 'STUDIO-B', slotGranularityMinutes: 30 },
    ];

    await Promise.all(studios.map((studio) => setDoc(
      doc(adminDb, 'businesses', BIZ_ID, 'studios', studio.studioId),
      {
        ...studio,
        businessId: BIZ_ID,
        status: 'active',
        timezone: 'Asia/Jakarta',
        operatingHours: { openTime: '10:00', closeTime: '22:00' },
        description: studio.name,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      },
    )));
  });
}

describe('Phase 10 booking/session Firestore Rules & atomic transactions', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'musicstudio37app-phase10-rules',
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
    if (testEnv) await testEnv.cleanup();
  });

  it('creates booking + slot locks + operation marker atomically, releases them on cancel, and reclaims released slots only with a new booking', async () => {
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

    await assertSucceeds(runTransaction(ownerDb, async (tx) => {
      const bookingRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-1');
      await tx.get(bookingRef);
      const slotRefs = plan1.allSlots.map((slot) => doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', slot.slotId));
      const slotSnapshots = await Promise.all(slotRefs.map((ref) => tx.get(ref)));
      stageBookingCreate(tx, ownerDb, {
        bookingId: 'bk-1', studioId: 'studio-a', actorUid: OWNER_UID,
        slotPlan: plan1, slotSnapshots,
      });
    }));

    const hijackId = 'studio-a__2026-11-20__60';
    await assertFails(updateDoc(doc(opADb, 'businesses', BIZ_ID, 'bookingSlots', hijackId), {
      bookingId: 'bk-hijack',
      status: 'active',
      updatedBy: OP_A_UID,
      updatedAt: serverTimestamp(),
    }));

    const orphanPlan = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '20:00',
      durationMinutes: 60,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
    });
    const orphanSlot = orphanPlan.allSlots[0];
    await assertFails(setDoc(
      doc(opADb, 'businesses', BIZ_ID, 'bookingSlots', orphanSlot.slotId),
      makeSlotPayload({ slot: orphanSlot, bookingId: 'bk-missing-companion', actorUid: OP_A_UID }),
    ));

    await assertSucceeds(runSessionTransition(ownerDb, {
      bookingId: 'bk-1',
      actorUid: OWNER_UID,
      action: 'cancel',
      reason: 'Band batal',
    }));

    const plan2 = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '15:00',
      durationMinutes: 60,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });
    await assertSucceeds(runTransaction(opADb, async (tx) => {
      const bookingRef = doc(opADb, 'businesses', BIZ_ID, 'bookings', 'bk-2');
      await tx.get(bookingRef);
      const refs = plan2.allSlots.map((slot) => doc(opADb, 'businesses', BIZ_ID, 'bookingSlots', slot.slotId));
      const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
      stageBookingCreate(tx, opADb, {
        bookingId: 'bk-2', studioId: 'studio-a', actorUid: OP_A_UID,
        slotPlan: plan2, slotSnapshots: snapshots,
      });
    }));

    const claimed = await getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', hijackId));
    expect(claimed.data().status).toBe('active');
    expect(claimed.data().bookingId).toBe('bk-2');
    const cancelEvent = await getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookingSessionEvents', 'booking_session__cancel__bk-1'));
    expect(cancelEvent.exists()).toBe(true);
  });

  it('rejects an initial booking/session status mismatch even when the operation marker matches the written document', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const bookingId = 'bk-invalid-initial-session-state';
    const plan = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '20:00',
      durationMinutes: 60,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
    });
    const operationContext = makeOperationContext({
      bookingId,
      studioId: 'studio-a',
      actorUid: OWNER_UID,
      actorRole: 'owner',
      operationType: 'booking.create',
      action: 'create',
      resultBookingStatus: 'CONFIRMED',
      resultSessionStatus: 'COMPLETED',
    });

    await assertFails(runTransaction(ownerDb, async (tx) => {
      const bookingRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookings', bookingId);
      const operationRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookingOperations', operationContext.operationId);
      const [bookingSnap, operationSnap] = await Promise.all([
        tx.get(bookingRef),
        tx.get(operationRef),
      ]);
      expect(bookingSnap.exists()).toBe(false);
      expect(operationSnap.exists()).toBe(false);

      tx.set(bookingRef, {
        ...makeBookingPayload({
          bookingId,
          studioId: 'studio-a',
          actorUid: OWNER_UID,
          slotPlan: plan,
          operationContext,
        }),
        sessionStatus: 'COMPLETED',
      });
      tx.set(operationRef, operationContext.marker);
    }));

    expect((await getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookings', bookingId))).exists()).toBe(false);
    expect((await getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookingOperations', operationContext.operationId))).exists()).toBe(false);
  });

  it('documents the accepted Option A residual risk: a trusted member can directly write a booking and marker without the complete slot set', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const plan = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '20:00',
      durationMinutes: 60,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
    });
    const operationContext = makeOperationContext({
      bookingId: 'bk-direct-accepted-risk',
      studioId: 'studio-a',
      actorUid: OWNER_UID,
      actorRole: 'owner',
      operationType: 'booking.create',
      action: 'create',
      resultBookingStatus: 'CONFIRMED',
      resultSessionStatus: 'UPCOMING',
    });

    // This deliberately bypasses the official repository and writes only the
    // booking + its marker. Option A explicitly accepts that Rules cannot
    // iterate all arbitrary slotIds and prove every lock exists.
    await assertSucceeds(runTransaction(ownerDb, async (tx) => {
      const bookingRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-direct-accepted-risk');
      const operationRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookingOperations', operationContext.operationId);
      const [bookingSnap, operationSnap] = await Promise.all([
        tx.get(bookingRef),
        tx.get(operationRef),
      ]);
      expect(bookingSnap.exists()).toBe(false);
      expect(operationSnap.exists()).toBe(false);
      tx.set(bookingRef, makeBookingPayload({
        bookingId: 'bk-direct-accepted-risk',
        studioId: 'studio-a',
        actorUid: OWNER_UID,
        slotPlan: plan,
        operationContext,
      }));
      tx.set(operationRef, operationContext.marker);
    }));

    const booking = await getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-direct-accepted-risk'));
    expect(booking.exists()).toBe(true);
    for (const slotId of plan.slotIds) {
      const slot = await getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', slotId));
      expect(slot.exists()).toBe(false);
    }
  });

  it('supports 32-slot Operator reservations within assigned studio and denies unscoped or direct booking writes', async () => {
    const opADb = testEnv.authenticatedContext(OP_A_UID).firestore();
    const opRestrictedDb = testEnv.authenticatedContext(OP_RESTRICTED_UID).firestore();
    const longPlan = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '10:00',
      durationMinutes: 480,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });
    expect(longPlan.allSlots).toHaveLength(32);

    await assertSucceeds(runTransaction(opADb, async (tx) => {
      const bookingRef = doc(opADb, 'businesses', BIZ_ID, 'bookings', 'bk-long');
      await tx.get(bookingRef);
      const refs = longPlan.allSlots.map((slot) => doc(opADb, 'businesses', BIZ_ID, 'bookingSlots', slot.slotId));
      const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
      stageBookingCreate(tx, opADb, {
        bookingId: 'bk-long', studioId: 'studio-a', actorUid: OP_A_UID,
        slotPlan: longPlan, totalMinor: 1200000, slotSnapshots: snapshots,
      });
    }));

    await assertSucceeds(getDocs(query(
      collection(opADb, 'businesses', BIZ_ID, 'bookings'),
      where('studioId', 'in', ['studio-a']),
      where('dateKey', '>=', DATE_KEY),
      where('dateKey', '<=', DATE_KEY),
      orderBy('dateKey', 'asc'),
      orderBy('startAt', 'asc'),
    )));
    await assertFails(getDocs(collection(opADb, 'businesses', BIZ_ID, 'bookings')));
    await assertFails(setDoc(
      doc(opADb, 'businesses', BIZ_ID, 'bookings', 'bk-direct-no-marker'),
      makeBookingPayload({
        bookingId: 'bk-direct-no-marker',
        studioId: 'studio-a',
        actorUid: OP_A_UID,
        slotPlan: computeBookingSlotPlan({
          studioId: 'studio-a', dateKey: DATE_KEY, startTime: '20:00', durationMinutes: 60,
          operatingHours: { openTime: '10:00', closeTime: '22:00' },
        }),
      }),
    ));
    await assertFails(getDoc(doc(opRestrictedDb, 'businesses', BIZ_ID, 'bookingSlots', 'studio-b__2026-11-20__40')));

    await assertFails(setDoc(
      doc(opADb, 'businesses', BIZ_ID, 'bookings', 'bk-unassigned'),
      makeBookingPayload({
        bookingId: 'bk-unassigned',
        studioId: 'studio-b',
        actorUid: OP_A_UID,
        slotPlan: computeBookingSlotPlan({
          studioId: 'studio-b', dateKey: DATE_KEY, startTime: '10:00', durationMinutes: 60,
          operatingHours: { openTime: '10:00', closeTime: '22:00' },
        }),
      }),
    ));
  });

  it('requires session markers for check-in/start/complete and preserves Finance handoff', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const plan = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '18:00',
      durationMinutes: 60,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });

    await assertSucceeds(runTransaction(ownerDb, async (tx) => {
      const bookingRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-session');
      await tx.get(bookingRef);
      const refs = plan.allSlots.map((slot) => doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', slot.slotId));
      const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
      stageBookingCreate(tx, ownerDb, {
        bookingId: 'bk-session', studioId: 'studio-a', actorUid: OWNER_UID,
        slotPlan: plan, slotSnapshots: snapshots,
      });
    }));

    const bookingRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-session');
    await assertFails(updateDoc(bookingRef, {
      status: 'IN_PROGRESS',
      checkedInAt: serverTimestamp(),
      updatedBy: OWNER_UID,
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(bookingRef, {
      status: 'SETTLED',
      updatedBy: OWNER_UID,
      updatedAt: serverTimestamp(),
    }));

    await assertSucceeds(runSessionTransition(ownerDb, {
      bookingId: 'bk-session', actorUid: OWNER_UID, action: 'check_in',
    }));
    await assertSucceeds(runSessionTransition(ownerDb, {
      bookingId: 'bk-session', actorUid: OWNER_UID, action: 'start',
    }));
    await assertSucceeds(runSessionTransition(ownerDb, {
      bookingId: 'bk-session', actorUid: OWNER_UID, action: 'complete',
    }));

    const booking = (await getDoc(bookingRef)).data();
    expect(booking.status).toBe('COMPLETED_PENDING_SETTLEMENT');
    expect(booking.sessionStatus).toBe('COMPLETED');
    expect(booking.actualStartAt).toBeDefined();
    expect(booking.actualEndAt).toBeDefined();
    expect(booking.actualDurationMinutes).toBeGreaterThanOrEqual(0);

    const eventId = 'booking_session__complete__bk-session';
    const eventRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookingSessionEvents', eventId);
    expect((await getDoc(eventRef)).exists()).toBe(true);
    await assertFails(updateDoc(eventRef, { actorName: 'Tampered' }));
    await assertFails(deleteDoc(eventRef));

    const operationRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookingOperations', eventId);
    expect((await getDoc(operationRef)).exists()).toBe(true);
    await assertFails(updateDoc(operationRef, { payloadHash: 'b'.repeat(64) }));
    await assertFails(deleteDoc(operationRef));

    const activityRef = doc(ownerDb, 'businesses', BIZ_ID, 'activityLogs', 'booking.created__bk-session');
    expect((await getDoc(activityRef)).exists()).toBe(true);
    await assertFails(updateDoc(activityRef, { summary: 'Tampered' }));
    await assertFails(deleteDoc(activityRef));
    await assertSucceeds(updateDoc(bookingRef, {
      status: 'SETTLEMENT_REVIEW',
      updatedBy: OWNER_UID,
      updatedAt: serverTimestamp(),
    }));
  });

  it('cancels an already-started separate session without fabricating an end timestamp and releases owned slots', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const plan = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '17:00',
      durationMinutes: 60,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });

    await assertSucceeds(runTransaction(ownerDb, async (tx) => {
      const bookingRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-cancel-after-start');
      await tx.get(bookingRef);
      const refs = plan.allSlots.map((slot) => doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', slot.slotId));
      const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
      stageBookingCreate(tx, ownerDb, {
        bookingId: 'bk-cancel-after-start',
        studioId: 'studio-a',
        actorUid: OWNER_UID,
        slotPlan: plan,
        slotSnapshots: snapshots,
      });
    }));

    await assertSucceeds(runSessionTransition(ownerDb, {
      bookingId: 'bk-cancel-after-start',
      actorUid: OWNER_UID,
      action: 'start',
    }));
    await assertSucceeds(runSessionTransition(ownerDb, {
      bookingId: 'bk-cancel-after-start',
      actorUid: OWNER_UID,
      action: 'cancel',
      reason: 'Operasional darurat',
    }));

    const booking = (await getDoc(doc(
      ownerDb,
      'businesses',
      BIZ_ID,
      'bookings',
      'bk-cancel-after-start',
    ))).data();
    expect(booking.status).toBe('CANCELLED');
    expect(booking.sessionStatus).toBe('CANCELLED');
    expect(booking.actualStartAt).toBeDefined();
    expect(booking.actualEndAt ?? null).toBeNull();

    const event = await getDoc(doc(
      ownerDb,
      'businesses',
      BIZ_ID,
      'bookingSessionEvents',
      'booking_session__cancel__bk-cancel-after-start',
    ));
    expect(event.exists()).toBe(true);
    expect(event.data().fromStatus).toBe('IN_PROGRESS');
    expect(event.data().toStatus).toBe('CANCELLED');

    for (const slotId of plan.slotIds) {
      const slot = (await getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', slotId))).data();
      expect(slot.status).toBe('released');
      expect(slot.bookingId).toBeNull();
    }
  });

  it('enforces No-Show grace and releases the complete owned slot set atomically', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const futurePlan = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '19:00',
      durationMinutes: 60,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });
    await assertSucceeds(runTransaction(ownerDb, async (tx) => {
      const bookingRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-no-show-early');
      await tx.get(bookingRef);
      const refs = futurePlan.allSlots.map((slot) => doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', slot.slotId));
      const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
      stageBookingCreate(tx, ownerDb, {
        bookingId: 'bk-no-show-early', studioId: 'studio-a', actorUid: OWNER_UID,
        slotPlan: futurePlan, slotSnapshots: snapshots,
      });
    }));
    await assertFails(runSessionTransition(ownerDb, {
      bookingId: 'bk-no-show-early',
      actorUid: OWNER_UID,
      action: 'no_show',
      reason: 'Tidak hadir',
    }));

    const pastPlan = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: '2026-11-16',
      startTime: '19:00',
      durationMinutes: 60,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });
    await assertSucceeds(runTransaction(ownerDb, async (tx) => {
      const bookingRef = doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-no-show-valid');
      await tx.get(bookingRef);
      const refs = pastPlan.allSlots.map((slot) => doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', slot.slotId));
      const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
      stageBookingCreate(tx, ownerDb, {
        bookingId: 'bk-no-show-valid', studioId: 'studio-a', actorUid: OWNER_UID,
        slotPlan: pastPlan, slotSnapshots: snapshots,
      });
    }));
    await assertSucceeds(runSessionTransition(ownerDb, {
      bookingId: 'bk-no-show-valid',
      actorUid: OWNER_UID,
      action: 'no_show',
      reason: 'Customer tidak hadir',
    }));
    const booking = (await getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookings', 'bk-no-show-valid'))).data();
    expect(booking.status).toBe('NO_SHOW');
    expect(booking.sessionStatus).toBe('NO_SHOW');
    for (const slotId of pastPlan.slotIds) {
      const slot = (await getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', slotId))).data();
      expect(slot.status).toBe('released');
      expect(slot.bookingId).toBeNull();
    }
  });

  it('serializes concurrent overlapping creates and validates reschedule slot swaps with operation markers', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opADb = testEnv.authenticatedContext(OP_A_UID).firestore();
    const initialPlan = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '12:00',
      durationMinutes: 60,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });

    const attemptCreate = (dbClient, bookingId, actorUid, actorRole) => runTransaction(dbClient, async (tx) => {
      const bookingRef = doc(dbClient, 'businesses', BIZ_ID, 'bookings', bookingId);
      await tx.get(bookingRef);
      const refs = initialPlan.allSlots.map((slot) => doc(dbClient, 'businesses', BIZ_ID, 'bookingSlots', slot.slotId));
      const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
      if (snapshots.some((snap) => snap.exists() && snap.data().status === 'active')) {
        throw new Error('slot-conflict');
      }
      stageBookingCreate(tx, dbClient, {
        bookingId,
        studioId: 'studio-a',
        actorUid,
        actorRole,
        slotPlan: initialPlan,
        slotSnapshots: snapshots,
      });
    });

    const [resOwner, resOp] = await Promise.allSettled([
      attemptCreate(ownerDb, 'bk-race-owner', OWNER_UID, 'owner'),
      attemptCreate(opADb, 'bk-race-op', OP_A_UID, 'operator'),
    ]);
    expect([resOwner, resOp].filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect([resOwner, resOp].filter((item) => item.status === 'rejected')).toHaveLength(1);

    const winnerIsOwner = resOwner.status === 'fulfilled';
    const winnerDb = winnerIsOwner ? ownerDb : opADb;
    const winnerUid = winnerIsOwner ? OWNER_UID : OP_A_UID;
    const winnerRole = winnerIsOwner ? 'owner' : 'operator';
    const winnerBookingId = winnerIsOwner ? 'bk-race-owner' : 'bk-race-op';
    const shiftedPlan = computeBookingSlotPlan({
      studioId: 'studio-a',
      dateKey: DATE_KEY,
      startTime: '12:30',
      durationMinutes: 60,
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    });

    await assertSucceeds(runTransaction(winnerDb, async (tx) => {
      const bookingRef = doc(winnerDb, 'businesses', BIZ_ID, 'bookings', winnerBookingId);
      const bookingSnap = await tx.get(bookingRef);
      const current = bookingSnap.data();
      const unionIds = Array.from(new Set([...current.slotIds, ...shiftedPlan.slotIds]));
      const refs = new Map(unionIds.map((id) => [id, doc(winnerDb, 'businesses', BIZ_ID, 'bookingSlots', id)]));
      const snapshotsArray = await Promise.all(unionIds.map((id) => tx.get(refs.get(id))));
      const snapshotMap = new Map(unionIds.map((id, index) => [id, snapshotsArray[index]]));
      const operationContext = makeOperationContext({
        bookingId: winnerBookingId,
        studioId: 'studio-a',
        actorUid: winnerUid,
        actorRole: winnerRole,
        operationType: 'booking.reschedule',
        action: 'reschedule',
        resultBookingStatus: current.status,
        resultSessionStatus: current.sessionStatus,
      });

      const nextCount = current.rescheduleCount + 1;
      tx.update(bookingRef, {
        dateKey: shiftedPlan.dateKey,
        timezone: shiftedPlan.timezone,
        startTime: shiftedPlan.startTime,
        endTime: shiftedPlan.endTime,
        durationMinutes: shiftedPlan.durationMinutes,
        bufferMinutes: shiftedPlan.bufferMinutes,
        startAt: Timestamp.fromDate(shiftedPlan.startAt),
        endAt: Timestamp.fromDate(shiftedPlan.endAt),
        slotIds: shiftedPlan.slotIds,
        rescheduleCount: nextCount,
        lastOperationId: operationContext.operationId,
        lastOperationType: 'booking.reschedule',
        lastOperationPayloadHash: operationContext.payloadHash,
        updatedBy: winnerUid,
        updatedAt: serverTimestamp(),
      });

      const nextSet = new Set(shiftedPlan.slotIds);
      const oldSet = new Set(current.slotIds);
      for (const oldId of current.slotIds) {
        if (!nextSet.has(oldId)) {
          const snap = snapshotMap.get(oldId);
          if (snap.exists() && snap.data().status === 'active' && snap.data().bookingId === winnerBookingId) {
            tx.update(refs.get(oldId), {
              status: 'released',
              bookingId: null,
              releasedAt: serverTimestamp(),
              updatedBy: winnerUid,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
      for (const newSlot of shiftedPlan.allSlots) {
        const snap = snapshotMap.get(newSlot.slotId);
        if (!oldSet.has(newSlot.slotId) || (snap.exists() && snap.data().status === 'released')) {
          const ref = refs.get(newSlot.slotId);
          const payload = makeSlotPayload({ slot: newSlot, bookingId: winnerBookingId, actorUid: winnerUid });
          if (snap.exists()) tx.update(ref, payload);
          else tx.set(ref, payload);
        }
      }

      tx.set(
        doc(winnerDb, 'businesses', BIZ_ID, 'bookingOperations', operationContext.operationId),
        operationContext.marker,
      );
    }));

    const releasedSnap = await getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', 'studio-a__2026-11-20__48'));
    const claimedSnap = await getDoc(doc(ownerDb, 'businesses', BIZ_ID, 'bookingSlots', 'studio-a__2026-11-20__52'));
    expect(releasedSnap.data().status).toBe('released');
    expect(releasedSnap.data().bookingId).toBeNull();
    expect(claimedSnap.data().status).toBe('active');
    expect(claimedSnap.data().bookingId).toBe(winnerBookingId);
  });
});
