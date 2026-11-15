import { useCallback, useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, RefreshCw, Search, Users } from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import {
  listCustomersPageUseCase,
  saveCustomerUseCase,
  setCustomerArchiveStatusUseCase,
} from '../../application/use-cases/masterDataUseCases.js';
import { CUSTOMER_STATUS } from '../../domain/enums/roles.js';
import {
  canArchiveCustomers,
  canManageCustomers,
} from '../../domain/policies/accessPolicy.js';
import { ModalDialog } from '../../shared/components/ModalDialog.jsx';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';

const PAGE_SIZE = 20;

const EMPTY_CUSTOMER_FORM = {
  name: '',
  phone: '',
  email: '',
  bandOrActName: '',
  notes: '',
};

export function CustomersPage() {
  const { member, isOnline } = useAuthSession();
  const canWrite = canManageCustomers(member);
  const canArchive = canArchiveCustomers(member);

  const [statusFilter, setStatusFilter] = useState(CUSTOMER_STATUS.ACTIVE);
  const [searchText, setSearchText] = useState('');
  const [customers, setCustomers] = useState([]);
  const [lastCursor, setLastCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [feedback, setFeedback] = useState({ variant: '', title: '', message: '' });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [form, setForm] = useState(EMPTY_CUSTOMER_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadFirstPage = useCallback(
    async (prefix = searchText, statusVal = statusFilter) => {
      if (!member?.businessId) return;
      setLoading(true);
      setErrorMessage('');
      try {
        const res = await listCustomersPageUseCase({
          member,
          status: statusVal,
          pageSize: PAGE_SIZE,
          cursorDoc: null,
          searchPrefix: prefix,
        });
        setCustomers(res.items);
        setLastCursor(res.lastDoc);
        setHasMore(res.hasMore);
      } catch (err) {
        setErrorMessage(err.message || 'Gagal memuat daftar customer.');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [member?.businessId, member?.role, member?.status],
  );

  useEffect(() => {
    loadFirstPage('', statusFilter);
  }, [loadFirstPage, statusFilter]);

  async function handleLoadMore() {
    if (!lastCursor || loadingMore) return;
    setLoadingMore(true);
    setErrorMessage('');
    try {
      const res = await listCustomersPageUseCase({
        member,
        status: statusFilter,
        pageSize: PAGE_SIZE,
        cursorDoc: lastCursor,
        searchPrefix: searchText,
      });
      setCustomers((prev) => [...prev, ...res.items]);
      setLastCursor(res.lastDoc);
      setHasMore(res.hasMore);
    } catch (err) {
      setErrorMessage(err.message || 'Gagal memuat halaman berikutnya.');
    } finally {
      setLoadingMore(false);
    }
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    loadFirstPage(searchText, statusFilter);
  }

  function openCreateDialog() {
    setEditingCustomer(null);
    setForm(EMPTY_CUSTOMER_FORM);
    setFormError('');
    setDialogOpen(true);
  }

  function openEditDialog(customer) {
    setEditingCustomer(customer);
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      bandOrActName: customer.bandOrActName || '',
      notes: customer.notes || '',
    });
    setFormError('');
    setDialogOpen(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await saveCustomerUseCase({
        member,
        existingCustomer: editingCustomer,
        isOnline,
        data: {
          name: form.name,
          phone: form.phone,
          email: form.email || null,
          bandOrActName: form.bandOrActName || null,
          notes: form.notes || null,
        },
      });
      setDialogOpen(false);
      setFeedback({
        variant: 'success',
        title: editingCustomer ? 'Data Customer Diperbarui' : 'Customer Ditambahkan',
        message: `Profil customer "${form.name.trim()}" berhasil disimpan.`,
      });
      loadFirstPage(searchText, statusFilter);
    } catch (err) {
      setFormError(err.message || 'Gagal menyimpan data customer.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchiveToggle(customer) {
    const nextArchived = customer.status !== CUSTOMER_STATUS.ARCHIVED;
    try {
      await setCustomerArchiveStatusUseCase({
        member,
        customer,
        archived: nextArchived,
        isOnline,
      });
      setFeedback({
        variant: 'success',
        title: nextArchived ? 'Customer Diarsipkan' : 'Customer Diaktifkan',
        message: `Status "${customer.name}" diubah menjadi ${nextArchived ? 'archived' : 'active'}.`,
      });
      loadFirstPage(searchText, statusFilter);
    } catch (err) {
      setFeedback({ variant: 'danger', title: 'Gagal Mengubah Status', message: err.message });
    }
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">
            Database customer bisnis dengan cursor pagination hemat kuota ({PAGE_SIZE} per halaman). Data historis tidak dihapus permanen.
          </p>
        </div>
        {canWrite && (
          <button type="button" className="btn btn-primary" onClick={openCreateDialog}>
            <Plus size={16} aria-hidden="true" />
            <span>Tambah Customer</span>
          </button>
        )}
      </header>

      <StatusAlert variant={feedback.variant || 'success'} title={feedback.title} message={feedback.message} />
      <StatusAlert variant="danger" title="Gagal Memuat Customer" message={errorMessage} />

      <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: '1 1 280px', maxWidth: '460px' }}>
          <input
            type="search"
            className="field-input"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Cari awalan nama customer..."
            aria-label="Cari customer berdasarkan awalan nama"
          />
          <button type="submit" className="btn">
            <Search size={16} aria-hidden="true" />
            <span>Cari</span>
          </button>
        </form>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`tab-btn ${statusFilter === CUSTOMER_STATUS.ACTIVE ? 'active' : ''}`}
            onClick={() => setStatusFilter(CUSTOMER_STATUS.ACTIVE)}
          >
            Aktif
          </button>
          <button
            type="button"
            className={`tab-btn ${statusFilter === CUSTOMER_STATUS.ARCHIVED ? 'active' : ''}`}
            onClick={() => setStatusFilter(CUSTOMER_STATUS.ARCHIVED)}
          >
            Arsip
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => loadFirstPage(searchText, statusFilter)}
            title="Segarkan daftar"
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>Muat Ulang</span>
          </button>
        </div>
      </section>

      {loading ? (
        <section className="panel skeleton" style={{ height: '180px' }} />
      ) : customers.length === 0 ? (
        <section className="empty-state">
          <Users size={28} color="var(--accent-brass)" aria-hidden="true" />
          <strong>
            {searchText.trim()
              ? `Tidak ditemukan customer dengan awalan "${searchText.trim()}"`
              : `Belum ada customer berstatus ${statusFilter}`}
          </strong>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>
            Tambahkan profil klien/band agar cepat dipilih saat membuat booking di Phase 03.
          </p>
        </section>
      ) : (
        <section style={{ display: 'grid', gap: '12px' }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nama Customer</th>
                  <th>Band / Act</th>
                  <th>Telepon / WA</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.customerId}>
                    <td>
                      <div style={{ display: 'grid', gap: '3px' }}>
                        <strong>{customer.name}</strong>
                        {customer.notes && (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {customer.notes}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{customer.bandOrActName || '-'}</td>
                    <td className="mono">{customer.phone}</td>
                    <td>{customer.email || '-'}</td>
                    <td>
                      <span
                        className={`badge ${
                          customer.status === CUSTOMER_STATUS.ACTIVE ? 'badge-success' : 'badge-warning'
                        }`}
                      >
                        {customer.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {canWrite && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => openEditDialog(customer)}
                          >
                            <Pencil size={14} aria-hidden="true" />
                            <span>Edit</span>
                          </button>
                        )}
                        {canArchive && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => handleArchiveToggle(customer)}
                            disabled={!isOnline}
                          >
                            {customer.status === CUSTOMER_STATUS.ACTIVE ? (
                              <>
                                <Archive size={14} aria-hidden="true" />
                                <span>Arsipkan</span>
                              </>
                            ) : (
                              <>
                                <ArchiveRestore size={14} aria-hidden="true" />
                                <span>Aktifkan</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button type="button" className="btn" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? 'Memuat...' : 'Muat Halaman Berikutnya'}
              </button>
            </div>
          )}
        </section>
      )}

      <ModalDialog
        open={dialogOpen}
        title={editingCustomer ? `Edit Customer — ${editingCustomer.name}` : 'Tambah Customer Baru'}
        description="Nomor WhatsApp/Telepon dan nama diperlukan agar komunikasi booking berjalan jelas."
        onClose={() => setDialogOpen(false)}
      >
        <StatusAlert variant="danger" title="Validasi Customer" message={formError} />
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '12px' }}>
          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="cust-name">
                Nama Lengkap / PIC
              </label>
              <input
                id="cust-name"
                type="text"
                className="field-input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Budi Santoso"
                required
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="cust-phone">
                Telepon / WhatsApp
              </label>
              <input
                id="cust-phone"
                type="tel"
                className="field-input mono"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="081234567890"
                required
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="cust-band">
                Nama Band / Artist (Opsional)
              </label>
              <input
                id="cust-band"
                type="text"
                className="field-input"
                value={form.bandOrActName}
                onChange={(e) => setForm((p) => ({ ...p, bandOrActName: e.target.value }))}
                placeholder="Senja Collective"
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="cust-email">
                Email (Opsional)
              </label>
              <input
                id="cust-email"
                type="email"
                className="field-input"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="band@example.com"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="cust-notes">
              Catatan Operasional (Opsional)
            </label>
            <textarea
              id="cust-notes"
              className="field-input"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Preferensi monitor, member reguler Selasa malam..."
              disabled={submitting}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button type="button" className="btn" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !isOnline}>
              {submitting ? 'Menyimpan...' : editingCustomer ? 'Simpan Perubahan' : 'Tambah Customer'}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
