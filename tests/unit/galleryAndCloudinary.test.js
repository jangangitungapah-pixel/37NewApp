import { describe, expect, it, vi } from 'vitest';
import {
  retrySaveOrphanGalleryMetadataUseCase,
  setGalleryAssetArchiveStatusUseCase,
  updateGalleryAssetDetailsUseCase,
  uploadGalleryAssetUseCase,
} from '../../src/application/use-cases/galleryUseCases.js';
import {
  GALLERY_ASSET_STATUS,
  MEMBER_STATUS,
  OPERATOR_DEFAULT_PERMISSIONS,
  OWNER_DEFAULT_PERMISSIONS,
  ROLES,
  SCHEMA_VERSIONS,
} from '../../src/domain/enums/roles.js';
import {
  canArchiveGalleryAsset,
  canManageGallery,
} from '../../src/domain/policies/accessPolicy.js';
import {
  sortGalleryAssets,
  validateGalleryAssetDoc,
  validateGalleryMetadataInput,
} from '../../src/domain/validators/galleryValidators.js';
import {
  MAX_GALLERY_FILE_BYTES,
  buildCloudinaryImageUrl,
  getCloudinaryConfig,
  inspectImageDimensions,
  isCloudinaryConfigured,
  sanitizeCloudinaryFolderSegment,
  uploadImageToCloudinary,
  validateImageFileForUpload,
} from '../../src/infrastructure/cloudinary/cloudinaryClient.js';

