import { useCallback, useMemo, useState } from 'react';
import { Calculator, Layers, Pencil, Plus, Sparkles } from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import {
  saveServiceUseCase,
  seedStarterServicesUseCase,
  toggleServiceActiveUseCase,
} from '../../application/use-cases/masterDataUseCases.js';
import { subscribeBusinessSettings } from '../../data/repositories/businessProfileRepository.js';
import { subscribeServices } from '../../data/repositories/serviceRepository.js';
import { subscribeStudiosForMember } from '../../data/repositories/studioRepository.js';
import { calculateOperatorCommission } from '../../domain/calculations/commissionCalculator.js';
import { calculateServicePrice } from '../../domain/calculations/pricingCalculator.js';
import {
  COMMISSION_METHOD,
  PRICING_MODEL,
  SERVICE_CATEGORY,
  SETTING_IDS,
} from '../../domain/enums/roles.js';
import { canManageMasterData } from '../../domain/policies/accessPolicy.js';
import { ModalDialog } from '../../shared/components/ModalDialog.jsx';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { useRegistrySubscription } from '../../shared/hooks/useRegistrySubscription.js';
import { formatIdr, parseDurationOptionsInput } from '../../shared/utils/formatters.js';

const EMPTY_SERVICE_FORM = {
  name: '',
  category: SERVICE_CATEGORY.REHEARSAL,
  pricingModel: PRICING_MODEL.HOURLY,
  durationOptionsText: '60, 120, 180',
  basePriceMinor: '120000',
  commissionMethod: COMMISSION_METHOD.INHERIT,
  commissionValue: '0',
  applicableStudioIds: [],
  active: true,
  description: '',
};

const MODEL_LABELS = {
  [PRICING_MODEL.HOURLY]: 'Per Jam',
  [PRICING_MODEL.PACKAGE]: 'Paket Sesi',
  [PRICING_MODEL.FIXED_SESSION]: 'Tarif Tetap',
};

