import { useCallback, useMemo, useState } from 'react';
import { Clock, DoorOpen, Pencil, Plus, Power } from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import {
  saveStudioUseCase,
  toggleStudioStatusUseCase,
} from '../../application/use-cases/masterDataUseCases.js';
import { subscribeStudiosForMember } from '../../data/repositories/studioRepository.js';
import {
  SLOT_GRANULARITY_OPTIONS,
  STUDIO_STATUS,
} from '../../domain/enums/roles.js';
import {
  canManageMasterData,
  filterAccessibleStudios,
} from '../../domain/policies/accessPolicy.js';
import { ModalDialog } from '../../shared/components/ModalDialog.jsx';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { useRegistrySubscription } from '../../shared/hooks/useRegistrySubscription.js';
import { formatOperatingHours } from '../../shared/utils/formatters.js';

const EMPTY_STUDIO_FORM = {
  name: '',
  code: '',
  status: STUDIO_STATUS.ACTIVE,
  timezone: 'Asia/Jakarta',
  openTime: '10:00',
  closeTime: '22:00',
  slotGranularityMinutes: 15,
  description: '',
};

export function StudiosPage() {
  const { member, business, isOnline } = useAuthSession();
  const canManage = canManageMasterData(member);
  const assignedKey = (member?.assignedStudioIds || []).join(',');

  const subscribeFn = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId) return () => {};
      return subscribeStudiosForMember({
        businessId: member.businessId,
        member,
        onData,
        onError,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [member?.businessId, member?.role, assignedKey],
  );

  const {
    data: rawStudios,
    loading,
    error: subscriptionError,
  } = useRegistrySubscription('phase02:studios', member?.businessId ? subscribeFn : null, []);

  const studios = useMemo(
    () => filterAccessibleStudios(member, rawStudios),
    [member, rawStudios],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStudio, setEditingStudio] = useState(null);
  const [form, setForm] = useState(EMPTY_STUDIO_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ variant: '', title: '', message: '' });
  const [formError, setFormError] = useState('');

  function openCreateDialog() {
    setEditingStudio(null);
    setForm({
      ...EMPTY_STUDIO_FORM,
      timezone: business?.timezone || 'Asia/Jakarta',
    });
    setFormError('');
    setDialogOpen(true);
  }

  function openEditDialog(studio) {
    setEditingStudio(studio);
    setForm({
      name: studio.name,
      code: studio.code,
      status: studio.status,
      timezone: studio.timezone,
      openTime: studio.operatingHours?.openTime || '10:00',
      closeTime: studio.operatingHours?.closeTime || '22:00',
      slotGranularityMinutes: studio.slotGranularityMinutes || 15,
      description: studio.description || '',
    });
    setFormError('');
    setDialogOpen(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await saveStudioUseCase({
        member,
        existingStudio: editingStudio,
        isOnline,
        data: {
          name: form.name,
          code: form.code,
          status: form.status,
          timezone: form.timezone,
          operatingHours: {
            openTime: form.openTime,
            closeTime: form.closeTime,
          },
          slotGranularityMinutes: Number(form.slotGranularityMinutes),
          description: form.description || null,
        },
      });
      setDialogOpen(false);
      setFeedback({
        variant: 'success',
        title: editingStudio ? 'Studio Diperbarui' : 'Studio Ditambahkan',
        message: `Data studio "${form.name.trim()}" berhasil disimpan ke Firestore.`,
      });
    } catch (err) {
      setFormError(err.message || 'Gagal menyimpan data studio.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(studio) {
    setFeedback({ variant: '', title: '', message: '' });
    try {
      await toggleStudioStatusUseCase({ member, studio, isOnline });
      setFeedback({
        variant: 'success',
        title: 'Status Studio Diubah',
        message: `Studio "${studio.name}" sekarang berstatus ${
          studio.status === STUDIO_STATUS.ACTIVE ? 'inactive' : 'active'
        }.`,
      });
    } catch (err) {
      setFeedback({
        variant: 'danger',
        title: 'Gagal Mengubah Status',
        message: err.message || 'Terjadi kesalahan saat mengubah status studio.',
      });
    }
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">
            {canManage ? 'Studios & Rooms' : 'Studio yang Ditugaskan'}
          </h1>
          <p className="page-subtitle">
            {canManage
              ? 'Kelola studio/room operasional, kode ruang, jam buka–tutup, dan granularitas slot kalender.'
              : 'Daftar ruang studio yang termasuk dalam assignedStudioIds keanggotaan Anda.'}
          </p>
        </div>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={openCreateDialog}>
            <Plus size={16} aria-hidden="true" />
            <span>Tambah Studio</span>
          </button>
        )}
      </header>

      <StatusAlert variant={feedback.variant || 'success'} title={feedback.title} message={feedback.message} />
      <StatusAlert
        variant="danger"
        title="Gagal Memuat Studio"
        message={subscriptionError?.message || ''}
      />

      {loading ? (
        <section className="grid-2" aria-busy="true">
          <div className="panel skeleton" style={{ height: '140px' }} />
          <div className="panel skeleton" style={{ height: '140px' }} />
        </section>
      ) : studios.length === 0 ? (
        <section className="empty-state">
          <DoorOpen size={28} color="var(--accent-brass)" aria-hidden="true" />
          <strong style={{ fontSize: '16px' }}>
            {canManage
              ? 'Belum ada studio atau ruangan terdaftar'
              : 'Belum ada studio yang ditugaskan kepada Anda'}
          </strong>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '460px' }}>
            {canManage
              ? 'Tambahkan minimal satu studio aktif (mis. Studio A — Rehearsal / Recording) agar siap dipakai pada Phase 03 Booking Engine.'
              : 'Hubungi Owner bisnis agar menambahkan ID studio ke daftar assignedStudioIds akun Anda.'}
          </p>
          {canManage && (
            <button type="button" className="btn btn-primary" onClick={openCreateDialog}>
              <Plus size={16} aria-hidden="true" />
              <span>Buat Studio Pertama</span>
            </button>
          )}
        </section>
      ) : (
        <section className="grid-2">
          {studios.map((studio) => {
            const isActive = studio.status === STUDIO_STATUS.ACTIVE;
            return (
              <article key={studio.studioId} className="panel" style={{ display: 'grid', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="badge mono">{studio.code}</span>
                      <span className={`badge ${isActive ? 'badge-success' : 'badge-warning'}`}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <h2 style={{ margin: '8px 0 0', fontSize: '18px' }}>{studio.name}</h2>
                  </div>

                  {canManage && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => openEditDialog(studio)}
                        aria-label={`Edit studio ${studio.name}`}
                      >
                        <Pencil size={14} aria-hidden="true" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleToggleStatus(studio)}
                        disabled={!isOnline}
                        title={isActive ? 'Nonaktifkan studio' : 'Aktifkan studio'}
                      >
                        <Power size={14} aria-hidden="true" />
                        <span>{isActive ? 'Nonaktifkan' : 'Aktifkan'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {studio.description && (
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {studio.description}
                  </p>
                )}

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '12px',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border-subtle)',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} aria-hidden="true" />
                    <span>{formatOperatingHours(studio.operatingHours)}</span>
                  </span>
                  <span className="mono">Slot: {studio.slotGranularityMinutes} menit</span>
                  <span className="mono">{studio.timezone}</span>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <ModalDialog
        open={dialogOpen}
        title={editingStudio ? `Edit Studio — ${editingStudio.name}` : 'Tambah Studio Baru'}
        description="Perubahan jam operasional dan granularitas slot tersimpan langsung ke Firestore dan terbaca oleh portal lain."
        onClose={() => setDialogOpen(false)}
      >
        <StatusAlert variant="danger" title="Validasi Gagal" message={formError} />
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '12px' }}>
          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="studio-name">
                Nama Studio / Room
              </label>
              <input
                id="studio-name"
                type="text"
                className="field-input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Studio A — Live Rehearsal"
                required
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="studio-code">
                Kode Unik (2–20 huruf/angka)
              </label>
              <input
                id="studio-code"
                type="text"
                className="field-input mono"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="STUDIO-A"
                required
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid-3">
            <div className="field">
              <label className="field-label" htmlFor="studio-open">
                Jam Buka
              </label>
              <input
                id="studio-open"
                type="time"
                className="field-input"
                value={form.openTime}
                onChange={(e) => setForm((p) => ({ ...p, openTime: e.target.value }))}
                required
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="studio-close">
                Jam Tutup
              </label>
              <input
                id="studio-close"
                type="time"
                className="field-input"
                value={form.closeTime}
                onChange={(e) => setForm((p) => ({ ...p, closeTime: e.target.value }))}
                required
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="studio-granularity">
                Granularitas Slot
              </label>
              <select
                id="studio-granularity"
                className="field-input"
                value={form.slotGranularityMinutes}
                onChange={(e) => setForm((p) => ({ ...p, slotGranularityMinutes: Number(e.target.value) }))}
                disabled={submitting}
              >
                {SLOT_GRANULARITY_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} menit
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="studio-timezone">
                Timezone (IANA)
              </label>
              <input
                id="studio-timezone"
                type="text"
                className="field-input mono"
                value={form.timezone}
                onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
                required
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="studio-status">
                Status Operasional
              </label>
              <select
                id="studio-status"
                className="field-input"
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                disabled={submitting}
              >
                <option value={STUDIO_STATUS.ACTIVE}>Active</option>
                <option value={STUDIO_STATUS.INACTIVE}>Inactive</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="studio-description">
              Catatan Perlengkapan / Deskripsi (Opsional)
            </label>
            <textarea
              id="studio-description"
              className="field-input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Drum Mapex, Ampli Marshall JCM900, 2x Vocal Mic..."
              disabled={submitting}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button type="button" className="btn" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !isOnline}>
              {submitting ? 'Menyimpan...' : editingStudio ? 'Simpan Perubahan' : 'Tambah Studio'}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
