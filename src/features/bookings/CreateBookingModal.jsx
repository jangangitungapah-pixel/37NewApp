import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CalendarPlus, Lock, UserPlus, WifiOff } from 'lucide-react';
import {
  listCustomersPageUseCase,
  saveCustomerUseCase,
} from '../../application/use-cases/masterDataUseCases.js';
import { createBookingUseCase } from '../../application/use-cases/bookingUseCases.js';
import { subscribeActiveSlotsForStudioDay } from '../../data/repositories/bookingRepository.js';
import {
  CUSTOMER_STATUS,
  ROLES,
  SETTING_IDS,
  STUDIO_STATUS,
} from '../../domain/enums/roles.js';
import {
  canApplyBookingDiscount,
  canManageCustomers,
} from '../../domain/policies/accessPolicy.js';
import { calculateOperatorCommission } from '../../domain/calculations/commissionCalculator.js';
import { calculateServicePrice } from '../../domain/calculations/pricingCalculator.js';
import {
  buildStartTimeOptions,
  computeBookingSlotPlan,
  getTodayDateKey,
} from '../../domain/calculations/slotGenerator.js';
import { DialogModal } from '../../components/ui/DialogModal.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { Textarea } from '../../components/ui/Textarea.jsx';
import { FormField } from '../../components/forms/FormField.jsx';
import { createZodFormConfig, extractFieldErrorMessage } from '../../lib/validation/formHelpers.js';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { useRegistrySubscription } from '../../shared/hooks/useRegistrySubscription.js';
import { formatIdr, formatOperatingHours } from '../../shared/utils/formatters.js';

const bookingCreateSchema = z.object({
  dateKey: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/, 'Tanggal booking wajib valid.'),
  startTime: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/, 'Jam mulai wajib valid.'),
  durationMinutes: z.coerce.number().int().min(15, 'Durasi minimal 15 menit.').max(720, 'Durasi maksimal 12 jam.'),
  customerId: z.string().min(1, 'Customer wajib dipilih.'),
  discountMinor: z.coerce.number().int().min(0, 'Diskon tidak boleh negatif.'),
  notes: z.string().max(500, 'Catatan maksimal 500 karakter.'),
});