export function ServicesPricingPage() {
  const { member, isOnline } = useAuthSession();
  const canManage = canManageMasterData(member);
  const businessId = member?.businessId;
  const assignedKey = (member?.assignedStudioIds || []).join(',');

  const subscribeServicesFn = useCallback(
    ({ onData, onError }) => {
      if (!businessId) return () => {};
      return subscribeServices({ businessId, onData, onError });
    },
    [businessId],
  );

  const subscribeSettingsFn = useCallback(
    ({ onData, onError }) => {
      if (!businessId) return () => {};
      return subscribeBusinessSettings({ businessId, onData, onError });
    },
    [businessId],
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
    data: services,
    loading,
    error: subscriptionError,
  } = useRegistrySubscription('phase02:services', businessId ? subscribeServicesFn : null, []);
  const { data: settingsMap } = useRegistrySubscription(
    'phase02:services-settings',
    businessId ? subscribeSettingsFn : null,
    {},
  );
  const { data: studios } = useRegistrySubscription(
    'phase02:services-studios',
    businessId ? subscribeStudiosFn : null,
    [],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [form, setForm] = useState(EMPTY_SERVICE_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [feedback, setFeedback] = useState({ variant: '', title: '', message: '' });

  // Live snapshot simulator state
  const [simServiceId, setSimServiceId] = useState('');
  const [simDuration, setSimDuration] = useState(120);
  const [simDiscountText, setSimDiscountText] = useState('0');

  const selectedSimService = useMemo(() => {
    if (!services.length) return null;
    return services.find((s) => s.serviceId === simServiceId) || services[0];
  }, [services, simServiceId]);

  const effectiveSimDuration = useMemo(() => {
    if (!selectedSimService?.durationOptions?.length) return 60;
    return selectedSimService.durationOptions.includes(Number(simDuration))
      ? Number(simDuration)
      : selectedSimService.durationOptions[0];
  }, [selectedSimService, simDuration]);

  const simulatorResult = useMemo(() => {
    if (!selectedSimService) return null;
    try {
      const pricingPolicy = settingsMap[SETTING_IDS.PRICING] || { taxPercent: 0 };
      const commissionPolicy = settingsMap[SETTING_IDS.COMMISSION] || null;
      const discountMinor = Math.max(0, Number.parseInt(simDiscountText || '0', 10) || 0);

      const price = calculateServicePrice({
        service: selectedSimService,
        durationMinutes: effectiveSimDuration,
        discountMinor,
        taxPercent: pricingPolicy.taxPercent || 0,
      });

      const commission = calculateOperatorCommission({
        service: selectedSimService,
        commissionSetting: commissionPolicy,
        grossAmountMinor: price.baseSubtotalMinor,
        netAmountMinor: price.netBeforeTaxMinor,
      });

      return { price, commission, error: '' };
    } catch (err) {
      return { price: null, commission: null, error: err.message };
    }
  }, [selectedSimService, effectiveSimDuration, simDiscountText, settingsMap]);

  function openCreateDialog() {
    setEditingService(null);
    setForm(EMPTY_SERVICE_FORM);
    setFormError('');
    setDialogOpen(true);
  }

  function openEditDialog(service) {
    setEditingService(service);
    setForm({
      name: service.name,
      category: service.category,
      pricingModel: service.pricingModel,
      durationOptionsText: (service.durationOptions || [60, 120]).join(', '),
      basePriceMinor: String(service.basePriceMinor ?? 0),
      commissionMethod: service.commissionMethod || COMMISSION_METHOD.INHERIT,
      commissionValue: String(service.commissionValue ?? 0),
      applicableStudioIds: service.applicableStudioIds || [],
      active: service.active,
      description: service.description || '',
    });
    setFormError('');
    setDialogOpen(true);
  }

  function handleStudioToggle(studioId) {
    setForm((prev) => {
      const exists = prev.applicableStudioIds.includes(studioId);
      return {
        ...prev,
        applicableStudioIds: exists
          ? prev.applicableStudioIds.filter((id) => id !== studioId)
          : [...prev.applicableStudioIds, studioId],
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    const durationOptions = parseDurationOptionsInput(form.durationOptionsText);
    if (durationOptions.length === 0) {
      setFormError('Masukkan minimal satu durasi kelipatan/nilai 15–1440 menit (contoh: 60, 120, 180).');
      return;
    }

    const parsedBasePrice = Number(form.basePriceMinor);
    const parsedCommissionVal = Number(form.commissionValue || 0);
    if (!Number.isInteger(parsedBasePrice) || parsedBasePrice < 0) {
      setFormError('Tarif dasar (IDR) wajib berupa bilangan bulat >= 0.');
      return;
    }
    if (!Number.isInteger(parsedCommissionVal) || parsedCommissionVal < 0) {
      setFormError('Nilai komisi override wajib berupa bilangan bulat >= 0.');
      return;
    }

    setSubmitting(true);
    try {
      await saveServiceUseCase({
        member,
        existingService: editingService,
        isOnline,
        data: {
          name: form.name,
          category: form.category,
          pricingModel: form.pricingModel,
          durationOptions,
          basePriceMinor: parsedBasePrice,
          durationPricesMinor: editingService?.durationPricesMinor || {},
          commissionMethod: form.commissionMethod,
          commissionValue:
            form.commissionMethod === COMMISSION_METHOD.INHERIT ||
            form.commissionMethod === COMMISSION_METHOD.NONE
              ? 0
              : parsedCommissionVal,
          applicableStudioIds: form.applicableStudioIds,
          active: form.active,
          description: form.description || null,
        },
      });
      setDialogOpen(false);
      setFeedback({
        variant: 'success',
        title: editingService ? 'Layanan Diperbarui (Versi Config Bertambah)' : 'Layanan Ditambahkan',
        message: `Layanan "${form.name.trim()}" tersimpan dengan harga integer IDR.`,
      });
    } catch (err) {
      setFormError(err.message || 'Gagal menyimpan layanan.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSeedStarter() {
    setFeedback({ variant: '', title: '', message: '' });
    try {
      const res = await seedStarterServicesUseCase({ member, isOnline });
      setFeedback({
        variant: 'success',
        title: 'Layanan Awal Dibuat',
        message: `${res.count} layanan standar (Rehearsal, Recording, Mixing, Mastering) berhasil dibuat.`,
      });
    } catch (err) {
      setFeedback({
        variant: 'danger',
        title: 'Gagal Membuat Layanan Awal',
        message: err.message,
      });
    }
  }

  async function handleToggleActive(service) {
    try {
      await toggleServiceActiveUseCase({ member, service, isOnline });
      setFeedback({
        variant: 'success',
        title: 'Status Layanan Diperbarui',
        message: `Layanan "${service.name}" sekarang ${service.active ? 'nonaktif' : 'aktif'}.`,
      });
    } catch (err) {
      setFeedback({ variant: 'danger', title: 'Gagal Mengubah Status', message: err.message });
    }
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Services & Pricing Catalog</h1>
          <p className="page-subtitle">
            {canManage
              ? 'Kelola kategori Rehearsal, Recording, Mixing, Mastering dengan harga integer IDR, versi config, dan aturan komisi.'
              : 'Katalog tarif layanan aktif dan durasi yang tersedia pada studio Anda (read-only).'}
          </p>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {services.length === 0 && (
              <button type="button" className="btn" onClick={handleSeedStarter} disabled={!isOnline}>
                <Sparkles size={16} aria-hidden="true" />
                <span>Isi 4 Layanan Starter</span>
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={openCreateDialog}>
              <Plus size={16} aria-hidden="true" />
              <span>Tambah Layanan</span>
            </button>
          </div>
        )}
      </header>

      <StatusAlert variant={feedback.variant || 'success'} title={feedback.title} message={feedback.message} />
      <StatusAlert variant="danger" title="Gagal Memuat Katalog" message={subscriptionError?.message || ''} />

      {loading ? (
        <section className="panel skeleton" style={{ height: '180px' }} />
      ) : services.length === 0 ? (
        <section className="empty-state">
          <Layers size={28} color="var(--accent-brass)" aria-hidden="true" />
          <strong>Belum ada layanan & paket tarif</strong>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '480px' }}>
            {canManage
              ? 'Gunakan tombol "Isi 4 Layanan Starter" untuk memulai dengan Rehearsal, Recording, Mixing, dan Mastering, atau buat layanan kustom.'
              : 'Owner belum menambahkan layanan studio pada bisnis ini.'}
          </p>
        </section>
      ) : (
        <>
          <section className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Layanan & Versi</th>
                  <th>Kategori / Model</th>
                  <th>Opsi Durasi</th>
                  <th>Tarif Dasar</th>
                  <th>Aturan Komisi</th>
                  <th>Status</th>
                  {canManage && <th>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.serviceId}>
                    <td>
                      <div style={{ display: 'grid', gap: '4px' }}>
                        <strong>{service.name}</strong>
                        <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          v{service.configVersion} · {service.applicableStudioIds?.length ? `${service.applicableStudioIds.length} studio` : 'Semua studio'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'grid', gap: '4px' }}>
                        <span style={{ textTransform: 'capitalize' }}>{service.category}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {MODEL_LABELS[service.pricingModel] || service.pricingModel}
                        </span>
                      </div>
                    </td>
                    <td className="mono">{service.durationOptions.join(', ')} mnt</td>
                    <td className="mono">
                      <strong>{formatIdr(service.basePriceMinor)}</strong>
                      {service.pricingModel === PRICING_MODEL.HOURLY ? ' / jam' : ''}
                    </td>
                    <td>
                      {service.commissionMethod === COMMISSION_METHOD.INHERIT ? (
                        <span style={{ color: 'var(--text-secondary)' }}>Ikuti Policy Bisnis</span>
                      ) : service.commissionMethod === COMMISSION_METHOD.NONE ? (
                        <span>Tidak Ada (0)</span>
                      ) : service.commissionMethod === COMMISSION_METHOD.PERCENTAGE ? (
                        <span className="mono">{service.commissionValue}% override</span>
                      ) : (
                        <span className="mono">{formatIdr(service.commissionValue)} / booking</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${service.active ? 'badge-success' : 'badge-warning'}`}>
                        {service.active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => openEditDialog(service)}
                          >
                            <Pencil size={14} aria-hidden="true" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => handleToggleActive(service)}
                            disabled={!isOnline}
                          >
                            {service.active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel" style={{ display: 'grid', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calculator size={18} color="var(--accent-brass)" aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: '16px' }}>Simulasi Kalkulator Snapshot Harga & Komisi</h2>
            </div>

            <div className="grid-3">
              <div className="field">
                <label className="field-label" htmlFor="sim-service">
                  Layanan
                </label>
                <select
                  id="sim-service"
                  className="field-input"
                  value={selectedSimService?.serviceId || ''}
                  onChange={(e) => setSimServiceId(e.target.value)}
                >
                  {services.map((s) => (
                    <option key={s.serviceId} value={s.serviceId}>
                      {s.name} ({MODEL_LABELS[s.pricingModel]})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="sim-duration">
                  Durasi Sesi
                </label>
                <select
                  id="sim-duration"
                  className="field-input"
                  value={effectiveSimDuration}
                  onChange={(e) => setSimDuration(Number(e.target.value))}
                >
                  {(selectedSimService?.durationOptions || [60]).map((mins) => (
                    <option key={mins} value={mins}>
                      {mins} menit ({(mins / 60).toFixed(mins % 60 === 0 ? 0 : 1)} jam)
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="sim-discount">
                  Simulasi Diskon (IDR Integer)
                </label>
                <input
                  id="sim-discount"
                  type="number"
                  min={0}
                  step={1000}
                  className="field-input mono"
                  value={simDiscountText}
                  onChange={(e) => setSimDiscountText(e.target.value)}
                />
              </div>
            </div>

            {simulatorResult?.error ? (
              <StatusAlert variant="warning" title="Simulasi Tidak Valid" message={simulatorResult.error} />
            ) : simulatorResult?.price && (
              <div className="grid-3">
                <div className="alert">
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Total Harga Customer</div>
                    <strong className="mono" style={{ fontSize: '18px' }}>
                      {formatIdr(simulatorResult.price.totalMinor)}
                    </strong>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Subtotal {formatIdr(simulatorResult.price.baseSubtotalMinor)} · Pajak{' '}
                      {simulatorResult.price.taxPercent}% ({formatIdr(simulatorResult.price.taxMinor)})
                    </div>
                  </div>
                </div>
                <div className="alert">
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Estimasi Komisi Operator</div>
                    <strong className="mono" style={{ fontSize: '18px' }}>
                      {formatIdr(simulatorResult.commission?.amountMinor || 0)}
                    </strong>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Sumber: {simulatorResult.commission?.source === 'service_override' ? 'Override Service' : 'Policy Bisnis'} (
                      {simulatorResult.commission?.method})
                    </div>
                  </div>
                </div>
                <div className="alert">
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Versi Config Snapshot</div>
                    <strong className="mono" style={{ fontSize: '18px' }}>
                      v{simulatorResult.price.configVersion}
                    </strong>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Disalin ke booking saat konfirmasi (Phase 03)
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      <ModalDialog
        open={dialogOpen}
        title={editingService ? `Edit Layanan — ${editingService.name}` : 'Tambah Layanan Studio'}
        description="Tarif wajib bilangan bulat IDR. Perubahan harga menaikkan configVersion secara otomatis."
        onClose={() => setDialogOpen(false)}
      >
        <StatusAlert variant="danger" title="Validasi Layanan" message={formError} />
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '12px' }}>
          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="svc-name">
                Nama Layanan
              </label>
              <input
                id="svc-name"
                type="text"
                className="field-input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Studio Rehearsal"
                required
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="svc-category">
                Kategori
              </label>
              <select
                id="svc-category"
                className="field-input"
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                disabled={submitting}
              >
                <option value={SERVICE_CATEGORY.REHEARSAL}>Rehearsal</option>
                <option value={SERVICE_CATEGORY.RECORDING}>Recording</option>
                <option value={SERVICE_CATEGORY.MIXING}>Mixing</option>
                <option value={SERVICE_CATEGORY.MASTERING}>Mastering</option>
              </select>
            </div>
          </div>

          <div className="grid-3">
            <div className="field">
              <label className="field-label" htmlFor="svc-model">
                Model Pricing
              </label>
              <select
                id="svc-model"
                className="field-input"
                value={form.pricingModel}
                onChange={(e) => setForm((p) => ({ ...p, pricingModel: e.target.value }))}
                disabled={submitting}
              >
                <option value={PRICING_MODEL.HOURLY}>Per Jam (pro-rata durasi)</option>
                <option value={PRICING_MODEL.PACKAGE}>Paket Sesi</option>
                <option value={PRICING_MODEL.FIXED_SESSION}>Tarif Tetap</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="svc-price">
                Tarif Dasar (IDR Bulat)
              </label>
              <input
                id="svc-price"
                type="number"
                min={0}
                step={1000}
                className="field-input mono"
                value={form.basePriceMinor}
                onChange={(e) => setForm((p) => ({ ...p, basePriceMinor: e.target.value }))}
                required
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="svc-durations">
                Opsi Durasi (Menit)
              </label>
              <input
                id="svc-durations"
                type="text"
                className="field-input mono"
                value={form.durationOptionsText}
                onChange={(e) => setForm((p) => ({ ...p, durationOptionsText: e.target.value }))}
                placeholder="60, 120, 180"
                required
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="svc-commission-method">
                Aturan Komisi Layanan
              </label>
              <select
                id="svc-commission-method"
                className="field-input"
                value={form.commissionMethod}
                onChange={(e) => setForm((p) => ({ ...p, commissionMethod: e.target.value }))}
                disabled={submitting}
              >
                <option value={COMMISSION_METHOD.INHERIT}>Ikuti Default Commission Settings</option>
                <option value={COMMISSION_METHOD.PERCENTAGE}>Override Persentase (%)</option>
                <option value={COMMISSION_METHOD.FIXED_PER_BOOKING}>Override Nominal Tetap (IDR)</option>
                <option value={COMMISSION_METHOD.NONE}>Tanpa Komisi (Rp 0)</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="svc-commission-val">
                {form.commissionMethod === COMMISSION_METHOD.PERCENTAGE
                  ? 'Persentase Komisi (%)'
                  : 'Nominal Tetap Komisi (IDR)'}
              </label>
              <input
                id="svc-commission-val"
                type="number"
                min={0}
                max={form.commissionMethod === COMMISSION_METHOD.PERCENTAGE ? 100 : undefined}
                className="field-input mono"
                value={form.commissionValue}
                onChange={(e) => setForm((p) => ({ ...p, commissionValue: e.target.value }))}
                disabled={
                  submitting ||
                  form.commissionMethod === COMMISSION_METHOD.INHERIT ||
                  form.commissionMethod === COMMISSION_METHOD.NONE
                }
              />
            </div>
          </div>

          {studios.length > 0 && (
            <div className="field">
              <span className="field-label">Berlaku untuk Studio (kosongkan = semua studio)</span>
              <div className="checkbox-grid">
                {studios.map((st) => (
                  <label key={st.studioId} className="checkbox-card">
                    <input
                      type="checkbox"
                      checked={form.applicableStudioIds.includes(st.studioId)}
                      onChange={() => handleStudioToggle(st.studioId)}
                      disabled={submitting}
                    />
                    <span>
                      {st.code} · {st.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="svc-description">
              Deskripsi Layanan (Opsional)
            </label>
            <textarea
              id="svc-description"
              className="field-input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              disabled={submitting}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button type="button" className="btn" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !isOnline}>
              {submitting ? 'Menyimpan...' : editingService ? 'Simpan Perubahan' : 'Tambah Layanan'}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
