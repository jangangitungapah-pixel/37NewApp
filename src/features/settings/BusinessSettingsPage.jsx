import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CalendarClock,
  Coins,
  Percent,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import {
  initializeDefaultMasterDataUseCase,
  saveBusinessProfileUseCase,
  saveBusinessSettingUseCase,
} from '../../application/use-cases/masterDataUseCases.js';
import {
  subscribeBusinessProfile,
  subscribeBusinessSettings,
} from '../../data/repositories/businessProfileRepository.js';
import {
  BOOKING_INITIAL_STATUS_POLICY,
  BUSINESS_STATUS,
  COMMISSION_BASIS,
  COMMISSION_METHOD,
  SETTING_IDS,
  SLOT_GRANULARITY_OPTIONS,
} from '../../domain/enums/roles.js';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { useRegistrySubscription } from '../../shared/hooks/useRegistrySubscription.js';

const TABS = [
  { id: 'profile', label: 'Profil Bisnis', icon: Building2 },
  { id: SETTING_IDS.SCHEDULE, label: 'Jam & Slot', icon: CalendarClock },
  { id: SETTING_IDS.PRICING, label: 'Kebijakan Harga', icon: Coins },
  { id: SETTING_IDS.COMMISSION, label: 'Kebijakan Komisi', icon: Percent },
  { id: SETTING_IDS.BOOKING_POLICY, label: 'Policy Booking', icon: ShieldCheck },
];

