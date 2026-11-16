import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Copy,
  Eye,
  Image as ImageIcon,
  Pencil,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import {
  retrySaveOrphanGalleryMetadataUseCase,
  setGalleryAssetArchiveStatusUseCase,
  updateGalleryAssetDetailsUseCase,
  uploadGalleryAssetUseCase,
} from '../../application/use-cases/galleryUseCases.js';
import { subscribeGalleryAssets } from '../../data/repositories/galleryRepository.js';
import { subscribeStudiosForMember } from '../../data/repositories/studioRepository.js';
import { GALLERY_ASSET_STATUS, ROLES } from '../../domain/enums/roles.js';
import {
  canArchiveGalleryAsset,
  canManageGallery,
} from '../../domain/policies/accessPolicy.js';
import {
  buildCloudinaryImageUrl,
  getCloudinaryConfig,
  isCloudinaryConfigured,
  validateImageFileForUpload,
} from '../../infrastructure/cloudinary/cloudinaryClient.js';
import { ModalDialog } from '../../shared/components/ModalDialog.jsx';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { useRegistrySubscription } from '../../shared/hooks/useRegistrySubscription.js';

const EMPTY_UPLOAD_FORM = {
  studioId: '',
  caption: '',
  altText: '',
  order: '0',
};

function formatByteSize(bytes) {
  const num = Number(bytes || 0);
  if (!Number.isFinite(num) || num <= 0) {
    return '0 KB';
  }
  if (num >= 1024 * 1024) {
    return `${(num / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.max(1, Math.round(num / 1024))} KB`;
}

export function GalleryPage() {
  const { member, isOnline } = useAuthSession();
  const businessId = member?.businessId || '';
  const canManage = canManageGallery(member);
  const canArchive = canArchiveGalleryAsset(member);
  const assignedKey = (member?.assignedStudioIds || []).join(',');

  const cloudConfig = getCloudinaryConfig();
  const cloudinaryReady = isCloudinaryConfigured(cloudConfig);

  const [statusFilter, setStatusFilter] = useState(GALLERY_ASSET_STATUS.ACTIVE);
  const [studioFilter, setStudioFilter] = useState('');
  const [bannerSuccess, setBannerSuccess] = useState('');
  const [bannerError, setBannerError] = useState('');
  const [busyAssetId, setBusyAssetId] = useState('');

  // Upload modal + orphan upload recovery state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD_FORM);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [orphanUpload, setOrphanUpload] = useState(null);
  const [retryingOrphan, setRetryingOrphan] = useState(false);

  // Edit metadata modal state
  const [editingAsset, setEditingAsset] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_UPLOAD_FORM);
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Lightbox preview modal state
  const [previewAsset, setPreviewAsset] = useState(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const subscribeGalleryFn = useCallback(
    ({ onData, onError }) => {
      if (!businessId) return () => {};
      return subscribeGalleryAssets({
        businessId,
        status: statusFilter,
        studioId: studioFilter,
        limitCount: 60,
        onData,
        onError,
      });
    },
    [businessId, statusFilter, studioFilter],
  );

  const subscribeStudiosFn = useCallback(
    ({ onData, onError }) => {
      if (!businessId || !member) return () => {};
      return subscribeStudiosForMember({ businessId, member, onData, onError });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [businessId, member?.role, assignedKey],
  );

  const {
    data: assets,
    loading,
    error: subError,
    fromCache,
  } = useRegistrySubscription(
    `gallery:${businessId}:${statusFilter}:${studioFilter || 'all'}`,
    businessId ? subscribeGalleryFn : null,
    [],
  );

  const { data: studios } = useRegistrySubscription(
    `gallery-studios:${businessId}:${member?.role || ''}:${assignedKey}`,
    businessId && member ? subscribeStudiosFn : null,
    [],
  );

  const studioNameMap = useMemo(() => {
    const map = new Map();
    for (const studio of studios || []) {
      map.set(studio.studioId, studio.name);
    }
    return map;
  }, [studios]);

  const visibleAssets = useMemo(() => {
    if (!member || member.role === ROLES.OWNER) {
      return assets || [];
    }
    const assigned = new Set(member.assignedStudioIds || []);
    return (assets || []).filter((item) => !item.studioId || assigned.has(item.studioId));
  }, [assets, member]);

  function clearSelectedFile() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl('');
    setSelectedFile(null);
  }

  function openUploadModal() {
    setBannerError('');
    setBannerSuccess('');
    setUploadError('');
    clearSelectedFile();
    setUploadForm({
      ...EMPTY_UPLOAD_FORM,
      studioId: studioFilter || '',
      order: String((visibleAssets?.length || 0) * 10),
    });
    setUploadModalOpen(true);
  }

  function closeUploadModal() {
    if (uploading) return;
    clearSelectedFile();
    setUploadModalOpen(false);
  }

  function handleFileChange(event) {
    setUploadError('');
    const file = event.target.files?.[0] || null;
    clearSelectedFile();
    if (!file) {
      return;
    }
    try {
      validateImageFileForUpload(file);
      const nextPreviewUrl = URL.createObjectURL(file);
      setSelectedFile(file);
      setPreviewUrl(nextPreviewUrl);
      if (!uploadForm.caption) {
        const cleanBaseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        setUploadForm((prev) => ({
          ...prev,
          caption: cleanBaseName.slice(0, 120),
          altText: prev.altText || cleanBaseName.slice(0, 120),
        }));
      }
    } catch (err) {
      setUploadError(err.message || 'File gambar tidak memenuhi syarat upload.');
    }
  }

  async function handleUploadSubmit(event) {
    event.preventDefault();
    setUploadError('');
    setBannerError('');
    setBannerSuccess('');

    if (!selectedFile) {
      setUploadError('Pilih file JPEG, PNG, atau WebP terlebih dahulu.');
      return;
    }

    setUploading(true);
    try {
      await uploadGalleryAssetUseCase({
        member,
        file: selectedFile,
        isOnline,
        metadata: {
          studioId: uploadForm.studioId || null,
          caption: uploadForm.caption || null,
          altText: uploadForm.altText || null,
          order: Number(uploadForm.order || 0),
        },
      });
      clearSelectedFile();
      setUploadModalOpen(false);
      setStatusFilter(GALLERY_ASSET_STATUS.ACTIVE);
      setBannerSuccess('Foto studio berhasil diunggah ke Cloudinary dan metadata tersimpan ke Firestore.');
    } catch (err) {
      if (err?.orphanUpload) {
        setOrphanUpload(err.orphanUpload);
        clearSelectedFile();
        setUploadModalOpen(false);
        setBannerError(err.message);
      } else {
        setUploadError(err?.message || 'Gagal mengunggah gambar galeri.');
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleRetryOrphanSave() {
    if (!orphanUpload) return;
    setRetryingOrphan(true);
    setBannerError('');
    setBannerSuccess('');
    try {
      await retrySaveOrphanGalleryMetadataUseCase({
        member,
        cloudinaryAsset: orphanUpload.cloudinaryAsset,
        metadata: orphanUpload.metadata,
        preGeneratedAssetId: orphanUpload.preGeneratedAssetId,
        isOnline,
      });
      setOrphanUpload(null);
      setStatusFilter(GALLERY_ASSET_STATUS.ACTIVE);
      setBannerSuccess(
        `Metadata foto (${orphanUpload.cloudinaryAsset.publicId}) berhasil dipulihkan dan disimpan ke Firestore.`,
      );
    } catch (err) {
      setBannerError(err?.message || 'Percobaan ulang simpan metadata masih gagal.');
    } finally {
      setRetryingOrphan(false);
    }
  }

  function openEditModal(asset) {
    setEditError('');
    setEditingAsset(asset);
    setEditForm({
      studioId: asset.studioId || '',
      caption: asset.caption || '',
      altText: asset.altText || '',
      order: String(asset.order ?? 0),
    });
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    if (!editingAsset) return;
    setSavingEdit(true);
    setEditError('');
    setBannerError('');
    setBannerSuccess('');
    try {
      await updateGalleryAssetDetailsUseCase({
        member,
        assetId: editingAsset.assetId,
        isOnline,
        updates: {
          studioId: editForm.studioId || null,
          caption: editForm.caption || null,
          altText: editForm.altText || null,
          order: Number(editForm.order || 0),
        },
      });
      setEditingAsset(null);
      setBannerSuccess('Metadata foto galeri berhasil diperbarui.');
    } catch (err) {
      setEditError(err?.message || 'Gagal memperbarui metadata galeri.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleArchive(asset) {
    const nextArchive = asset.status === GALLERY_ASSET_STATUS.ACTIVE;
    setBusyAssetId(asset.assetId);
    setBannerError('');
    setBannerSuccess('');
    try {
      await setGalleryAssetArchiveStatusUseCase({
        member,
        assetId: asset.assetId,
        archive: nextArchive,
        isOnline,
      });
      setBannerSuccess(
        nextArchive
          ? `Aset "${asset.caption || asset.publicId}" diarsipkan di Firestore (file CDN tetap ada di Cloudinary sampai dihapus manual di Console).`
          : `Aset "${asset.caption || asset.publicId}" dipulihkan ke galeri aktif.`,
      );
    } catch (err) {
      setBannerError(err?.message || 'Gagal mengubah status arsip foto.');
    } finally {
      setBusyAssetId('');
    }
  }

  async function handleCopyText(text, label) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setBannerSuccess(`${label} disalin ke clipboard.`);
      } else {
        setBannerSuccess(`${label}: ${text}`);
      }
    } catch {
      setBannerSuccess(`${label}: ${text}`);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <section className="panel" style={{ display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px' }}>Galeri &amp; Media Studio</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
              Upload langsung ke Cloudinary melalui unsigned preset terproteksi dan indeks metadata di Firestore.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={`badge ${cloudinaryReady ? 'badge-success' : 'badge-warning'}`}>
              <ImageIcon size={14} aria-hidden="true" />
              <span>
                {cloudinaryReady
                  ? `Cloudinary: ${cloudConfig.cloudName} (${cloudConfig.uploadPreset})`
                  : 'Cloudinary Belum Dikonfigurasi'}
              </span>
            </span>

            {canManage && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={openUploadModal}
                disabled={!cloudinaryReady || !isOnline}
              >
                <Upload size={16} aria-hidden="true" />
                <span>Upload Foto Studio</span>
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span className={`badge ${canManage ? 'badge-info' : ''}`}>
            {canManage ? 'Izin: Upload & Edit Metadata' : 'Mode Baca Saja'}
          </span>
          <span className="badge">
            {canArchive
              ? 'Archive / Restore Aktif (Owner)'
              : 'Arsip Aset: Khusus Owner'}
          </span>
          {fromCache && <span className="badge badge-warning">Menampilkan cache Firestore</span>}
        </div>

        <StatusAlert
          variant="warning"
          title="Kebijakan Penghapusan Cloudinary (Spark Client-Only Architecture)"
          message="Mengarsipkan foto menandai status = 'archived' di Firestore tanpa memanggil API secret di browser. Penghapusan file permanen di CDN dilakukan manual melalui Cloudinary Console menggunakan Public ID aset."
        />

        {!cloudinaryReady && (
          <StatusAlert
            variant="danger"
            title="Konfigurasi Cloudinary Belum Lengkap"
            message="Setel VITE_CLOUDINARY_CLOUD_NAME dan VITE_CLOUDINARY_UPLOAD_PRESET pada file environment lokal lalu muat ulang aplikasi. Jangan pernah memasukkan API Secret Cloudinary ke frontend."
          />
        )}
      </section>

      <StatusAlert variant="success" title="Berhasil" message={bannerSuccess} />
      <StatusAlert variant="danger" title="Kendala Galeri" message={bannerError || subError?.message} />

      {orphanUpload && (
        <section
          className="panel"
          role="alert"
          style={{
            display: 'grid',
            gap: '12px',
            borderColor: 'var(--accent-brass)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-brass)' }}>
            <AlertTriangle size={18} aria-hidden="true" />
            <strong>Pemulihan Orphan Upload Cloudinary Diperlukan</strong>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            File berhasil diunggah ke Cloudinary, tetapi penyimpanan metadata ke Firestore gagal. Anda dapat langsung
            menyimpan ulang metadata tanpa upload ulang file, atau menghapus aset secara manual di Cloudinary Console.
          </p>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <img
              src={buildCloudinaryImageUrl(orphanUpload.cloudinaryAsset.secureUrl, {
                width: 240,
                crop: 'limit',
              })}
              alt="Preview orphan upload Cloudinary"
              style={{
                width: '120px',
                height: '80px',
                objectFit: 'cover',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            />
            <div style={{ display: 'grid', gap: '4px', fontSize: '13px', minWidth: 0 }}>
              <span>
                Public ID:{' '}
                <code className="mono" style={{ wordBreak: 'break-all' }}>
                  {orphanUpload.cloudinaryAsset.publicId}
                </code>
              </span>
              <span className="mono" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {orphanUpload.cloudinaryAsset.width}×{orphanUpload.cloudinaryAsset.height}px ·{' '}
                {formatByteSize(orphanUpload.cloudinaryAsset.bytes)} ·{' '}
                {orphanUpload.cloudinaryAsset.format.toUpperCase()}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleRetryOrphanSave}
              disabled={retryingOrphan || !isOnline}
            >
              <RefreshCw size={14} aria-hidden="true" />
              <span>{retryingOrphan ? 'Menyimpan Metadata...' : 'Simpan Ulang Metadata ke Firestore'}</span>
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                handleCopyText(orphanUpload.cloudinaryAsset.publicId, 'Public ID Cloudinary')
              }
            >
              <Copy size={14} aria-hidden="true" />
              <span>Salin Public ID (Hapus Manual di Console)</span>
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setOrphanUpload(null)}
              disabled={retryingOrphan}
            >
              Tutup Peringatan
            </button>
          </div>
        </section>
      )}

      <section className="panel" style={{ display: 'grid', gap: '12px' }}>
        <div className="grid-2">
          <div className="field">
            <label className="field-label" htmlFor="gallery-studio-filter">
              Filter Studio
            </label>
            <select
              id="gallery-studio-filter"
              className="field-input"
              value={studioFilter}
              onChange={(e) => setStudioFilter(e.target.value)}
            >
              <option value="">Semua Studio &amp; Galeri Bisnis</option>
              {(studios || []).map((studio) => (
                <option key={studio.studioId} value={studio.studioId}>
                  {studio.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="gallery-status-filter">
              Status Aset
            </label>
            <select
              id="gallery-status-filter"
              className="field-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value={GALLERY_ASSET_STATUS.ACTIVE}>Aktif (Ditampilkan)</option>
              <option value={GALLERY_ASSET_STATUS.ARCHIVED}>Diarsipkan</option>
            </select>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="panel skeleton" style={{ height: '220px' }} />
      ) : visibleAssets.length === 0 ? (
        <section className="empty-state">
          <ImageIcon size={28} color="var(--accent-brass)" aria-hidden="true" />
          <strong>
            {statusFilter === GALLERY_ASSET_STATUS.ARCHIVED
              ? 'Belum ada aset galeri yang diarsipkan'
              : 'Belum ada foto pada filter galeri ini'}
          </strong>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '480px' }}>
            {canManage
              ? 'Unggah foto ruangan studio musik (JPEG, PNG, atau WebP maksimal 5 MB) melalui Cloudinary unsigned preset.'
              : 'Belum ada aset foto yang ditambahkan oleh Owner atau anggota berizin kelola galeri.'}
          </p>
        </section>
      ) : (
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '16px',
          }}
        >
          {visibleAssets.map((asset) => {
            const thumbUrl = buildCloudinaryImageUrl(asset.secureUrl, {
              width: 640,
              crop: 'fill',
            });
            const thumb2xUrl = buildCloudinaryImageUrl(asset.secureUrl, {
              width: 960,
              crop: 'fill',
            });
            const studioLabel = asset.studioId
              ? studioNameMap.get(asset.studioId) || asset.studioId
              : 'Galeri Umum Bisnis';
            const isArchived = asset.status === GALLERY_ASSET_STATUS.ARCHIVED;

            return (
              <article
                key={asset.assetId}
                className="panel"
                style={{
                  padding: '12px',
                  display: 'grid',
                  gap: '10px',
                  alignContent: 'space-between',
                }}
              >
                <div style={{ display: 'grid', gap: '10px' }}>
                  <div
                    style={{
                      position: 'relative',
                      aspectRatio: '16 / 10',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <img
                      src={thumbUrl}
                      srcSet={thumb2xUrl ? `${thumbUrl} 1x, ${thumb2xUrl} 2x` : undefined}
                      alt={asset.altText || asset.caption || 'Foto studio 37MusicStudio'}
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                    <span
                      className={`badge ${isArchived ? 'badge-warning' : 'badge-success'}`}
                      style={{ position: 'absolute', top: '8px', right: '8px' }}
                    >
                      {isArchived ? 'Diarsipkan' : 'Aktif'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline' }}>
                      <strong style={{ fontSize: '15px', lineHeight: 1.3 }}>
                        {asset.caption || 'Tanpa Caption'}
                      </strong>
                      <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
                        #{asset.order}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--accent-brass)' }}>{studioLabel}</span>
                    {asset.altText && (
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Alt: {asset.altText}
                      </span>
                    )}
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {asset.width}×{asset.height}px · {formatByteSize(asset.bytes)} ·{' '}
                      {String(asset.format || '').toUpperCase()}
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={asset.publicId}
                    >
                      {asset.publicId}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', paddingTop: '4px' }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setPreviewAsset(asset)}
                    aria-label={`Lihat foto ${asset.caption || asset.assetId}`}
                  >
                    <Eye size={14} aria-hidden="true" />
                    <span>Preview</span>
                  </button>

                  {canManage && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => openEditModal(asset)}
                      disabled={!isOnline}
                      aria-label={`Edit metadata ${asset.caption || asset.assetId}`}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      <span>Edit</span>
                    </button>
                  )}

                  {canArchive && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => handleToggleArchive(asset)}
                      disabled={!isOnline || busyAssetId === asset.assetId}
                    >
                      {isArchived ? (
                        <>
                          <RotateCcw size={14} aria-hidden="true" />
                          <span>Pulihkan</span>
                        </>
                      ) : (
                        <>
                          <Archive size={14} aria-hidden="true" />
                          <span>Arsipkan</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <ModalDialog
        open={uploadModalOpen}
        title="Upload Foto Galeri Studio"
        description="Hanya mendukung JPEG, PNG, atau WebP maksimal 5 MB. Public ID dibuat otomatis oleh Cloudinary preset."
        onClose={closeUploadModal}
      >
        <StatusAlert variant="danger" title="Validasi Upload" message={uploadError} />
        <form onSubmit={handleUploadSubmit} style={{ display: 'grid', gap: '12px' }}>
          <div className="field">
            <label className="field-label" htmlFor="gallery-file-input">
              Pilih File Gambar (JPEG / PNG / WebP, max 5 MB)
            </label>
            <input
              id="gallery-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="field-input"
              onChange={handleFileChange}
              disabled={uploading}
              required
            />
          </div>

          {previewUrl && (
            <div style={{ display: 'grid', gap: '6px' }}>
              <img
                src={previewUrl}
                alt="Preview gambar sebelum upload"
                style={{
                  width: '100%',
                  maxHeight: '220px',
                  objectFit: 'contain',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-input)',
                }}
              />
              {selectedFile && (
                <span className="mono" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {selectedFile.name} · {formatByteSize(selectedFile.size)} ({selectedFile.type})
                </span>
              )}
            </div>
          )}

          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="upload-studio-select">
                Tautkan ke Studio (Opsional)
              </label>
              <select
                id="upload-studio-select"
                className="field-input"
                value={uploadForm.studioId}
                onChange={(e) => setUploadForm((p) => ({ ...p, studioId: e.target.value }))}
                disabled={uploading}
              >
                <option value="">Umum / Seluruh Bisnis</option>
                {(studios || []).map((studio) => (
                  <option key={studio.studioId} value={studio.studioId}>
                    {studio.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="upload-order-input">
                Urutan Tampil (Order)
              </label>
              <input
                id="upload-order-input"
                type="number"
                min={0}
                max={10000}
                className="field-input mono"
                value={uploadForm.order}
                onChange={(e) => setUploadForm((p) => ({ ...p, order: e.target.value }))}
                disabled={uploading}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="upload-caption-input">
              Caption Foto (Maksimal 200 karakter)
            </label>
            <input
              id="upload-caption-input"
              type="text"
              maxLength={200}
              className="field-input"
              placeholder="Live room drum booth Studio A"
              value={uploadForm.caption}
              onChange={(e) => setUploadForm((p) => ({ ...p, caption: e.target.value }))}
              disabled={uploading}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="upload-alt-input">
              Alt Text Aksesibilitas (Maksimal 200 karakter)
            </label>
            <input
              id="upload-alt-input"
              type="text"
              maxLength={200}
              className="field-input"
              placeholder="Ruang rekaman utama dengan panel akustik kayu dan set drum"
              value={uploadForm.altText}
              onChange={(e) => setUploadForm((p) => ({ ...p, altText: e.target.value }))}
              disabled={uploading}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '6px' }}>
            <button type="button" className="btn" onClick={closeUploadModal} disabled={uploading}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary" disabled={uploading || !selectedFile}>
              <Upload size={16} aria-hidden="true" />
              <span>{uploading ? 'Mengunggah ke Cloudinary...' : 'Upload & Simpan'}</span>
            </button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog
        open={Boolean(editingAsset)}
        title="Edit Metadata Foto Galeri"
        description="Perubahan hanya memperbarui caption, alt text, urutan, dan studio terkait. File gambar di Cloudinary tetap utuh."
        onClose={() => {
          if (!savingEdit) setEditingAsset(null);
        }}
      >
        <StatusAlert variant="danger" title="Validasi Metadata" message={editError} />
        <form onSubmit={handleEditSubmit} style={{ display: 'grid', gap: '12px' }}>
          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="edit-studio-select">
                Tautkan ke Studio
              </label>
              <select
                id="edit-studio-select"
                className="field-input"
                value={editForm.studioId}
                onChange={(e) => setEditForm((p) => ({ ...p, studioId: e.target.value }))}
                disabled={savingEdit}
              >
                <option value="">Umum / Seluruh Bisnis</option>
                {(studios || []).map((studio) => (
                  <option key={studio.studioId} value={studio.studioId}>
                    {studio.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="edit-order-input">
                Urutan Tampil (Order)
              </label>
              <input
                id="edit-order-input"
                type="number"
                min={0}
                max={10000}
                className="field-input mono"
                value={editForm.order}
                onChange={(e) => setEditForm((p) => ({ ...p, order: e.target.value }))}
                disabled={savingEdit}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="edit-caption-input">
              Caption
            </label>
            <input
              id="edit-caption-input"
              type="text"
              maxLength={200}
              className="field-input"
              value={editForm.caption}
              onChange={(e) => setEditForm((p) => ({ ...p, caption: e.target.value }))}
              disabled={savingEdit}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="edit-alt-input">
              Alt Text
            </label>
            <input
              id="edit-alt-input"
              type="text"
              maxLength={200}
              className="field-input"
              value={editForm.altText}
              onChange={(e) => setEditForm((p) => ({ ...p, altText: e.target.value }))}
              disabled={savingEdit}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '6px' }}>
            <button
              type="button"
              className="btn"
              onClick={() => setEditingAsset(null)}
              disabled={savingEdit}
            >
              Batal
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingEdit}>
              {savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog
        open={Boolean(previewAsset)}
        title={previewAsset?.caption || 'Preview Aset Galeri'}
        description={
          previewAsset
            ? `Public ID: ${previewAsset.publicId} · ${previewAsset.width}×${previewAsset.height}px`
            : ''
        }
        onClose={() => setPreviewAsset(null)}
      >
        {previewAsset && (
          <div style={{ display: 'grid', gap: '12px' }}>
            <img
              src={buildCloudinaryImageUrl(previewAsset.secureUrl, {
                width: 1200,
                crop: 'limit',
              })}
              alt={previewAsset.altText || previewAsset.caption || 'Preview foto galeri studio'}
              style={{
                width: '100%',
                maxHeight: '60vh',
                objectFit: 'contain',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-input)',
              }}
            />

            <div className="alert" style={{ fontSize: '12px', alignItems: 'center' }}>
              <ShieldAlert size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>
                Untuk menghapus file CDN secara permanen, salin <code className="mono">Public ID</code> lalu hapus
                melalui Media Library di Cloudinary Console.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => handleCopyText(previewAsset.publicId, 'Public ID')}
              >
                <Copy size={14} aria-hidden="true" />
                <span>Salin Public ID</span>
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => handleCopyText(previewAsset.secureUrl, 'URL CDN Cloudinary')}
              >
                <Copy size={14} aria-hidden="true" />
                <span>Salin URL CDN</span>
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setPreviewAsset(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