describe('Phase 06 Cloudinary client & image validation', () => {
  it('checks public unsigned configuration without exposing secrets', () => {
    expect(isCloudinaryConfigured({ cloudName: '', uploadPreset: '' })).toBe(false);
    expect(isCloudinaryConfigured({ cloudName: 'dbvlmxvyd', uploadPreset: '' })).toBe(false);
    expect(isCloudinaryConfigured({ cloudName: 'dbvlmxvyd', uploadPreset: '37studioproper' })).toBe(true);

    const cfg = getCloudinaryConfig({ cloudName: ' dbvlmxvyd ', uploadPreset: ' 37studioproper ' });
    expect(cfg).toEqual({ cloudName: 'dbvlmxvyd', uploadPreset: '37studioproper' });
    expect(Object.keys(cfg)).toEqual(['cloudName', 'uploadPreset']);
  });

  it('validates allowed image MIME types and 5 MB max size', () => {
    expect(() =>
      validateImageFileForUpload({ name: 'bad.svg', type: 'image/svg+xml', size: 1024 }),
    ).toThrow(/JPEG, PNG, atau WebP/i);

    expect(() =>
      validateImageFileForUpload({
        name: 'huge.jpg',
        type: 'image/jpeg',
        size: MAX_GALLERY_FILE_BYTES + 1,
      }),
    ).toThrow(/maksimal 5 MB/i);

    const valid = validateImageFileForUpload({
      name: 'room.webp',
      type: 'image/webp',
      size: 512_000,
    });
    expect(valid.mimeType).toBe('image/webp');
    expect(valid.sizeBytes).toBe(512_000);
  });

  it('inspects image dimensions and ALWAYS calls URL.revokeObjectURL on both success and failure', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock-1');
    const revokeObjectURL = vi.fn();

    class GoodImage {
      set src(_val) {
        this.naturalWidth = 1920;
        this.naturalHeight = 1080;
        this.onload?.();
      }
    }

    const dims = await inspectImageDimensions(new Blob(['img'], { type: 'image/jpeg' }), {
      urlApi: { createObjectURL, revokeObjectURL },
      ImageCtor: GoodImage,
    });
    expect(dims).toEqual({ width: 1920, height: 1080 });
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');

    const revokeOnFail = vi.fn();
    class BadImage {
      set src(_val) {
        this.onerror?.();
      }
    }

    await expect(
      inspectImageDimensions(new Blob(['bad'], { type: 'image/jpeg' }), {
        urlApi: { createObjectURL: () => 'blob:mock-bad', revokeObjectURL: revokeOnFail },
        ImageCtor: BadImage,
      }),
    ).rejects.toThrow(/gagal didekode/i);
    expect(revokeOnFail).toHaveBeenCalledTimes(1);
    expect(revokeOnFail).toHaveBeenCalledWith('blob:mock-bad');
  });

  it('performs unsigned FormData upload without attaching user public_id or secrets and verifies secure_url', async () => {
    const captured = {};
    const fetchImpl = vi.fn(async (url, init) => {
      captured.url = url;
      captured.method = init.method;
      captured.body = init.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          public_id: '37musicstudio/biz-1/studio-a/abc123',
          secure_url:
            'https://res.cloudinary.com/dbvlmxvyd/image/upload/v1731760000/37musicstudio/biz-1/studio-a/abc123.jpg',
          format: 'jpg',
          width: 1600,
          height: 1200,
          bytes: 245000,
        }),
      };
    });

    const uploaded = await uploadImageToCloudinary({
      file: { name: 'room.jpg', type: 'image/jpeg', size: 245000 },
      businessId: 'biz-1',
      studioId: 'studio-a',
      config: { cloudName: 'dbvlmxvyd', uploadPreset: '37studioproper' },
      fetchImpl,
      imageInspector: async () => ({ width: 1600, height: 1200 }),
    });

    expect(captured.url).toBe('https://api.cloudinary.com/v1_1/dbvlmxvyd/image/upload');
    expect(captured.method).toBe('POST');
    expect(captured.body.get('upload_preset')).toBe('37studioproper');
    expect(captured.body.get('folder')).toBe('37musicstudio/biz-1/studio-a');
    expect(captured.body.has('public_id')).toBe(false);
    expect(captured.body.has('api_secret')).toBe(false);
    expect(captured.body.has('api_key')).toBe(false);

    expect(uploaded).toEqual({
      publicId: '37musicstudio/biz-1/studio-a/abc123',
      secureUrl:
        'https://res.cloudinary.com/dbvlmxvyd/image/upload/v1731760000/37musicstudio/biz-1/studio-a/abc123.jpg',
      format: 'jpg',
      width: 1600,
      height: 1200,
      bytes: 245000,
    });

    // Rejects untrusted non-Cloudinary response URL
    const spoofedFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        public_id: 'evil',
        secure_url: 'https://evil.example.com/payload.jpg',
        format: 'jpg',
      }),
    }));

    await expect(
      uploadImageToCloudinary({
        file: { name: 'room.jpg', type: 'image/jpeg', size: 1234 },
        businessId: 'biz-1',
        config: { cloudName: 'dbvlmxvyd', uploadPreset: '37studioproper' },
        fetchImpl: spoofedFetch,
        imageInspector: async () => ({ width: 800, height: 600 }),
      }),
    ).rejects.toThrow(/secure_url/i);
  });

  it('builds responsive CDN image URLs cleanly without duplicating transforms', () => {
    const raw =
      'https://res.cloudinary.com/dbvlmxvyd/image/upload/v1731760000/37musicstudio/biz-1/room.jpg';
    const transformed = buildCloudinaryImageUrl(raw, { width: 640, crop: 'fill' });
    expect(transformed).toBe(
      'https://res.cloudinary.com/dbvlmxvyd/image/upload/f_auto,q_auto,c_fill,w_640/v1731760000/37musicstudio/biz-1/room.jpg',
    );

    const reTransformed = buildCloudinaryImageUrl(transformed, { width: 1200, crop: 'limit' });
    expect(reTransformed).toBe(
      'https://res.cloudinary.com/dbvlmxvyd/image/upload/f_auto,q_auto,c_limit,w_1200/v1731760000/37musicstudio/biz-1/room.jpg',
    );

    expect(buildCloudinaryImageUrl('https://other-host.test/img.jpg')).toBe('');
    expect(sanitizeCloudinaryFolderSegment('../biz 01/bad?')).toBe('biz-01-bad');
  });
});

