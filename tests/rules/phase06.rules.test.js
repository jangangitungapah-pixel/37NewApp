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
const OP_GALLERY_UID = 'op-gallery-uid';
const OP_NO_GALLERY_UID = 'op-plain-uid';
const OUTSIDER_UID = 'outsider-uid-1';

async function seedPhase06Tenant() {
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
      permissions: { canManageGallery: true },
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'members', OP_GALLERY_UID), {
      uid: OP_GALLERY_UID,
      businessId: BIZ_ID,
      email: 'op-gallery@test.id',
      displayName: 'Operator Gallery',
      role: 'operator',
      status: 'active',
      assignedStudioIds: ['studio-a'],
      permissions: { canManageBookings: true, canManageGallery: true },
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(adminDb, 'businesses', BIZ_ID, 'members', OP_NO_GALLERY_UID), {
      uid: OP_NO_GALLERY_UID,
      businessId: BIZ_ID,
      email: 'op-plain@test.id',
      displayName: 'Operator Plain',
      role: 'operator',
      status: 'active',
      assignedStudioIds: ['studio-a'],
      permissions: { canManageBookings: true, canManageGallery: false },
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
    });
  });
}

function buildValidAssetPayload(assetId, actorUid, overrides = {}) {
  return {
    assetId,
    businessId: BIZ_ID,
    studioId: 'studio-a',
    publicId: `37musicstudio/${BIZ_ID}/studio-a/${assetId}`,
    secureUrl: `https://res.cloudinary.com/dbvlmxvyd/image/upload/v1731760000/37musicstudio/${BIZ_ID}/studio-a/${assetId}.jpg`,
    format: 'jpg',
    width: 1280,
    height: 720,
    bytes: 245000,
    caption: 'Ruang Live A',
    altText: 'Studio rekaman dengan drum dan ampli',
    order: 1,
    status: 'active',
    uploadedBy: actorUid,
    uploadedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
    schemaVersion: 1,
    ...overrides,
  };
}

describe('Phase 06 Firestore Security Rules — Gallery Assets', () => {
  beforeAll(async () => {
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    const [host, portStr] = emulatorHost.split(':');
    testEnv = await initializeTestEnvironment({
      projectId: 'musicstudio37app-phase06-rules',
      firestore: {
        host,
        port: Number(portStr),
        rules: readFileSync(RULES_PATH, 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedPhase06Tenant();
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it('enforces canManageGallery create, active-member read, outsider isolation, Cloudinary URL prefix, immutable binary fields, Owner-only archive, and no permanent delete', async () => {
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
    const opGalleryDb = testEnv.authenticatedContext(OP_GALLERY_UID).firestore();
    const opPlainDb = testEnv.authenticatedContext(OP_NO_GALLERY_UID).firestore();
    const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore();

    // 1. Authorized Owner and Operator-with-canManageGallery can create valid Cloudinary gallery asset docs
    await assertSucceeds(
      setDoc(
        doc(ownerDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-owner'),
        buildValidAssetPayload('gal-owner', OWNER_UID),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(opGalleryDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-op'),
        buildValidAssetPayload('gal-op', OP_GALLERY_UID, { order: 2 }),
      ),
    );

    // 2. Operator without canManageGallery can read gallery, but CANNOT create/edit
    await assertSucceeds(getDoc(doc(opPlainDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-owner')));
    await assertFails(
      setDoc(
        doc(opPlainDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-denied'),
        buildValidAssetPayload('gal-denied', OP_NO_GALLERY_UID),
      ),
    );

    // 3. Outsider cannot read or write galleryAssets
    await assertFails(getDoc(doc(outsiderDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-owner')));
    await assertFails(
      setDoc(
        doc(outsiderDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-outsider'),
        buildValidAssetPayload('gal-outsider', OUTSIDER_UID),
      ),
    );

    // 4. Rejects non-Cloudinary URLs, invalid format, initial archived status, or UID spoofing
    await assertFails(
      setDoc(
        doc(ownerDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-bad-url'),
        buildValidAssetPayload('gal-bad-url', OWNER_UID, {
          secureUrl: 'https://evil.example/photo.jpg',
        }),
      ),
    );
    await assertFails(
      setDoc(
        doc(ownerDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-bad-status'),
        buildValidAssetPayload('gal-bad-status', OWNER_UID, { status: 'archived' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(opGalleryDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-spoof-uid'),
        buildValidAssetPayload('gal-spoof-uid', OWNER_UID),
      ),
    );

    // 5. Composite-indexed gallery query works cleanly for active members
    const activeGallerySnap = await assertSucceeds(
      getDocs(
        query(
          collection(opPlainDb, 'businesses', BIZ_ID, 'galleryAssets'),
          where('status', '==', 'active'),
          orderBy('order', 'asc'),
          orderBy('createdAt', 'desc'),
        ),
      ),
    );
    expect(activeGallerySnap.docs).toHaveLength(2);

    // 6. Operator with canManageGallery can edit caption/order metadata, NOT immutable Cloudinary fields, and NOT archive status
    await assertSucceeds(
      updateDoc(doc(opGalleryDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-op'), {
        caption: 'Caption Diperbarui Operator',
        altText: 'Alt text baru',
        order: 5,
        updatedBy: OP_GALLERY_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(opGalleryDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-op'), {
        status: 'archived',
        updatedBy: OP_GALLERY_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    // 7. Immutable Cloudinary fields cannot be tampered even by Owner
    await assertFails(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-owner'), {
        publicId: 'tampered-public-id',
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-owner'), {
        secureUrl: 'https://res.cloudinary.com/dbvlmxvyd/image/upload/v99/tampered.jpg',
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );

    // 8. Owner CAN soft-archive and restore; permanent deleteDoc is ALWAYS denied (`allow delete: if false`)
    await assertSucceeds(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-op'), {
        status: 'archived',
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(ownerDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-op'), {
        status: 'active',
        updatedBy: OWNER_UID,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(ownerDb, 'businesses', BIZ_ID, 'galleryAssets', 'gal-owner')));
  });
});
