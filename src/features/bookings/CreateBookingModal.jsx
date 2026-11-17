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
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal booking wajib valid.'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Jam mulai wajib valid.'),
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

  useEffect(() => {
    if (durationOptions.length > 0 && !durationOptions.includes(Number(durationMinutes))) {
      setValue('durationMinutes', durationOptions[0], { shouldValidate: true });
    }
  }, [durationOptions, durationMinutes, setValue]);

  useEffect(() => {
    if (startOptions.length > 0 && !startOptions.some((option) => option.timeHHmm === startTime)) {
      setValue('startTime', startOptions[0].timeHHmm, { shouldValidate: true });
    }
  }, [startOptions, startTime, setValue]);

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
        dateKey: values.dateKey,
        startTime: values.startTime,
        durationMinutes: Number(values.durationMinutes),
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
        dateKey: values.dateKey,
        startTime: values.startTime,
        durationMinutes: Number(values.durationMinutes),
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
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Studio / Room" required>
                <SelectField
                  value={selectedStudio?.studioId || ''}
                  onValueChange={setStudioId}
                  options={activeStudios.map((studio) => ({
                    value: studio.studioId,
                    label: `${studio.name} · ${formatOperatingHours(studio.operatingHours)}`,
                  }))}
                  placeholder="Pilih studio"
                />
              </FormField>

              <FormField
                label={`Tanggal Sesi (${tz})`}
                required
                error={extractFieldErrorMessage(formErrors, 'dateKey')}
              >
                <Input type="date" {...register('dateKey')} />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Layanan Studio" required>
                <SelectField
                  value={selectedService?.serviceId || ''}
                  onValueChange={setServiceId}
                  options={eligibleServices.map((service) => ({
                    value: service.serviceId,
                    label: `${service.name} · ${formatIdr(service.basePriceMinor)} (v${service.configVersion})`,
                  }))}
                  placeholder="Pilih layanan"
                />
              </FormField>

              <FormField
                label="Durasi"
                required
                error={extractFieldErrorMessage(formErrors, 'durationMinutes')}
              >
                <SelectField
                  value={effectiveDuration}
                  onValueChange={(value) => setValue('durationMinutes', value, { shouldValidate: true, shouldDirty: true })}
                  options={durationOptions.map((duration) => ({
                    value: duration,
                    label: `${duration} menit`,
                  }))}
                  placeholder="Pilih durasi"
                />
              </FormField>
            </div>

            <FormField
              label="Jam Mulai"
              required
              hint="Waktu mengikuti timezone studio. Slot bertanda [Terisi] sudah memiliki lock aktif."
              error={extractFieldErrorMessage(formErrors, 'startTime')}
            >
              <SelectField
                value={effectiveStartTime}
                onValueChange={(value) => setValue('startTime', value, { shouldValidate: true, shouldDirty: true })}
                options={startOptions.map((option) => {
                  const startLocked = occupiedBucketSet.has(option.bucketIndex);
                  return {
                    value: option.timeHHmm,
                    label: `${option.timeHHmm} · ${startLocked ? '[Terisi]' : 'Tersedia'}`,
                    disabled: startLocked,
                  };
                })}
                placeholder="Pilih jam mulai"
              />
            </FormField>

            <section className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">Customer / Band</span>
                {customerWriteAllowed && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowQuickCustomer((previous) => !previous)}
                  >
                    <UserPlus size={14} aria-hidden="true" />
                    {showQuickCustomer ? 'Tutup Form Customer' : 'Customer Baru Cepat'}
                  </Button>
                )}
              </div>

              {showQuickCustomer ? (
                <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Nama Customer" required>
                      <Input
                        value={quickCustName}
                        onChange={(event) => setQuickCustName(event.target.value)}
                        placeholder="Nama lengkap customer"
                        autoComplete="name"
                      />
                    </FormField>
                    <FormField label="Nomor Telepon / WhatsApp" required>
                      <Input
                        value={quickCustPhone}
                        onChange={(event) => setQuickCustPhone(event.target.value)}
                        placeholder="08xxxxxxxxxx"
                        inputMode="tel"
                        autoComplete="tel"
                      />
                    </FormField>
                  </div>
                  <FormField label="Nama Band / Act (opsional)">
                    <Input
                      value={quickCustAct}
                      onChange={(event) => setQuickCustAct(event.target.value)}
                      placeholder="Nama band atau act"
                    />
                  </FormField>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      loading={submitting}
                      disabled={!isOnline || !quickCustName.trim() || !quickCustPhone.trim()}
                      onClick={handleQuickCustomerSave}
                    >
                      Simpan Customer
                    </Button>
                  </div>
                </div>
              ) : (
                <FormField
                  label="Pilih Customer Aktif"
                  required
                  error={extractFieldErrorMessage(formErrors, 'customerId')}
                >
                  <SelectField
                    value={customerId}
                    onValueChange={(value) => setValue('customerId', value, { shouldValidate: true, shouldDirty: true })}
                    disabled={customersLoading || customers.length === 0}
                    options={customers.map((customer) => ({
                      value: customer.customerId,
                      label: `${customer.name}${customer.bandOrActName ? ` (${customer.bandOrActName})` : ''} · ${customer.phone}`,
                    }))}
                    placeholder={customersLoading ? 'Memuat customer...' : 'Pilih customer'}
                  />
                </FormField>
              )}
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={`Diskon (IDR)${discountAllowed ? '' : ' — Terkunci Policy'}`}
                error={extractFieldErrorMessage(formErrors, 'discountMinor')}
                hint="Gunakan nilai rupiah bulat. Diskon tetap divalidasi ulang oleh domain policy."
              >
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  disabled={!discountAllowed}
                  {...register('discountMinor')}
                  onChange={(event) => {
                    if (!discountAllowed) return;
                    setValue('discountMinor', event.target.value, { shouldValidate: true, shouldDirty: true });
                  }}
                />
              </FormField>

              <FormField
                label="Catatan Sesi (opsional)"
                error={extractFieldErrorMessage(formErrors, 'notes')}
              >
                <Textarea
                  rows={2}
                  maxLength={500}
                  placeholder="Kebutuhan mic, ampli, shift, dan lainnya"
                  {...register('notes')}
                />
              </FormField>
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
                      {previewQuote.slotPlan.endTime} ({tz}))
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

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={onClose}
              >
                Tutup
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                disabled={!isOnline || !previewQuote.valid || !customerId || !selectedStudio || !selectedService}
              >
                {!isOnline ? (
                  <>
                    <WifiOff size={15} aria-hidden="true" />
                    Offline
                  </>
                ) : (
                  <>
                    <CalendarPlus size={15} aria-hidden="true" />
                    {bookingPolicySetting?.defaultInitialStatus === 'PENDING_CONFIRMATION'
                      ? 'Ajukan Booking'
                      : 'Konfirmasi Booking'}
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </form>
    </DialogModal>
  );
}