describe('Phase 06 gallery domain validators, sorting, RBAC, and orphan upload recovery', () => {
  const ownerMember = {
    uid: 'owner-1',
    businessId: 'biz-1',
    role: ROLES.OWNER,
    status: MEMBER_STATUS.ACTIVE,
    permissions: OWNER_DEFAULT_PERMISSIONS,
    assignedStudioIds: [],
  };

  const opNoGallery = {
    uid: 'op-1',
    businessId: 'biz-1',
    role: ROLES.OPERATOR,
    status: MEMBER_STATUS.ACTIVE,
    permissions: OPERATOR_DEFAULT_PERMISSIONS,
    assignedStudioIds: ['studio-a'],
  };

  const opWithGallery = {
    ...opNoGallery,
    uid: 'op-2',
    permissions: { ...OPERATOR_DEFAULT_PERMISSIONS, canManageGallery: true },
  };

  it('enforces RBAC manage vs Owner-only archive permissions', () => {
    expect(canManageGallery(ownerMember)).toBe(true);
    expect(canArchiveGalleryAsset(ownerMember)).toBe(true);

    expect(canManageGallery(opNoGallery)).toBe(false);
    expect(canArchiveGalleryAsset(opNoGallery)).toBe(false);

    expect(canManageGallery(opWithGallery)).toBe(true);
    expect(canArchiveGalleryAsset(opWithGallery)).toBe(false);
  });

  it('validates gallery asset schema and sorts assets deterministically', () => {
    const now = new Date('2026-11-16T10:00:00Z');
    const doc = validateGalleryAssetDoc({
      assetId: 'ast-1',
      businessId: 'biz-1',
      studioId: 'studio-a',
      publicId: '37musicstudio/biz-1/room1',
      secureUrl: 'https://res.cloudinary.com/dbvlmxvyd/image/upload/v1/room1.webp',
      format: 'WEBP',
      width: 1280,
      height: 720,
      bytes: 180000,
      caption: 'Booth Vokal',
      altText: 'Ruang vokal akustik',
      order: 2,
      status: GALLERY_ASSET_STATUS.ACTIVE,
      uploadedBy: 'owner-1',
      uploadedAt: now,
      createdAt: now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSIONS.GALLERY_ASSET,
    });
    expect(doc.format).toBe('webp');
    expect(() => validateGalleryMetadataInput({ caption: 'x'.repeat(201) })).toThrow(/200/);

    const sorted = sortGalleryAssets([
      { assetId: 'b', order: 5, createdAt: new Date('2026-11-16T12:00:00Z') },
      { assetId: 'a', order: 1, createdAt: new Date('2026-11-16T09:00:00Z') },
      { assetId: 'c', order: 1, createdAt: new Date('2026-11-16T11:00:00Z') },
    ]);
    expect(sorted.map((x) => x.assetId)).toEqual(['c', 'a', 'b']);
  });

  it('preserves orphan Cloudinary asset metadata when Firestore save fails and recovers via retry without re-uploading', async () => {
    const uploadSpy = vi.fn(async () => ({
      publicId: '37musicstudio/biz-1/orphan-photo',
      secureUrl: 'https://res.cloudinary.com/dbvlmxvyd/image/upload/v1/orphan-photo.jpg',
      format: 'jpg',
      width: 1200,
      height: 800,
      bytes: 95000,
    }));

    const failingSave = vi.fn(async () => {
      throw new Error('Firestore transient write failure');
    });

    let caughtError = null;
    try {
      await uploadGalleryAssetUseCase(
        {
          member: ownerMember,
          file: { name: 'room.jpg', type: 'image/jpeg', size: 95000 },
          metadata: { studioId: 'studio-a', caption: 'Drum Room', order: 1 },
          isOnline: true,
          preGeneratedAssetId: 'ast-retry-1',
        },
        { uploadImage: uploadSpy, createAssetDoc: failingSave },
      );
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeTruthy();
    expect(caughtError.orphanUpload).toBeTruthy();
    expect(caughtError.orphanUpload.preGeneratedAssetId).toBe('ast-retry-1');
    expect(caughtError.orphanUpload.cloudinaryAsset.publicId).toBe('37musicstudio/biz-1/orphan-photo');
    expect(uploadSpy).toHaveBeenCalledTimes(1);

    const retrySaveSpy = vi.fn(async ({ businessId, actorUid, cloudinaryAsset, metadata, preGeneratedAssetId }) => ({
      assetId: preGeneratedAssetId,
      businessId,
      uploadedBy: actorUid,
      publicId: cloudinaryAsset.publicId,
      ...metadata,
    }));

    const recovered = await retrySaveOrphanGalleryMetadataUseCase(
      {
        member: ownerMember,
        cloudinaryAsset: caughtError.orphanUpload.cloudinaryAsset,
        metadata: caughtError.orphanUpload.metadata,
        preGeneratedAssetId: caughtError.orphanUpload.preGeneratedAssetId,
        isOnline: true,
      },
      { createAssetDoc: retrySaveSpy },
    );

    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(retrySaveSpy).toHaveBeenCalledTimes(1);
    expect(recovered.assetId).toBe('ast-retry-1');
    expect(recovered.publicId).toBe('37musicstudio/biz-1/orphan-photo');
  });

  it('enforces offline guard and Operator archive restriction in use-cases', async () => {
    await expect(
      uploadGalleryAssetUseCase({
        member: ownerMember,
        file: { name: 'a.jpg', type: 'image/jpeg', size: 100 },
        isOnline: false,
      }),
    ).rejects.toThrow(/koneksi internet/i);

    await expect(
      updateGalleryAssetDetailsUseCase({
        member: opNoGallery,
        assetId: 'ast-1',
        updates: { caption: 'Edit' },
        isOnline: true,
      }),
    ).rejects.toThrow(/tidak memiliki izin/i);

    await expect(
      setGalleryAssetArchiveStatusUseCase({
        member: opWithGallery,
        assetId: 'ast-1',
        archive: true,
        isOnline: true,
      }),
    ).rejects.toThrow(/Hanya Owner aktif/i);
  });
});