export function CreateBookingModal({
  onClose,
  member,
  business,
  isOnline,
  studios,
  services,
  settingsMap,
  prefillStudioId = '',
  prefillDateKey = '',
  prefillStartTime = '',
  onCreated,
}) {
  const activeStudios = useMemo(
    () => studios.filter((s) => s.status === STUDIO_STATUS.ACTIVE),
    [studios],
  );
  const activeServices = useMemo(() => services.filter((svc) => svc.active === true), [services]);

  const scheduleSetting = settingsMap?.[SETTING_IDS.SCHEDULE] || null;
  const pricingSetting = settingsMap?.[SETTING_IDS.PRICING] || null;
  const commissionSetting = settingsMap?.[SETTING_IDS.COMMISSION] || null;
  const bookingPolicySetting = settingsMap?.[SETTING_IDS.BOOKING_POLICY] || null;

  const initialStudioId = useMemo(() => {
    if (prefillStudioId && activeStudios.some((s) => s.studioId === prefillStudioId)) {
      return prefillStudioId;
    }
    return activeStudios[0]?.studioId || '';
  }, [activeStudios, prefillStudioId]);

  const [studioId, setStudioId] = useState(initialStudioId);
  const selectedStudio = useMemo(
    () => activeStudios.find((s) => s.studioId === studioId) || activeStudios[0] || null,
    [activeStudios, studioId],
  );

  const tz = selectedStudio?.timezone || business?.timezone || 'Asia/Jakarta';
  const eligibleServices = useMemo(
    () =>
      activeServices.filter(
        (svc) =>
          !Array.isArray(svc.applicableStudioIds) ||
          svc.applicableStudioIds.length === 0 ||
          svc.applicableStudioIds.includes(selectedStudio?.studioId),
      ),
    [activeServices, selectedStudio],
  );

  const [serviceId, setServiceId] = useState(() => eligibleServices[0]?.serviceId || '');
  const selectedService = useMemo(
    () =>
      eligibleServices.find((s) => s.serviceId === serviceId) || eligibleServices[0] || null,
    [eligibleServices, serviceId],
  );

  const durationOptions = useMemo(
    () => selectedService?.durationOptions || [60],
    [selectedService],
  );
  const startOptions = useMemo(() => {
    if (!selectedStudio) return [];
    return buildStartTimeOptions({
      operatingHours: selectedStudio.operatingHours || scheduleSetting?.operatingHours,
      slotGranularityMinutes:
        selectedStudio.slotGranularityMinutes || scheduleSetting?.slotGranularityMinutes || 15,
    });
  }, [scheduleSetting, selectedStudio]);

  const {
    register,
    handleSubmit: handleFormSubmit,
    setValue,
    setError,
    clearErrors,
    watch,
    formState: { errors: formErrors },
  } = useForm(createZodFormConfig(bookingCreateSchema, {
    dateKey: prefillDateKey || getTodayDateKey(tz),
    startTime: prefillStartTime || startOptions[0]?.timeHHmm || '10:00',
    durationMinutes: durationOptions[0] || 60,
    customerId: '',
    discountMinor: '0',
    notes: '',
  }));

  const dateKey = watch('dateKey');
  const startTime = watch('startTime');
  const durationMinutes = watch('durationMinutes');
  const customerId = watch('customerId');
  const discountInput = watch('discountMinor');
  const notes = watch('notes');

  const effectiveDuration = durationOptions.includes(Number(durationMinutes))
    ? Number(durationMinutes)
    : durationOptions[0] || 60;
  const effectiveStartTime = startOptions.some((option) => option.timeHHmm === startTime)
    ? startTime
    : startOptions[0]?.timeHHmm || '10:00';

  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const [quickCustName, setQuickCustName] = useState('');
  const [quickCustPhone, setQuickCustPhone] = useState('');
  const [quickCustAct, setQuickCustAct] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const discountAllowed = canApplyBookingDiscount(member, pricingSetting);
  const customerWriteAllowed = canManageCustomers(member);

  // Load initial active customer list cleanly via async effect
  useEffect(() => {
    let active = true;
    async function loadCustomers() {
      if (!member?.businessId || !customerWriteAllowed) {
        if (active) setCustomersLoading(false);
        return;
      }
      try {
        const res = await listCustomersPageUseCase({
          member,
          status: CUSTOMER_STATUS.ACTIVE,
          pageSize: 50,
        });
        if (!active) return;
        setCustomers(res.items);
        if (res.items.length > 0) {
          setValue('customerId', res.items[0].customerId, { shouldValidate: true });
        }
      } catch (err) {
        if (active) setErrorMessage(err.message || 'Gagal memuat daftar customer.');
      } finally {
        if (active) setCustomersLoading(false);
      }
    }
    loadCustomers();
    return () => {
      active = false;
    };
  }, [member, customerWriteAllowed]);

  const subscribeDaySlots = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId || !selectedStudio?.studioId || !dateKey) {
        return () => {};
      }
      return subscribeActiveSlotsForStudioDay({
        businessId: member.businessId,
        studioId: selectedStudio.studioId,
        dateKey,
        onData,
        onError,
      });
    },
    [member?.businessId, selectedStudio?.studioId, dateKey],
  );

  const { data: activeDaySlots } = useRegistrySubscription(
    'phase03:create:day-slots',
    member?.businessId && selectedStudio?.studioId ? subscribeDaySlots : null,
    [],
  );

  const occupiedSlotIdSet = useMemo(
    () => new Set(activeDaySlots.map((slot) => slot.slotId)),
    [activeDaySlots],
  );

  const occupiedBucketSet = useMemo(
    () => new Set(activeDaySlots.map((slot) => slot.bucketIndex)),
    [activeDaySlots],
  );

  const previewQuote = useMemo(() => {
    if (!selectedStudio || !selectedService) {
      return { valid: false, error: 'Pilih studio dan layanan aktif terlebih dahulu.' };
    }
    try {
      const slotPlan = computeBookingSlotPlan({
        studioId: selectedStudio.studioId,
        dateKey,
        startTime: effectiveStartTime,
        durationMinutes: effectiveDuration,
        bufferMinutes: scheduleSetting?.bufferMinutes ?? 0,
        timezone: tz,
        operatingHours: selectedStudio.operatingHours,
        slotGranularityMinutes:
          selectedStudio.slotGranularityMinutes || scheduleSetting?.slotGranularityMinutes || 15,
      });

      const discountMinor = discountAllowed ? Math.max(0, Math.trunc(Number(values.discountMinor || 0))) : 0;
      const priceSnapshot = calculateServicePrice({
        service: selectedService,
        durationMinutes: effectiveDuration,
        discountMinor,
        taxPercent: pricingSetting?.taxPercent ?? 0,
      });
      const commissionSnapshot = calculateOperatorCommission({
        service: selectedService,
        commissionSetting,
        grossAmountMinor: priceSnapshot.baseSubtotalMinor,
        netAmountMinor: priceSnapshot.totalMinor,
      });

      const conflicts = slotPlan.allSlots.filter((s) => occupiedSlotIdSet.has(s.slotId));
      return {
        valid: true,
        slotPlan,
        priceSnapshot,
        commissionSnapshot,
        conflicts,
      };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }, [
    selectedStudio,
    selectedService,
    dateKey,
    effectiveStartTime,
    effectiveDuration,
    scheduleSetting,
    tz,
    discountAllowed,
    discountInput,
    pricingSetting,
    commissionSetting,
    occupiedSlotIdSet,
  ]);

  async function handleQuickCustomerSave() {
    setErrorMessage('');
    if (!quickCustName.trim() || !quickCustPhone.trim()) {
      setErrorMessage('Nama dan nomor telepon customer baru wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await saveCustomerUseCase({
        member,
        isOnline,
        data: {
          name: quickCustName.trim(),
          phone: quickCustPhone.trim(),
          bandOrActName: quickCustAct.trim() || null,
          status: CUSTOMER_STATUS.ACTIVE,
        },
      });
      setCustomers((prev) => [created, ...prev]);
      setValue('customerId', created.customerId, { shouldValidate: true, shouldDirty: true });
      setShowQuickCustomer(false);
      setQuickCustName('');
      setQuickCustPhone('');
      setQuickCustAct('');
    } catch (err) {
      setErrorMessage(err.message || 'Gagal menambah customer.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(values) {
    setErrorMessage('');
    clearErrors();

    const selectedCustomer = customers.find((c) => c.customerId === values.customerId);
    if (!selectedCustomer) {
      setError('customerId', { type: 'validate', message: 'Customer yang dipilih tidak tersedia atau sudah tidak aktif.' });
      setErrorMessage('Customer yang dipilih tidak tersedia. Pilih ulang customer aktif.');
      return;
    }
    if (!selectedStudio || !selectedService) {
      setErrorMessage('Studio dan layanan aktif wajib dipilih.');
      return;
    }

    setSubmitting(true);
    try {
      const discountMinor = discountAllowed ? Math.max(0, Math.trunc(Number(values.discountMinor || 0))) : 0;
      const created = await createBookingUseCase({
        member,
        studio: selectedStudio,
        service: selectedService,
        customer: selectedCustomer,
        operatorUid: member.uid,
        dateKey,
        startTime: effectiveStartTime,
        durationMinutes: effectiveDuration,
        discountMinor,
        notes: values.notes.trim() || null,
        scheduleSetting,
        pricingSetting,
        commissionSetting,
        bookingPolicySetting,
        businessOwnerUid: business?.ownerUid || null,
        isOnline,
      });
      onCreated?.(created);
      onClose();
    } catch (err) {
      setErrorMessage(err.message || 'Gagal mengonfirmasi booking.');
    } finally {
      setSubmitting(false);
    }
  }

  const submitBooking = handleFormSubmit(handleSubmit);

  return (
    <DialogModal
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !submitting) onClose();
      }}
      size="xl"
      title="Buat Booking Studio Baru"
      description={`Reservasi slot 15 menit (${tz}) dengan price dan commission snapshot.`}
      className="max-h-[min(92vh,900px)] overflow-y-auto"
    >
      <form onSubmit={submitBooking} className="grid gap-4">
        {!isOnline && (
          <StatusAlert
            variant="danger"
            title="Offline — Konfirmasi Booking Ditahan"
            message="Booking baru membutuhkan koneksi aktif agar transaction anti-double-booking dapat divalidasi oleh Firestore."
          />
        )}

        {errorMessage && (
          <StatusAlert variant="danger" title="Booking Tidak Dapat Diproses" message={errorMessage} />
        )}

        {activeStudios.length === 0 ? (
          <StatusAlert
            variant="warning"
            title="Tidak Ada Studio Aktif"
            message={
              member?.role === ROLES.OWNER
                ? 'Aktifkan minimal satu studio di menu Studios & Rooms sebelum membuat booking.'
                : 'Akun Anda belum ditugaskan ke studio aktif mana pun.'
            }
          />
        ) : (
          <>
            <div className="grid-2">
              <div className="field">
                <label className="field-label" htmlFor="bk-studio">
                  Studio / Room
                </label>
                <select
                  id="bk-studio"
                  className="field-input"
                  value={selectedStudio?.studioId || ''}
                  onChange={(e) => setStudioId(e.target.value)}
                >
                  {activeStudios.map((studio) => (
                    <option key={studio.studioId} value={studio.studioId}>
                      {studio.name} ({formatOperatingHours(studio.operatingHours)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="bk-date">
                  Tanggal Sesi ({tz})
                </label>
                <input
                  id="bk-date"
                  type="date"
                  className="field-input"
                  value={dateKey}
                  onChange={(e) => setValue('dateKey', e.target.value, { shouldValidate: true, shouldDirty: true })}
                  required
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label className="field-label" htmlFor="bk-service">
                  Layanan Studio
                </label>
                <select
                  id="bk-service"
                  className="field-input"
                  value={selectedService?.serviceId || ''}
                  onChange={(e) => setServiceId(e.target.value)}
                >
                  {eligibleServices.map((svc) => (
                    <option key={svc.serviceId} value={svc.serviceId}>
                      {svc.name} · {formatIdr(svc.basePriceMinor)} (v{svc.configVersion})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="bk-duration">
                  Durasi
                </label>
                <select
                  id="bk-duration"
                  className="field-input"
                  value={effectiveDuration}
                  onChange={(e) => setValue('durationMinutes', Number(e.target.value), { shouldValidate: true, shouldDirty: true })}
                >
                  {durationOptions.map((dur) => (
                    <option key={dur} value={dur}>
                      {dur} menit
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="bk-start-time">
                Jam Mulai (slot bertanda [Terisi] sedang terkunci)
              </label>
              <select
                id="bk-start-time"
                className="field-input"
                value={effectiveStartTime}
                onChange={(e) => setValue('startTime', e.target.value, { shouldValidate: true, shouldDirty: true })}
              >
                {startOptions.map((opt) => {
                  const startLocked = occupiedBucketSet.has(opt.bucketIndex);
                  return (
                    <option key={opt.timeHHmm} value={opt.timeHHmm}>
                      {opt.timeHHmm} WIB {startLocked ? '— [Terisi]' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="field-label" htmlFor="bk-customer">
                  Customer / Band
                </label>
                {customerWriteAllowed && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setShowQuickCustomer((prev) => !prev)}
                  >
                    <UserPlus size={13} aria-hidden="true" />
                    <span>{showQuickCustomer ? 'Batal Tambah' : 'Customer Baru Cepat'}</span>
                  </button>
                )}
              </div>

              {showQuickCustomer ? (
                <div
                  className="panel"
                  style={{ padding: '12px', display: 'grid', gap: '10px', background: 'var(--bg-input)' }}
                >
                  <div className="grid-2">
                    <input
                      className="field-input"
                      placeholder="Nama lengkap customer"
                      value={quickCustName}
                      onChange={(e) => setQuickCustName(e.target.value)}
                    />
                    <input
                      className="field-input"
                      placeholder="No. Telepon / WhatsApp"
                      value={quickCustPhone}
                      onChange={(e) => setQuickCustPhone(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      className="field-input"
                      placeholder="Nama Band / Act (opsional)"
                      value={quickCustAct}
                      onChange={(e) => setQuickCustAct(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleQuickCustomerSave}
                      disabled={submitting || !isOnline}
                    >
                      Simpan Customer
                    </button>
                  </div>
                </div>
              ) : (
                <select
                  id="bk-customer"
                  className="field-input"
                  value={customerId}
                  onChange={(e) => setValue('customerId', e.target.value, { shouldValidate: true, shouldDirty: true })}
                  disabled={customersLoading}
                >
                  {customersLoading ? (
                    <option value="">Memuat customer...</option>
                  ) : customers.length === 0 ? (
                    <option value="">Belum ada customer aktif</option>
                  ) : (
                    customers.map((c) => (
                      <option key={c.customerId} value={c.customerId}>
                        {c.name}
                        {c.bandOrActName ? ` (${c.bandOrActName})` : ''} · {c.phone}
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>

            <div className="grid-2">
              <div className="field">
                <label className="field-label" htmlFor="bk-discount">
                  Diskon (IDR) {discountAllowed ? '' : '— Terkunci Policy'}
                </label>
                <input
                  id="bk-discount"
                  type="number"
                  min={0}
                  step={1000}
                  className="field-input"
                  value={discountAllowed ? discountInput : '0'}
                  onChange={(e) => setValue('discountMinor', e.target.value, { shouldValidate: true, shouldDirty: true })}
                  disabled={!discountAllowed}
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="bk-notes">
                  Catatan Sesi (opsional)
                </label>
                <input
                  id="bk-notes"
                  className="field-input"
                  placeholder="Kebutuhan mic, ampli, shift, dll."
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setValue('notes', e.target.value, { shouldValidate: true, shouldDirty: true })}
                />
              </div>
            </div>

            <div
              className="panel"
              style={{
                padding: '14px',
                display: 'grid',
                gap: '6px',
                background: 'var(--bg-input)',
              }}
            >
              {previewQuote.valid ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '14px' }}>
                      Ringkasan Slot & Tarif ({previewQuote.slotPlan.startTime}–
                      {previewQuote.slotPlan.endTime} WIB)
                    </strong>
                    <span className="badge badge-info">
                      <Lock size={12} aria-hidden="true" />
                      <span>{previewQuote.slotPlan.slotIds.length} slot bucket</span>
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'grid', gap: '4px' }}>
                    <div>
                      Subtotal: {formatIdr(previewQuote.priceSnapshot.baseSubtotalMinor)} · Diskon:{' '}
                      {formatIdr(previewQuote.priceSnapshot.discountMinor)} · Pajak (
                      {previewQuote.priceSnapshot.taxPercent}%):{' '}
                      {formatIdr(previewQuote.priceSnapshot.taxMinor)}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--accent-brass)', fontSize: '15px' }}>
                        Total Snapshot: {formatIdr(previewQuote.priceSnapshot.totalMinor)}
                      </strong>{' '}
                      · Estimasi Komisi ({previewQuote.commissionSnapshot.method}):{' '}
                      {formatIdr(previewQuote.commissionSnapshot.amountMinor)}
                    </div>
                  </div>
                  {previewQuote.conflicts.length > 0 && (
                    <StatusAlert
                      variant="warning"
                      title="Slot Terdeteksi Bentrok"
                      message={`Bucket sudah terkunci pada: ${previewQuote.conflicts
                        .map((c) => c.slotTime)
                        .join(', ')}. Transaction akan menolak jika tetap dikonfirmasi.`}
                    />
                  )}
                </>
              ) : (
                <span className="field-error">{previewQuote.error}</span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button type="button" className="btn" onClick={onClose} disabled={submitting}>
                Tutup
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || !isOnline || !previewQuote.valid || !customerId}
              >
                {!isOnline ? (
                  <>
                    <WifiOff size={15} aria-hidden="true" />
                    <span>Offline</span>
                  </>
                ) : (
                  <>
                    <CalendarPlus size={15} aria-hidden="true" />
                    <span>
                      {submitting
                        ? 'Mengunci Slot & Menyimpan...'
                        : bookingPolicySetting?.defaultInitialStatus === 'PENDING_CONFIRMATION'
                          ? 'Ajukan Booking'
                          : 'Konfirmasi Booking'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </form>
    </DialogModal>
  );
}
