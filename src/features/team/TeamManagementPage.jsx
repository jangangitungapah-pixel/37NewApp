import { useCallback, useMemo, useState } from 'react';
import { Pencil, ShieldAlert, UserPlus, Users2 } from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import { saveTeamMemberUseCase } from '../../application/use-cases/masterDataUseCases.js';
import { subscribeStudiosForMember } from '../../data/repositories/studioRepository.js';
import { subscribeBusinessMembers } from '../../data/repositories/teamRepository.js';
import {
  MEMBER_STATUS,
  OPERATOR_DEFAULT_PERMISSIONS,
  OWNER_DEFAULT_PERMISSIONS,
  ROLES,
} from '../../domain/enums/roles.js';
import { canManageMasterData } from '../../domain/policies/accessPolicy.js';
import { ModalDialog } from '../../shared/components/ModalDialog.jsx';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { useRegistrySubscription } from '../../shared/hooks/useRegistrySubscription.js';

const PERMISSION_LABELS = [
  { key: 'canManageBookings', label: 'Kelola Booking (Studio Ditugaskan)' },
  { key: 'canManageCustomers', label: 'Kelola Customer Aktif' },
  { key: 'canManageGallery', label: 'Kelola Gallery Cloudinary' },
  { key: 'canApplyDiscount', label: 'Berikan Diskon Booking' },
  { key: 'canSettleBookings', label: 'Settlement Pembayaran' },
];

const EMPTY_MEMBER_FORM = {
  uid: '',
  displayName: '',
  email: '',
  role: ROLES.OPERATOR,
  status: MEMBER_STATUS.ACTIVE,
  assignedStudioIds: [],
  permissions: { ...OPERATOR_DEFAULT_PERMISSIONS },
};

