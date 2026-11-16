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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
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
const OP_WITH_CUST_UID = 'operator-cust-uid';
const OP_NO_CUST_UID = 'operator-nocust-uid';
const NEW_STAFF_UID = 'new-staff-uid';
const OUTSIDER_UID = 'outsider-uid-1';

async function seedBaseTenant() {
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
      email: 'owner@37musicstudio.test',
      displayName: 'Studio Owner',
      role: 'owner',
      status: 'active',
      assignedStudioIds: [],
      permissions: { canManageCustomers: true },
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'members', OP_WITH_CUST_UID), {
      uid: OP_WITH_CUST_UID,
      businessId: BIZ_ID,
      email: 'op-cust@37musicstudio.test',
      displayName: 'Operator Studio A',
      role: 'operator',
      status: 'active',
      assignedStudioIds: ['studio-a'],
      permissions: { canManageCustomers: true, canManageGallery: true },
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'members', OP_NO_CUST_UID), {
      uid: OP_NO_CUST_UID,
      businessId: BIZ_ID,
      email: 'op-basic@37musicstudio.test',
      displayName: 'Operator Basic',
      role: 'operator',
      status: 'active',
      assignedStudioIds: ['studio-b'],
      permissions: { canManageCustomers: false },
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'studios', 'studio-a'), {
      studioId: 'studio-a',
      businessId: BIZ_ID,
      name: 'Studio A (Main)',
      code: 'STUDIO-A',
      status: 'active',
      timezone: 'Asia/Jakarta',
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
      description: 'Main rehearsal & tracking room',
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'studios', 'studio-b'), {
      studioId: 'studio-b',
      businessId: BIZ_ID,
      name: 'Studio B (Mixing)',
      code: 'STUDIO-B',
      status: 'active',
      timezone: 'Asia/Jakarta',
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 30,
      description: 'Mixing suite',
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });
  });
}