export function BusinessSettingsPage() {
  const { member, business, isOnline } = useAuthSession();
  const businessId = member?.businessId;

  const subscribeProfileFn = useCallback(
    ({ onData, onError }) => {
      if (!businessId) return () => {};
      return subscribeBusinessProfile({ businessId, onData, onError });
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

  const { data: profileDoc, loading: loadingProfile } = useRegistrySubscription(
    'phase02:settings-profile',
    businessId ? subscribeProfileFn : null,
    null,
  );
  const { data: settingsMap, loading: loadingSettings } = useRegistrySubscription(
    'phase02:settings-docs',
    businessId ? subscribeSettingsFn : null,
    {},
  );

  const [activeTab, setActiveTab] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ variant: '', title: '', message: '' });

  // Local editable form slices hydrated when snapshots change
  const [profileForm, setProfileForm] = useState({
    displayName: '',
    legalName: '',
    phone: '',
    email: '',
    address: '',
    timezone: 'Asia/Jakarta',
    currency: 'IDR',
    status: BUSINESS_STATUS.ACTIVE,
  });

  const [scheduleForm, setScheduleForm] = useState({
    openTime: '10:00',
    closeTime: '22:00',
    slotGranularityMinutes: 15,
    bufferMinutes: 0,
  });

  const [pricingForm, setPricingForm] = useState({
    taxPercent: 0,
    allowOperatorDiscount: false,
    roundingUnitMinor: 1,
  });

  const [commissionForm, setCommissionForm] = useState({
    defaultMethod: COMMISSION_METHOD.PERCENTAGE,
    defaultRatePercent: 10,
    defaultFixedAmountMinor: 0,
    basis: COMMISSION_BASIS.SETTLED_AMOUNT,
  });

  const [bookingPolicyForm, setBookingPolicyForm] = useState({
    defaultInitialStatus: BOOKING_INITIAL_STATUS_POLICY.CONFIRMED,
    requireCustomerPhone: true,
    allowSameDayReschedule: true,
    cancellationNoticeMinutes: 120,
  });

  useEffect(() => {
    setProfileForm({
      displayName: profileDoc?.displayName || business?.name || '',
      legalName: profileDoc?.legalName || '',
      phone: profileDoc?.phone || '',
      email: profileDoc?.email || '',
      address: profileDoc?.address || '',
      timezone: profileDoc?.timezone || business?.timezone || 'Asia/Jakarta',
      currency: profileDoc?.currency || business?.currency || 'IDR',
      status: profileDoc?.status || business?.status || BUSINESS_STATUS.ACTIVE,
    });
  }, [profileDoc, business]);

  useEffect(() => {
    const sch = settingsMap[SETTING_IDS.SCHEDULE];
    if (sch) {
      setScheduleForm({
        openTime: sch.operatingHours?.openTime || '10:00',
        closeTime: sch.operatingHours?.closeTime || '22:00',
        slotGranularityMinutes: sch.slotGranularityMinutes || 15,
        bufferMinutes: sch.bufferMinutes ?? 0,
      });
    }
    const prc = settingsMap[SETTING_IDS.PRICING];
    if (prc) {
      setPricingForm({
        taxPercent: prc.taxPercent ?? 0,
        allowOperatorDiscount: Boolean(prc.allowOperatorDiscount),
        roundingUnitMinor: prc.roundingUnitMinor ?? 1,
      });
    }
    const com = settingsMap[SETTING_IDS.COMMISSION];
    if (com) {
      setCommissionForm({
        defaultMethod: com.defaultMethod || COMMISSION_METHOD.PERCENTAGE,
        defaultRatePercent: com.defaultRatePercent ?? 10,
        defaultFixedAmountMinor: com.defaultFixedAmountMinor ?? 0,
        basis: com.basis || COMMISSION_BASIS.SETTLED_AMOUNT,
      });
    }
    const bp = settingsMap[SETTING_IDS.BOOKING_POLICY];
    if (bp) {
      setBookingPolicyForm({
        defaultInitialStatus: bp.defaultInitialStatus || BOOKING_INITIAL_STATUS_POLICY.CONFIRMED,
        requireCustomerPhone: Boolean(bp.requireCustomerPhone),
        allowSameDayReschedule: Boolean(bp.allowSameDayReschedule),
        cancellationNoticeMinutes: bp.cancellationNoticeMinutes ?? 120,
      });
    }
  }, [settingsMap]);

  const missingDefaultsCount =
    (profileDoc ? 0 : 1) +
    Object.values(SETTING_IDS).filter((id) => !settingsMap[id]).length;

  async function handleInitializeDefaults() {
    setSaving(true);
    setFeedback({ variant: '', title: '', message: '' });
    try {
      const res = await initializeDefaultMasterDataUseCase({
        member,
        business,
        existingProfile: profileDoc,
        existingSettingsMap: settingsMap,
        isOnline,
      });
      setFeedback({
        variant: 'success',
        title: 'Master Data Default Siap',
        message: `${res.initializedDocs} dokumen profil & pengaturan default berhasil dibuat di Firestore.`,
      });
    } catch (err) {
      setFeedback({ variant: 'danger', title: 'Inisialisasi Gagal', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setFeedback({ variant: '', title: '', message: '' });
    try {
      await saveBusinessProfileUseCase({
        member,
        existingProfile: profileDoc,
        isOnline,
        data: profileForm,
      });
      setFeedback({
        variant: 'success',
        title: 'Profil Bisnis Tersimpan',
        message: 'Perubahan nama bisnis, kontak, dan timezone berhasil disinkronkan.',
      });
    } catch (err) {
      setFeedback({ variant: 'danger', title: 'Gagal Menyimpan Profil', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSetting(event, settingId, payload) {
    event.preventDefault();
    setSaving(true);
    setFeedback({ variant: '', title: '', message: '' });
    try {
      await saveBusinessSettingUseCase({
        member,
        settingId,
        existingSetting: settingsMap[settingId] || null,
        isOnline,
        data: payload,
      });
      setFeedback({
        variant: 'success',
        title: 'Pengaturan Disimpan',
        message: `Dokumen settings/${settingId} berhasil diperbarui.`,
      });
    } catch (err) {
      setFeedback({ variant: 'danger', title: 'Gagal Menyimpan Pengaturan', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Business Settings & Policies</h1>
          <p className="page-subtitle">
            Konfigurasi master bisnis, jam operasional default (10:00–22:00 Asia/Jakarta), aturan pajak/diskon IDR, dan komisi operator.
          </p>
        </div>
        {missingDefaultsCount > 0 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleInitializeDefaults}
            disabled={saving || !isOnline}
          >
            <Sparkles size={16} aria-hidden="true" />
            <span>Inisialisasi {missingDefaultsCount} Default Doc</span>
          </button>
        )}
      </header>

      <StatusAlert variant={feedback.variant || 'success'} title={feedback.title} message={feedback.message} />

      <div className="tabs" role="tablist" aria-label="Kategori pengaturan bisnis">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`tab-btn ${active ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loadingProfile || loadingSettings ? (
        <section className="panel skeleton" style={{ height: '220px' }} />
      ) : (
        <section className="panel" style={{ display: 'grid', gap: '16px' }}>
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} style={{ display: 'grid', gap: '14px' }}>
              <div className="grid-2">
                <div className="field">
                  <label className="field-label" htmlFor="bp-name">
                    Nama Studio / Bisnis
                  </label>
                  <input
                    id="bp-name"
                    type="text"
                    className="field-input"
                    value={profileForm.displayName}
                    onChange={(e) => setProfileForm((p) => ({ ...p, displayName: e.target.value }))}
                    required
                    disabled={saving}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="bp-legal">
                    Nama Legal / Entitas (Opsional)
                  </label>
                  <input
                    id="bp-legal"
                    type="text"
                    className="field-input"
                    value={profileForm.legalName}
                    onChange={(e) => setProfileForm((p) => ({ ...p, legalName: e.target.value }))}
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid-3">
                <div className="field">
                  <label className="field-label" htmlFor="bp-phone">
                    Telepon / WhatsApp Studio
                  </label>
                  <input
                    id="bp-phone"
                    type="tel"
                    className="field-input mono"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))}
                    disabled={saving}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="bp-email">
                    Email Bisnis
                  </label>
                  <input
                    id="bp-email"
                    type="email"
                    className="field-input"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                    disabled={saving}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="bp-timezone">
                    Timezone (IANA)
                  </label>
                  <input
                    id="bp-timezone"
                    type="text"
                    className="field-input mono"
                    value={profileForm.timezone}
                    onChange={(e) => setProfileForm((p) => ({ ...p, timezone: e.target.value }))}
                    required
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="bp-address">
                  Alamat Studio
                </label>
                <textarea
                  id="bp-address"
                  className="field-input"
                  rows={2}
                  value={profileForm.address}
                  onChange={(e) => setProfileForm((p) => ({ ...p, address: e.target.value }))}
                  disabled={saving}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={saving || !isOnline}>
                  <Save size={16} aria-hidden="true" />
                  <span>{saving ? 'Menyimpan...' : 'Simpan Profil Bisnis'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === SETTING_IDS.SCHEDULE && (
            <form
              onSubmit={(e) =>
                handleSaveSetting(e, SETTING_IDS.SCHEDULE, {
                  operatingHours: {
                    openTime: scheduleForm.openTime,
                    closeTime: scheduleForm.closeTime,
                  },
                  slotGranularityMinutes: Number(scheduleForm.slotGranularityMinutes),
                  bufferMinutes: Number(scheduleForm.bufferMinutes),
                })
              }
              style={{ display: 'grid', gap: '14px' }}
            >
              <div className="grid-2">
                <div className="field">
                  <label className="field-label" htmlFor="sch-open">
                    Jam Buka Default
                  </label>
                  <input
                    id="sch-open"
                    type="time"
                    className="field-input"
                    value={scheduleForm.openTime}
                    onChange={(e) => setScheduleForm((p) => ({ ...p, openTime: e.target.value }))}
                    required
                    disabled={saving}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="sch-close">
                    Jam Tutup Default
                  </label>
                  <input
                    id="sch-close"
                    type="time"
                    className="field-input"
                    value={scheduleForm.closeTime}
                    onChange={(e) => setScheduleForm((p) => ({ ...p, closeTime: e.target.value }))}
                    required
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label className="field-label" htmlFor="sch-gran">
                    Granularitas Slot Default (Menit)
                  </label>
                  <select
                    id="sch-gran"
                    className="field-input"
                    value={scheduleForm.slotGranularityMinutes}
                    onChange={(e) =>
                      setScheduleForm((p) => ({ ...p, slotGranularityMinutes: Number(e.target.value) }))
                    }
                    disabled={saving}
                  >
                    {SLOT_GRANULARITY_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m} menit
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="sch-buffer">
                    Jeda Buffer Antar-Sesi (Menit, 0–120)
                  </label>
                  <input
                    id="sch-buffer"
                    type="number"
                    min={0}
                    max={120}
                    step={5}
                    className="field-input mono"
                    value={scheduleForm.bufferMinutes}
                    onChange={(e) =>
                      setScheduleForm((p) => ({ ...p, bufferMinutes: Number(e.target.value) }))
                    }
                    disabled={saving}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="badge mono">
                  Config v{settingsMap[SETTING_IDS.SCHEDULE]?.configVersion || 1}
                </span>
                <button type="submit" className="btn btn-primary" disabled={saving || !isOnline}>
                  <Save size={16} aria-hidden="true" />
                  <span>Simpan Jadwal & Slot</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === SETTING_IDS.PRICING && (
            <form
              onSubmit={(e) =>
                handleSaveSetting(e, SETTING_IDS.PRICING, {
                  currency: 'IDR',
                  taxPercent: Number(pricingForm.taxPercent),
                  allowOperatorDiscount: Boolean(pricingForm.allowOperatorDiscount),
                  roundingUnitMinor: Number(pricingForm.roundingUnitMinor),
                })
              }
              style={{ display: 'grid', gap: '14px' }}
            >
              <div className="grid-2">
                <div className="field">
                  <label className="field-label" htmlFor="prc-tax">
                    Pajak Default (%, Integer 0–100)
                  </label>
                  <input
                    id="prc-tax"
                    type="number"
                    min={0}
                    max={100}
                    className="field-input mono"
                    value={pricingForm.taxPercent}
                    onChange={(e) =>
                      setPricingForm((p) => ({ ...p, taxPercent: Number(e.target.value) }))
                    }
                    disabled={saving}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="prc-round">
                    Unit Pembulatan IDR (Integer)
                  </label>
                  <input
                    id="prc-round"
                    type="number"
                    min={1}
                    max={10000}
                    className="field-input mono"
                    value={pricingForm.roundingUnitMinor}
                    onChange={(e) =>
                      setPricingForm((p) => ({ ...p, roundingUnitMinor: Number(e.target.value) }))
                    }
                    disabled={saving}
                  />
                </div>
              </div>

              <label className="checkbox-card" style={{ width: 'fit-content' }}>
                <input
                  type="checkbox"
                  checked={pricingForm.allowOperatorDiscount}
                  onChange={(e) =>
                    setPricingForm((p) => ({ ...p, allowOperatorDiscount: e.target.checked }))
                  }
                  disabled={saving}
                />
                <span>Izinkan Operator memberi diskon (bila permission flag aktif)</span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="badge mono">
                  Config v{settingsMap[SETTING_IDS.PRICING]?.configVersion || 1}
                </span>
                <button type="submit" className="btn btn-primary" disabled={saving || !isOnline}>
                  <Save size={16} aria-hidden="true" />
                  <span>Simpan Kebijakan Harga</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === SETTING_IDS.COMMISSION && (
            <form
              onSubmit={(e) =>
                handleSaveSetting(e, SETTING_IDS.COMMISSION, {
                  defaultMethod: commissionForm.defaultMethod,
                  defaultRatePercent: Number(commissionForm.defaultRatePercent),
                  defaultFixedAmountMinor: Number(commissionForm.defaultFixedAmountMinor),
                  basis: commissionForm.basis,
                  applyOnStatus: 'settled',
                })
              }
              style={{ display: 'grid', gap: '14px' }}
            >
              <div className="grid-2">
                <div className="field">
                  <label className="field-label" htmlFor="com-method">
                    Metode Komisi Default
                  </label>
                  <select
                    id="com-method"
                    className="field-input"
                    value={commissionForm.defaultMethod}
                    onChange={(e) =>
                      setCommissionForm((p) => ({ ...p, defaultMethod: e.target.value }))
                    }
                    disabled={saving}
                  >
                    <option value={COMMISSION_METHOD.PERCENTAGE}>Persentase (%)</option>
                    <option value={COMMISSION_METHOD.FIXED_PER_BOOKING}>Nominal Tetap per Booking (IDR)</option>
                    <option value={COMMISSION_METHOD.NONE}>Tidak Ada Komisi (0)</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="com-basis">
                    Basis Perhitungan Komisi
                  </label>
                  <select
                    id="com-basis"
                    className="field-input"
                    value={commissionForm.basis}
                    onChange={(e) => setCommissionForm((p) => ({ ...p, basis: e.target.value }))}
                    disabled={saving}
                  >
                    <option value={COMMISSION_BASIS.SETTLED_AMOUNT}>Net Settled Amount (setelah diskon)</option>
                    <option value={COMMISSION_BASIS.SUBTOTAL}>Subtotal Kotor Layanan</option>
                  </select>
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label className="field-label" htmlFor="com-pct">
                    Persentase Default (0–100%)
                  </label>
                  <input
                    id="com-pct"
                    type="number"
                    min={0}
                    max={100}
                    className="field-input mono"
                    value={commissionForm.defaultRatePercent}
                    onChange={(e) =>
                      setCommissionForm((p) => ({ ...p, defaultRatePercent: Number(e.target.value) }))
                    }
                    disabled={saving || commissionForm.defaultMethod !== COMMISSION_METHOD.PERCENTAGE}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="com-fixed">
                    Nominal Tetap Default (IDR Integer)
                  </label>
                  <input
                    id="com-fixed"
                    type="number"
                    min={0}
                    step={5000}
                    className="field-input mono"
                    value={commissionForm.defaultFixedAmountMinor}
                    onChange={(e) =>
                      setCommissionForm((p) => ({
                        ...p,
                        defaultFixedAmountMinor: Number(e.target.value),
                      }))
                    }
                    disabled={saving || commissionForm.defaultMethod !== COMMISSION_METHOD.FIXED_PER_BOOKING}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="badge mono">
                  Config v{settingsMap[SETTING_IDS.COMMISSION]?.configVersion || 1}
                </span>
                <button type="submit" className="btn btn-primary" disabled={saving || !isOnline}>
                  <Save size={16} aria-hidden="true" />
                  <span>Simpan Kebijakan Komisi</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === SETTING_IDS.BOOKING_POLICY && (
            <form
              onSubmit={(e) =>
                handleSaveSetting(e, SETTING_IDS.BOOKING_POLICY, {
                  defaultInitialStatus: bookingPolicyForm.defaultInitialStatus,
                  requireCustomerPhone: Boolean(bookingPolicyForm.requireCustomerPhone),
                  allowSameDayReschedule: Boolean(bookingPolicyForm.allowSameDayReschedule),
                  cancellationNoticeMinutes: Number(bookingPolicyForm.cancellationNoticeMinutes),
                })
              }
              style={{ display: 'grid', gap: '14px' }}
            >
              <div className="grid-2">
                <div className="field">
                  <label className="field-label" htmlFor="bk-init-status">
                    Status Awal Booking (Staff Terotorisasi)
                  </label>
                  <select
                    id="bk-init-status"
                    className="field-input"
                    value={bookingPolicyForm.defaultInitialStatus}
                    onChange={(e) =>
                      setBookingPolicyForm((p) => ({ ...p, defaultInitialStatus: e.target.value }))
                    }
                    disabled={saving}
                  >
                    <option value={BOOKING_INITIAL_STATUS_POLICY.CONFIRMED}>
                      CONFIRMED (Langsung Kunci Slot)
                    </option>
                    <option value={BOOKING_INITIAL_STATUS_POLICY.PENDING_CONFIRMATION}>
                      PENDING_CONFIRMATION (Menunggu Konfirmasi)
                    </option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="bk-cancel-notice">
                    Batas Pemberitahuan Cancel (Menit Sebelum Sesi)
                  </label>
                  <input
                    id="bk-cancel-notice"
                    type="number"
                    min={0}
                    max={10080}
                    className="field-input mono"
                    value={bookingPolicyForm.cancellationNoticeMinutes}
                    onChange={(e) =>
                      setBookingPolicyForm((p) => ({
                        ...p,
                        cancellationNoticeMinutes: Number(e.target.value),
                      }))
                    }
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="checkbox-grid">
                <label className="checkbox-card">
                  <input
                    type="checkbox"
                    checked={bookingPolicyForm.requireCustomerPhone}
                    onChange={(e) =>
                      setBookingPolicyForm((p) => ({ ...p, requireCustomerPhone: e.target.checked }))
                    }
                    disabled={saving}
                  />
                  <span>Wajib nomor WhatsApp/telepon customer</span>
                </label>
                <label className="checkbox-card">
                  <input
                    type="checkbox"
                    checked={bookingPolicyForm.allowSameDayReschedule}
                    onChange={(e) =>
                      setBookingPolicyForm((p) => ({ ...p, allowSameDayReschedule: e.target.checked }))
                    }
                    disabled={saving}
                  />
                  <span>Izinkan reschedule di hari yang sama</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="badge mono">
                  Config v{settingsMap[SETTING_IDS.BOOKING_POLICY]?.configVersion || 1}
                </span>
                <button type="submit" className="btn btn-primary" disabled={saving || !isOnline}>
                  <Save size={16} aria-hidden="true" />
                  <span>Simpan Policy Booking</span>
                </button>
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