export function TeamManagementPage() {
  const { member, isOnline } = useAuthSession();
  const isOwner = canManageMasterData(member);
  const businessId = member?.businessId;

  const subscribeTeamFn = useCallback(
    ({ onData, onError }) => {
      if (!businessId || !isOwner) return () => {};
      return subscribeBusinessMembers({ businessId, onData, onError });
    },
    [businessId, isOwner],
  );

  const subscribeStudiosFn = useCallback(
    ({ onData, onError }) => {
      if (!businessId || !isOwner) return () => {};
      return subscribeStudiosForMember({
        businessId,
        member: { role: ROLES.OWNER, assignedStudioIds: [] },
        onData,
        onError,
      });
    },
    [businessId, isOwner],
  );

  const {
    data: teamMembers,
    loading,
    error: teamError,
  } = useRegistrySubscription('phase02:team', businessId && isOwner ? subscribeTeamFn : null, []);
  const { data: studios } = useRegistrySubscription(
    'phase02:team-studios',
    businessId && isOwner ? subscribeStudiosFn : null,
    [],
  );

  const studioNameMap = useMemo(() => {
    const map = new Map();
    for (const st of studios) {
      map.set(st.studioId, `${st.code} · ${st.name}`);
    }
    return map;
  }, [studios]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [form, setForm] = useState(EMPTY_MEMBER_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ variant: '', title: '', message: '' });

  function openCreateDialog() {
    setEditingMember(null);
    setForm(EMPTY_MEMBER_FORM);
    setFormError('');
    setDialogOpen(true);
  }

  function openEditDialog(target) {
    setEditingMember(target);
    setForm({
      uid: target.uid,
      displayName: target.displayName,
      email: target.email || '',
      role: target.role,
      status: target.status,
      assignedStudioIds: target.assignedStudioIds || [],
      permissions: {
        ...(target.role === ROLES.OWNER
          ? OWNER_DEFAULT_PERMISSIONS
          : OPERATOR_DEFAULT_PERMISSIONS),
        ...(target.permissions || {}),
      },
    });
    setFormError('');
    setDialogOpen(true);
  }

  function handleRoleChange(nextRole) {
    setForm((prev) => ({
      ...prev,
      role: nextRole,
      permissions:
        nextRole === ROLES.OWNER
          ? { ...OWNER_DEFAULT_PERMISSIONS }
          : { ...OPERATOR_DEFAULT_PERMISSIONS },
    }));
  }

  function toggleStudioAssignment(studioId) {
    setForm((prev) => {
      const exists = prev.assignedStudioIds.includes(studioId);
      return {
        ...prev,
        assignedStudioIds: exists
          ? prev.assignedStudioIds.filter((id) => id !== studioId)
          : [...prev.assignedStudioIds, studioId],
      };
    });
  }

  function togglePermissionFlag(key) {
    setForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key],
      },
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await saveTeamMemberUseCase({
        member,
        existingTargetMember: editingMember,
        isOnline,
        data: {
          uid: form.uid,
          displayName: form.displayName,
          email: form.email,
          role: form.role,
          status: form.status,
          assignedStudioIds: form.assignedStudioIds,
          permissions: form.permissions,
        },
      });
      setDialogOpen(false);
      setFeedback({
        variant: 'success',
        title: editingMember ? 'Membership Diperbarui' : 'Anggota Tim Terdaftar',
        message: `Akses "${form.displayName.trim()}" (${form.role}) telah diterapkan di Firestore Security Rules.`,
      });
    } catch (err) {
      setFormError(err.message || 'Gagal menyimpan membership tim.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Team & Access Control</h1>
          <p className="page-subtitle">
            Kelola role Owner/Operator, status keanggotaan, penugasan studio (`assignedStudioIds`), dan permission flags per anggota.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreateDialog}>
          <UserPlus size={16} aria-hidden="true" />
          <span>Daftarkan Anggota (UID)</span>
        </button>
      </header>

      <div className="alert">
        <ShieldAlert size={18} color="var(--accent-brass)" style={{ flexShrink: 0 }} aria-hidden="true" />
        <div style={{ fontSize: '13px' }}>
          <strong>Alur Onboarding Firebase Spark:</strong> Tanpa Cloud Functions Admin SDK, staf/operator membuat akun Firebase Authentication terlebih dahulu di halaman <code className="mono">/login</code>, lalu menyalin <strong>Firebase UID</strong> dari layar onboarding agar Anda tautkan di sini.
        </div>
      </div>

      <StatusAlert variant={feedback.variant || 'success'} title={feedback.title} message={feedback.message} />
      <StatusAlert variant="danger" title="Gagal Memuat Tim" message={teamError?.message || ''} />

      {loading ? (
        <section className="panel skeleton" style={{ height: '180px' }} />
      ) : teamMembers.length === 0 ? (
        <section className="empty-state">
          <Users2 size={28} color="var(--accent-brass)" aria-hidden="true" />
          <strong>Belum ada anggota terdaftar</strong>
        </section>
      ) : (
        <section className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Anggota</th>
                <th>Role & Status</th>
                <th>Penugasan Studio</th>
                <th>Permission Ringkas</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((item) => {
                const isSelfRow = item.uid === member?.uid;
                return (
                  <tr key={item.uid}>
                    <td>
                      <div style={{ display: 'grid', gap: '3px' }}>
                        <strong>
                          {item.displayName}{' '}
                          {isSelfRow && <span className="badge badge-info">Anda</span>}
                        </strong>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {item.email || '-'}
                        </span>
                        <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          UID: {item.uid}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <span className="badge mono" style={{ textTransform: 'capitalize' }}>
                          {item.role}
                        </span>
                        <span
                          className={`badge ${
                            item.status === MEMBER_STATUS.ACTIVE
                              ? 'badge-success'
                              : item.status === MEMBER_STATUS.INVITED
                                ? 'badge-info'
                                : 'badge-danger'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    </td>
                    <td>
                      {item.role === ROLES.OWNER ? (
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          Semua studio dalam bisnis
                        </span>
                      ) : item.assignedStudioIds?.length ? (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {item.assignedStudioIds.map((stId) => (
                            <span key={stId} className="badge mono" style={{ fontSize: '11px' }}>
                              {studioNameMap.get(stId) || stId}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--status-warning)' }}>
                          Belum ada studio ditugaskan
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {item.role === ROLES.OWNER
                        ? 'Full Owner Authority'
                        : PERMISSION_LABELS.filter((p) => item.permissions?.[p.key])
                            .map((p) => p.label.split(' ')[1] || p.key)
                            .join(', ') || 'Minimal'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => openEditDialog(item)}
                      >
                        <Pencil size={14} aria-hidden="true" />
                        <span>Atur Akses</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <ModalDialog
        open={dialogOpen}
        title={
          editingMember
            ? `Atur Membership — ${editingMember.displayName}`
            : 'Daftarkan Anggota Tim Baru'
        }
        description="Perubahan role, status, atau assignedStudioIds langsung mengubah enforcement di Firestore Security Rules."
        onClose={() => setDialogOpen(false)}
      >
        <StatusAlert variant="danger" title="Validasi Membership" message={formError} />
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '12px' }}>
          <div className="field">
            <label className="field-label" htmlFor="team-uid">
              Firebase Auth UID
            </label>
            <input
              id="team-uid"
              type="text"
              className="field-input mono"
              value={form.uid}
              onChange={(e) => setForm((p) => ({ ...p, uid: e.target.value }))}
              placeholder="Tempel UID user dari Firebase Auth"
              required
              disabled={submitting || Boolean(editingMember)}
            />
          </div>

          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="team-name">
                Nama Tampilan
              </label>
              <input
                id="team-name"
                type="text"
                className="field-input"
                value={form.displayName}
                onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                placeholder="Andi Operator"
                required
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="team-email">
                Email Anggota
              </label>
              <input
                id="team-email"
                type="email"
                className="field-input"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="operator@37musicstudio.com"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="team-role">
                Role Portal
              </label>
              <select
                id="team-role"
                className="field-input"
                value={form.role}
                onChange={(e) => handleRoleChange(e.target.value)}
                disabled={submitting || editingMember?.uid === member?.uid}
              >
                <option value={ROLES.OPERATOR}>Operator</option>
                <option value={ROLES.OWNER}>Owner</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="team-status">
                Status Keanggotaan
              </label>
              <select
                id="team-status"
                className="field-input"
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                disabled={submitting || editingMember?.uid === member?.uid}
              >
                <option value={MEMBER_STATUS.ACTIVE}>Active</option>
                <option value={MEMBER_STATUS.INVITED}>Invited</option>
                <option value={MEMBER_STATUS.SUSPENDED}>Suspended</option>
                <option value={MEMBER_STATUS.REVOKED}>Revoked</option>
              </select>
            </div>
          </div>

          {form.role === ROLES.OPERATOR && (
            <>
              <div className="field">
                <span className="field-label">Penugasan Studio (`assignedStudioIds`)</span>
                {studios.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                    Belum ada studio terdaftar. Tambahkan studio terlebih dahulu di menu Studios & Rooms.
                  </p>
                ) : (
                  <div className="checkbox-grid">
                    {studios.map((st) => (
                      <label key={st.studioId} className="checkbox-card">
                        <input
                          type="checkbox"
                          checked={form.assignedStudioIds.includes(st.studioId)}
                          onChange={() => toggleStudioAssignment(st.studioId)}
                          disabled={submitting}
                        />
                        <span>
                          {st.code} · {st.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="field">
                <span className="field-label">Permission Operasional</span>
                <div className="checkbox-grid">
                  {PERMISSION_LABELS.map((perm) => (
                    <label key={perm.key} className="checkbox-card">
                      <input
                        type="checkbox"
                        checked={Boolean(form.permissions[perm.key])}
                        onChange={() => togglePermissionFlag(perm.key)}
                        disabled={submitting}
                      />
                      <span>{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button type="button" className="btn" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !isOnline}>
              {submitting ? 'Menyimpan...' : editingMember ? 'Simpan Perubahan' : 'Daftarkan Anggota'}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