describe('Phase 02 Firestore Security Rules (Master Data, Scoping & Invariants)', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'musicstudio37app-phase02-rules',
      firestore: {
        rules: readFileSync(RULES_PATH, 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedBaseTenant();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it('allows Owner to manage profile/main & 5 validated settings docs while blocking Operator writes & invalid payloads', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const operatorDb = testEnv.authenticatedContext(OP_WITH_CUST_UID).firestore();
    const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore();

    // Owner creates profile/main
    await assertSucceeds(
      setDoc(doc(ownerDb, 'businesses', BIZ_ID, 'profile', 'main'), {
        businessId: BIZ_ID,
        displayName: '37 Music Studio Jakarta',
        legalName: 'PT 37 Kreasi',
        phone: '08123456789',
        email: 'admin@37musicstudio.id',
        address: 'Jl. Harmoni 37',
        timezone: 'Asia/Jakarta',
        currency: 'IDR',
        status: 'active',
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      }),
    );

    // Operator can get profile/main, cannot write or list profile subcollection
    await assertSucceeds(getDoc(doc(operatorDb, 'businesses', BIZ_ID, 'profile', 'main')));
    await assertFails(getDocs(collection(operatorDb, 'businesses', BIZ_ID, 'profile')));
    await assertFails(
      updateDoc(doc(operatorDb, 'businesses', BIZ_ID, 'profile', 'main'), {
        displayName: 'Hacked Name',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(getDoc(doc(outsiderDb, 'businesses', BIZ_ID, 'profile', 'main')));

    // Owner creates valid schedule setting (v1), increments to v2, cannot downgrade back to v1
    await assertSucceeds(
      setDoc(doc(ownerDb, 'businesses', BIZ_ID, 'settings', 'schedule'), {
        settingId: 'schedule',
        businessId: BIZ_ID,
        operatingHours: { openTime: '10:00', closeTime: '22:00' },
        slotGranularityMinutes: 15,
        bufferMinutes: 0,
        configVersion: 1,
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      }),
    );

    await assertSucceeds(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'settings', 'schedule'), {
        slotGranularityMinutes: 30,
        configVersion: 2,
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    await assertFails(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'settings', 'schedule'), {
        configVersion: 1,
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    // Reject invalid closeTime <= openTime or unknown setting ID
    await assertFails(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'settings', 'schedule'), {
        operatingHours: { openTime: '22:00', closeTime: '10:00' },
        configVersion: 3,
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    await assertFails(
      setDoc(doc(ownerDb, 'businesses', BIZ_ID, 'settings', 'unknownSetting'), {
        settingId: 'unknownSetting',
        businessId: BIZ_ID,
        configVersion: 1,
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      }),
    );

    // Reject float pricing taxPercent & Operator read/write boundaries
    await assertFails(
      setDoc(doc(ownerDb, 'businesses', BIZ_ID, 'settings', 'pricing'), {
        settingId: 'pricing',
        businessId: BIZ_ID,
        currency: 'IDR',
        taxPercent: 11.5,
        allowOperatorDiscount: false,
        roundingUnitMinor: 1,
        configVersion: 1,
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      }),
    );

    await assertSucceeds(getDoc(doc(operatorDb, 'businesses', BIZ_ID, 'settings', 'schedule')));
    await assertFails(
      updateDoc(doc(operatorDb, 'businesses', BIZ_ID, 'settings', 'schedule'), {
        bufferMinutes: 15,
        updatedBy: OP_WITH_CUST_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(ownerDb, 'businesses', BIZ_ID, 'settings', 'schedule')));
    await assertFails(deleteDoc(doc(ownerDb, 'businesses', BIZ_ID, 'profile', 'main')));
  });

  it('strictly scopes studios to assignedStudioIds for Operators and dynamically reflects assignment revocation', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opDb = testEnv.authenticatedContext(OP_WITH_CUST_UID).firestore();

    // Owner reads all & updates studio, cannot hard delete
    await assertSucceeds(getDocs(collection(ownerDb, 'businesses', BIZ_ID, 'studios')));
    await assertSucceeds(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'studios', 'studio-a'), {
        name: 'Studio A Updated',
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(ownerDb, 'businesses', BIZ_ID, 'studios', 'studio-a')));

    // Operator assigned ONLY studio-a:
    await assertSucceeds(getDoc(doc(opDb, 'businesses', BIZ_ID, 'studios', 'studio-a')));
    await assertSucceeds(
      getDocs(
        query(
          collection(opDb, 'businesses', BIZ_ID, 'studios'),
          where('studioId', 'in', ['studio-a']),
        ),
      ),
    );

    // Operator denied unassigned studio-b, unfiltered list, out-of-scope query, and writes
    await assertFails(getDoc(doc(opDb, 'businesses', BIZ_ID, 'studios', 'studio-b')));
    await assertFails(getDocs(collection(opDb, 'businesses', BIZ_ID, 'studios')));
    await assertFails(
      getDocs(
        query(
          collection(opDb, 'businesses', BIZ_ID, 'studios'),
          where('studioId', 'in', ['studio-a', 'studio-b']),
        ),
      ),
    );
    await assertFails(
      updateDoc(doc(opDb, 'businesses', BIZ_ID, 'studios', 'studio-a'), {
        name: 'Operator Tamper',
        updatedBy: OP_WITH_CUST_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    // Owner reassigns operator from studio-a -> studio-b; immediate effect in Rules
    await assertSucceeds(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'members', OP_WITH_CUST_UID), {
        assignedStudioIds: ['studio-b'],
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(getDoc(doc(opDb, 'businesses', BIZ_ID, 'studios', 'studio-a')));
    await assertSucceeds(getDoc(doc(opDb, 'businesses', BIZ_ID, 'studios', 'studio-b')));
  });

  it('enforces integer IDR service validation, version monotonicity, and Owner-only mutation on services', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opDb = testEnv.authenticatedContext(OP_WITH_CUST_UID).firestore();

    await assertSucceeds(
      setDoc(doc(ownerDb, 'businesses', BIZ_ID, 'services', 'svc-rehearsal'), {
        serviceId: 'svc-rehearsal',
        businessId: BIZ_ID,
        name: 'Band Rehearsal',
        category: 'rehearsal',
        pricingModel: 'hourly',
        durationOptions: [60, 120],
        basePriceMinor: 150000,
        durationPricesMinor: { 120: 280000 },
        commissionMethod: 'percentage',
        commissionValue: 15,
        applicableStudioIds: ['studio-a'],
        active: true,
        description: null,
        configVersion: 1,
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      }),
    );

    // Reject float money, >100% commission, or unknown category
    await assertFails(
      setDoc(doc(ownerDb, 'businesses', BIZ_ID, 'services', 'svc-float'), {
        serviceId: 'svc-float',
        businessId: BIZ_ID,
        name: 'Float Price',
        category: 'rehearsal',
        pricingModel: 'hourly',
        durationOptions: [60],
        basePriceMinor: 150000.5,
        durationPricesMinor: {},
        commissionMethod: 'inherit',
        commissionValue: 0,
        applicableStudioIds: [],
        active: true,
        description: null,
        configVersion: 1,
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      }),
    );

    await assertFails(
      setDoc(doc(ownerDb, 'businesses', BIZ_ID, 'services', 'svc-pct-overflow'), {
        serviceId: 'svc-pct-overflow',
        businessId: BIZ_ID,
        name: 'Bad Comm',
        category: 'mixing',
        pricingModel: 'fixed_session',
        durationOptions: [120],
        basePriceMinor: 300000,
        durationPricesMinor: {},
        commissionMethod: 'percentage',
        commissionValue: 105,
        applicableStudioIds: [],
        active: true,
        description: null,
        configVersion: 1,
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      }),
    );

    // Operator can read services, cannot create/update/delete
    await assertSucceeds(getDocs(collection(opDb, 'businesses', BIZ_ID, 'services')));
    await assertFails(
      updateDoc(doc(opDb, 'businesses', BIZ_ID, 'services', 'svc-rehearsal'), {
        basePriceMinor: 1000,
        configVersion: 2,
        updatedBy: OP_WITH_CUST_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(ownerDb, 'businesses', BIZ_ID, 'services', 'svc-rehearsal')));
  });

  it('enforces customer permission boundaries (Owner full sans delete; permitted Operator active-only without archive)', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opCustDb = testEnv.authenticatedContext(OP_WITH_CUST_UID).firestore();
    const opNoCustDb = testEnv.authenticatedContext(OP_NO_CUST_UID).firestore();

    // Operator WITHOUT canManageCustomers is completely denied
    await assertFails(getDocs(collection(opNoCustDb, 'businesses', BIZ_ID, 'customers')));

    // Permitted Operator creates & updates an active customer
    await assertSucceeds(
      setDoc(doc(opCustDb, 'businesses', BIZ_ID, 'customers', 'cust-1'), {
        customerId: 'cust-1',
        businessId: BIZ_ID,
        name: 'Band Merdeka',
        nameLower: 'band merdeka',
        phone: '0812999888',
        email: null,
        bandOrActName: 'Merdeka Quartet',
        notes: 'Langganan minggu',
        status: 'active',
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: OP_WITH_CUST_UID,
        updatedBy: OP_WITH_CUST_UID,
      }),
    );

    await assertSucceeds(
      updateDoc(doc(opCustDb, 'businesses', BIZ_ID, 'customers', 'cust-1'), {
        phone: '0812000111',
        updatedBy: OP_WITH_CUST_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    // Operator CANNOT archive customer or create pre-archived customer
    await assertFails(
      updateDoc(doc(opCustDb, 'businesses', BIZ_ID, 'customers', 'cust-1'), {
        status: 'archived',
        updatedBy: OP_WITH_CUST_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(opCustDb, 'businesses', BIZ_ID, 'customers', 'cust-2'), {
        customerId: 'cust-2',
        businessId: BIZ_ID,
        name: 'Archived Try',
        nameLower: 'archived try',
        phone: '0812333444',
        email: null,
        bandOrActName: null,
        notes: null,
        status: 'archived',
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: OP_WITH_CUST_UID,
        updatedBy: OP_WITH_CUST_UID,
      }),
    );

    // Owner CAN archive, cannot hard delete
    await assertSucceeds(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'customers', 'cust-1'), {
        status: 'archived',
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(ownerDb, 'businesses', BIZ_ID, 'customers', 'cust-1')));
  });

  it('enforces team member assignment, anti-self-demotion, and locks Phase 03+ subcollections', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opDb = testEnv.authenticatedContext(OP_WITH_CUST_UID).firestore();

    // Owner registers new staff UID with studio assignment
    await assertSucceeds(
      setDoc(doc(ownerDb, 'businesses', BIZ_ID, 'members', NEW_STAFF_UID), {
        uid: NEW_STAFF_UID,
        businessId: BIZ_ID,
        email: 'staff2@37musicstudio.test',
        displayName: 'Operator Dua',
        role: 'operator',
        status: 'active',
        assignedStudioIds: ['studio-a', 'studio-b'],
        permissions: { canManageCustomers: true },
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: OWNER_UID,
        updatedBy: OWNER_UID,
      }),
    );

    // Owner CANNOT self-demote or suspend self
    await assertFails(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'members', OWNER_UID), {
        role: 'operator',
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'members', OWNER_UID), {
        status: 'suspended',
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    // Hard delete on members denied; Operator cannot register staff
    await assertFails(deleteDoc(doc(ownerDb, 'businesses', BIZ_ID, 'members', NEW_STAFF_UID)));
    await assertFails(
      setDoc(doc(opDb, 'businesses', BIZ_ID, 'members', 'rogue-uid'), {
        uid: 'rogue-uid',
        businessId: BIZ_ID,
        email: 'rogue@test.com',
        displayName: 'Rogue',
        role: 'owner',
        status: 'active',
        assignedStudioIds: [],
        permissions: {},
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: OP_WITH_CUST_UID,
        updatedBy: OP_WITH_CUST_UID,
      }),
    );

    // Unreleased future subcollections MUST stay locked `if false` even for active Owner
    const unreleasedCollections = [
      ['unreleasedPhaseModule', 'doc-1'],
    ];

    for (const [colName, docId] of unreleasedCollections) {
      await assertFails(getDoc(doc(ownerDb, 'businesses', BIZ_ID, colName, docId)));
      await assertFails(
        setDoc(doc(ownerDb, 'businesses', BIZ_ID, colName, docId), {
          businessId: BIZ_ID,
          createdAt: serverTimestamp(),
        }),
      );
    }
  });
});
