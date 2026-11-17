import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  History,
  LogIn,
  Play,
  SquareCheck,
  UserX,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { RESCHEDULABLE_BOOKING_STATUSES } from '../../domain/validators/bookingValidator.js';
import {
  buildStartTimeOptions,
  computeBookingSlotPlan,
  formatDateKeyLabel,
} from '../../domain/calculations/slotGenerator.js';
import {
  BOOKING_STATUS,
  ROLES,
  SESSION_ACTION,
  SESSION_STATUS,
  SETTING_IDS,
} from '../../domain/enums/roles.js';
import { resolveSessionStatus } from '../../domain/validators/bookingSessionValidator.js';
import { canOperateStudioBooking } from '../../domain/policies/accessPolicy.js';
import {
  rescheduleBookingUseCase,
  transitionBookingStatusUseCase,
} from '../../application/use-cases/bookingUseCases.js';
import { performBookingSessionActionUseCase } from '../../application/use-cases/bookingSessionUseCases.js';
import {
  subscribeActiveSlotsForStudioDay,
  subscribeBookingActivityLogs,
} from '../../data/repositories/bookingRepository.js';
import { subscribeBookingSessionEvents } from '../../data/repositories/bookingSessionRepository.js';
import { DialogModal } from '../../components/ui/DialogModal.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { FormField } from '../../components/forms/FormField.jsx';
import { Textarea } from '../../components/ui/Textarea.jsx';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { useRegistrySubscription } from '../../shared/hooks/useRegistrySubscription.js';
import { formatIdr } from '../../shared/utils/formatters.js';
import { getBookingStatusMeta } from './bookingStatusUi.js';

function formatLogTimestamp(dateVal, timeZone = 'Asia/Jakarta') {
  if (!(dateVal instanceof Date) || Number.isNaN(dateVal.getTime())) {
    return 'Waktu tidak tersedia';
  }
  return new Intl.DateTimeFormat('id-ID', {
    timeZone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dateVal);
}

export function BookingDetailModal({
  booking,
  onClose,
  member,
  business = null,
  isOnline,
  studios,
  services,
  settingsMap,
  onMutated,
}) {
  const studio = useMemo(
    () => studios.find((s) => s.studioId === booking.studioId) || null,
    [studios, booking.studioId],
  );
  const service = useMemo(
    () => services.find((svc) => svc.serviceId === booking.serviceId) || null,
    [services, booking.serviceId],
  );

  const scheduleSetting = settingsMap?.[SETTING_IDS.SCHEDULE] || null;
  const commissionSetting = settingsMap?.[SETTING_IDS.COMMISSION] || null;
  const bookingPolicySetting = settingsMap?.[SETTING_IDS.BOOKING_POLICY] || null;

  const canOperate = canOperateStudioBooking(member, booking.studioId);
  const canReschedule = canOperate && RESCHEDULABLE_BOOKING_STATUSES.has(booking.status);

  const [mode, setMode] = useState('view'); // 'view' | 'reschedule' | 'cancel' | 'no_show' | 'reject'
  const sessionStatus = useMemo(() => resolveSessionStatus(booking), [booking.sessionStatus, booking.status]);
  const timezone = booking.timezone || studio?.timezone || 'Asia/Jakarta';
  const scheduledStartMs = booking.startAt instanceof Date
    ? booking.startAt.getTime()
    : booking.startAt?.toDate?.()?.getTime?.() || 0;
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    const refreshClock = () => setClockNow(Date.now());
    const intervalId = window.setInterval(refreshClock, 15_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const noShowEligible = Boolean(
    booking.status === BOOKING_STATUS.CONFIRMED
    && sessionStatus === SESSION_STATUS.UPCOMING
    && !booking.checkedInAt
    && scheduledStartMs > 0
    && clockNow >= scheduledStartMs + 15 * 60 * 1000
  );
  const [reasonText, setReasonText] = useState('');
  const [newDateKey, setNewDateKey] = useState(booking.dateKey);
  const [newStartTime, setNewStartTime] = useState(booking.startTime);
  const [newDurationMinutes, setNewDurationMinutes] = useState(booking.durationMinutes);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const effectiveHours = studio?.operatingHours || booking.studioSnapshot?.operatingHours;
  const effectiveGranularity =
    studio?.slotGranularityMinutes || booking.studioSnapshot?.slotGranularityMinutes || 15;

  const durationOptions = useMemo(() => {
    const base = service?.durationOptions || [booking.durationMinutes];
    return base.includes(booking.durationMinutes) ? base : [...base, booking.durationMinutes].sort((a, b) => a - b);
  }, [service, booking.durationMinutes]);

  const startOptions = useMemo(
    () =>
      buildStartTimeOptions({
        operatingHours: effectiveHours,
        slotGranularityMinutes: effectiveGranularity,
      }),
    [effectiveHours, effectiveGranularity],
  );

  // Realtime append-only activity log listener scoped to this booking & studio
  const subscribeLogs = useCallback(
    ({ onData, onError }) =>
      subscribeBookingActivityLogs({
        businessId: member.businessId,
        studioId: booking.studioId,
        bookingId: booking.bookingId,
        onData,
        onError,
      }),
    [member.businessId, booking.studioId, booking.bookingId],
  );

  const { data: activityLogs } = useRegistrySubscription(
    'phase03:detail:activity-logs',
    subscribeLogs,
    [],
  );

  const subscribeSessionEvents = useCallback(
    ({ onData, onError }) =>
      subscribeBookingSessionEvents({
        businessId: member.businessId,
        studioId: booking.studioId,
        bookingId: booking.bookingId,
        onData,
        onError,
      }),
    [member.businessId, booking.studioId, booking.bookingId],
  );

  const {
    data: sessionEvents,
    loading: sessionEventsLoading,
    error: sessionEventsError,
    fromCache: sessionEventsFromCache,
  } = useRegistrySubscription(
    'phase10:detail:session-events',
    subscribeSessionEvents,
    [],
  );

  // Realtime slots listener when Reschedule panel is open
  const subscribeRescheduleSlots = useCallback(
    ({ onData, onError }) =>
      subscribeActiveSlotsForStudioDay({
        businessId: member.businessId,
        studioId: booking.studioId,
        dateKey: newDateKey,
        onData,
        onError,
      }),
    [member.businessId, booking.studioId, newDateKey],
  );

  const { data: daySlotsForReschedule } = useRegistrySubscription(
    'phase03:detail:reschedule-slots',
    mode === 'reschedule' ? subscribeRescheduleSlots : null,
    [],
  );

  const occupiedByOtherBooking = useMemo(() => {
    const set = new Set();
    for (const slot of daySlotsForReschedule) {
      if (slot.bookingId !== booking.bookingId) {
        set.add(slot.bucketIndex);
      }
    }
    return set;
  }, [daySlotsForReschedule, booking.bookingId]);

  const reschedulePreview = useMemo(() => {
    if (mode !== 'reschedule') return null;
    try {
      return computeBookingSlotPlan({
        studioId: booking.studioId,
        dateKey: newDateKey,
        startTime: newStartTime,
        durationMinutes: newDurationMinutes,
        bufferMinutes: scheduleSetting?.bufferMinutes ?? booking.bufferMinutes ?? 0,
        timezone: studio?.timezone || booking.timezone || 'Asia/Jakarta',
        operatingHours: effectiveHours,
        slotGranularityMinutes: effectiveGranularity,
      });
    } catch (err) {
      return { error: err.message };
    }
  }, [
    mode,
    booking.studioId,
    booking.bufferMinutes,
    booking.timezone,
    newDateKey,
    newStartTime,
    newDurationMinutes,
    scheduleSetting,
    studio,
    effectiveHours,
    effectiveGranularity,
  ]);

  async function handleTransition(targetStatus, requiredReason = null) {
    setErrorMessage('');
    setSubmitting(true);
    try {
      const updated = await transitionBookingStatusUseCase({
        member,
        booking,
        targetStatus,
        reason: requiredReason,
        businessOwnerUid: business?.ownerUid || null,
        isOnline,
      });
      onMutated?.(`Status booking diperbarui menjadi ${targetStatus}.`, updated);
      onClose();
    } catch (err) {
      setErrorMessage(err.message || 'Gagal memperbarui status booking.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSessionAction(action, requiredReason = null) {
    setErrorMessage('');
    setSubmitting(true);
    try {
      const updated = await performBookingSessionActionUseCase({
        member,
        booking,
        action,
        reason: requiredReason,
        businessOwnerUid: business?.ownerUid || null,
        isOnline,
      });
      const labelByAction = {
        [SESSION_ACTION.CHECK_IN]: 'Customer berhasil check-in.',
        [SESSION_ACTION.START]: 'Sesi berhasil dimulai.',
        [SESSION_ACTION.COMPLETE]: 'Sesi selesai dan diteruskan ke Finance.',
        [SESSION_ACTION.NO_SHOW]: 'Booking berhasil ditandai No-Show.',
        [SESSION_ACTION.CANCEL]: 'Booking berhasil dibatalkan.',
        [SESSION_ACTION.REJECT]: 'Booking berhasil ditolak.',
      };
      onMutated?.(labelByAction[action] || 'Aksi sesi berhasil disimpan.', updated);
      onClose();
    } catch (err) {
      setErrorMessage(err.message || 'Gagal memperbarui status sesi.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRescheduleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setSubmitting(true);
    try {
      const updated = await rescheduleBookingUseCase({
        member,
        booking,
        studio,
        service,
        newDateKey,
        newStartTime,
        newDurationMinutes,
        reason: reasonText.trim() || null,
        scheduleSetting,
        commissionSetting,
        bookingPolicySetting,
        businessOwnerUid: business?.ownerUid || null,
        isOnline,
      });
      onMutated?.(
        `Booking di-reschedule ke ${updated.dateKey} ${updated.startTime}–${updated.endTime} (${updated.timezone || timezone}).`,
        updated,
      );
      onClose();
    } catch (err) {
      setErrorMessage(err.message || 'Gagal melakukan reschedule booking.');
    } finally {
      setSubmitting(false);
    }
  }

  const statusMeta = getBookingStatusMeta(booking.status);
  const dateLabel = formatDateKeyLabel(booking.dateKey).fullLabel;
  const canCancelSession = canOperate && [
    BOOKING_STATUS.PENDING_CONFIRMATION,
    BOOKING_STATUS.CONFIRMED,
    BOOKING_STATUS.IN_PROGRESS,
  ].includes(booking.status) && [
    SESSION_STATUS.PENDING,
    SESSION_STATUS.UPCOMING,
    SESSION_STATUS.IN_PROGRESS,
  ].includes(sessionStatus);
  const noShowGraceRemaining = scheduledStartMs > 0
    ? Math.max(0, Math.ceil((scheduledStartMs + 15 * 60 * 1000 - clockNow) / 60000))
    : null;

  return (
    <DialogModal
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      size="xl"
      title={`${booking.customerSnapshot?.name || 'Customer'} — ${booking.serviceSnapshot?.name || 'Layanan'}`}
      description={`${booking.studioSnapshot?.name || booking.studioId} · ${dateLabel} · ${booking.startTime}–${booking.endTime} (${timezone})`}
      className="max-h-[min(92vh,900px)] overflow-y-auto"
    >
      <div style={{ display: 'grid', gap: '16px' }}>
        {!isOnline && (
          <StatusAlert
            variant="danger"
            title="Mode Offline"
            message="Perubahan status, cancel, atau reschedule booking membutuhkan koneksi internet aktif."
          />
        )}

        {errorMessage && (
          <StatusAlert variant="danger" title="Aksi Ditolak" message={errorMessage} />
        )}

        <div
          className="panel"
          style={{
            padding: '14px',
            display: 'grid',
            gap: '10px',
            background: 'var(--bg-input)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span className={`badge ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
            <span className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {booking.slotIds.length} slot bucket · Reschedule: {booking.rescheduleCount}x
            </span>
          </div>

          <div className="grid-2" style={{ fontSize: '13px', gap: '10px' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                Customer Snapshot
              </div>
              <strong>{booking.customerSnapshot?.name}</strong>
              {booking.customerSnapshot?.bandOrActName && (
                <div style={{ color: 'var(--text-secondary)' }}>
                  Band: {booking.customerSnapshot.bandOrActName}
                </div>
              )}
              <div style={{ color: 'var(--text-secondary)' }}>{booking.customerSnapshot?.phone}</div>
            </div>

            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                Price & Service Snapshot (v{booking.serviceSnapshot?.configVersion || 1})
              </div>
              <strong style={{ color: 'var(--accent-brass)', fontSize: '15px' }}>
                {formatIdr(booking.priceSnapshot?.totalMinor)}
              </strong>
              <div style={{ color: 'var(--text-secondary)' }}>
                Subtotal {formatIdr(booking.priceSnapshot?.baseSubtotalMinor)} · Diskon{' '}
                {formatIdr(booking.priceSnapshot?.discountMinor)}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                Estimasi Komisi: {formatIdr(booking.commissionSnapshot?.amountMinor)} (
                {booking.commissionSnapshot?.method})
              </div>
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border border-border bg-background/70 p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Booking Status</div>
              <div className="font-semibold text-foreground">{statusMeta.label}</div>
            </div>
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Session Status</div>
              <div className="font-semibold text-foreground">{sessionStatus.replaceAll('_', ' ')}</div>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              {booking.checkedInAt && <div>Check-in: {formatLogTimestamp(booking.checkedInAt, timezone)} · {booking.checkedInByName || booking.checkedInByUid || 'Aktor tidak tercatat'}</div>}
              {booking.actualStartAt && <div>Mulai aktual: {formatLogTimestamp(booking.actualStartAt, timezone)} · {booking.actualStartByName || booking.actualStartByUid || 'Aktor tidak tercatat'}</div>}
              {booking.actualEndAt && <div>Selesai aktual: {formatLogTimestamp(booking.actualEndAt, timezone)} · {booking.actualEndByName || booking.actualEndByUid || 'Aktor tidak tercatat'} · {booking.actualDurationMinutes ?? '—'} menit</div>}
              {booking.noShowAt && <div>No-Show: {formatLogTimestamp(booking.noShowAt, timezone)} · {booking.noShowByName || booking.noShowByUid || 'Aktor tidak tercatat'}</div>}
              {sessionStatus === SESSION_STATUS.IN_PROGRESS && !booking.actualStartAt && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-2 text-warning-foreground">
                  Data legacy: status sesi berjalan tersedia, tetapi waktu mulai aktual tidak pernah direkam. Waktu tidak dibuat-buat.
                </div>
              )}
            </div>
          </div>

          {booking.notes && (
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
              Catatan: {booking.notes}
            </div>
          )}

          {booking.cancelReason && (
            <div style={{ fontSize: '13px', color: 'var(--destructive)', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
              Alasan ({booking.status}): {booking.cancelReason}
            </div>
          )}

          {(booking.status === BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT ||
            booking.status === BOOKING_STATUS.SETTLEMENT_REVIEW) && (
            <div className="alert alert-warning" style={{ padding: '8px 12px', fontSize: '12px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
              <span>
                {booking.status === BOOKING_STATUS.SETTLEMENT_REVIEW
                  ? `Perlu review settlement Owner${booking.settlement?.reviewReason ? `: ${booking.settlement.reviewReason}` : '.'}`
                  : 'Sesi selesai dan masuk antrean final settlement Owner.'}
              </span>
              {member?.role === ROLES.OWNER && (
                <Link to="/owner/finance" className="btn btn-primary btn-sm" onClick={onClose}>
                  <span>Review & Settle</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              )}
            </div>
          )}

          {booking.status === BOOKING_STATUS.SETTLED && booking.settlement && (
            <div className="alert alert-success" style={{ padding: '8px 12px', fontSize: '12px' }}>
              <span>
                Settled ({booking.settlement.paymentMethod}) · Dibayar{' '}
                <strong>{formatIdr(booking.settlement.paidAmountMinor)}</strong>
                {booking.settlement.settlementReference
                  ? ` · Ref: ${booking.settlement.settlementReference}`
                  : ''}
              </span>
            </div>
          )}
        </div>

        {/* Booking and session actions are separate state machines. */}
        {canOperate && mode === 'view' && (
          <div className="flex flex-wrap gap-2">
            {booking.status === BOOKING_STATUS.PENDING_CONFIRMATION && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  loading={submitting}
                  disabled={!isOnline}
                  onClick={() => handleTransition(BOOKING_STATUS.CONFIRMED)}
                >
                  <CheckCircle2 size={14} aria-hidden="true" />
                  Konfirmasi Booking
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={submitting || !isOnline}
                  onClick={() => {
                    setErrorMessage('');
                    setReasonText('');
                    setMode('reject');
                  }}
                >
                  <XCircle size={14} aria-hidden="true" />
                  Tolak Request
                </Button>
              </>
            )}

            {booking.status === BOOKING_STATUS.CONFIRMED && sessionStatus === SESSION_STATUS.UPCOMING && (
              <>
                {!booking.checkedInAt && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={submitting}
                    disabled={!isOnline}
                    onClick={() => handleSessionAction(SESSION_ACTION.CHECK_IN)}
                  >
                    <LogIn size={14} aria-hidden="true" />
                    Check-in Customer
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  loading={submitting}
                  disabled={!isOnline}
                  onClick={() => handleSessionAction(SESSION_ACTION.START)}
                >
                  <Play size={14} aria-hidden="true" />
                  Mulai Sesi
                </Button>
                {!booking.checkedInAt && noShowEligible && (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={submitting || !isOnline}
                    onClick={() => {
                      setErrorMessage('');
                      setReasonText('');
                      setMode('no_show');
                    }}
                  >
                    <UserX size={14} aria-hidden="true" />
                    Tandai No-Show
                  </Button>
                )}
                {!booking.checkedInAt && !noShowEligible && (
                  <span className="self-center text-xs text-muted-foreground">
                    No-Show tersedia {noShowGraceRemaining > 0 ? `dalam ${noShowGraceRemaining} menit` : 'setelah waktu mulai terverifikasi'}.
                  </span>
                )}
              </>
            )}

            {sessionStatus === SESSION_STATUS.IN_PROGRESS && booking.actualStartAt && (
              <Button
                variant="success"
                size="sm"
                loading={submitting}
                disabled={!isOnline}
                onClick={() => handleSessionAction(SESSION_ACTION.COMPLETE)}
              >
                <SquareCheck size={14} aria-hidden="true" />
                Selesaikan Sesi
              </Button>
            )}

            {canReschedule && (
              <Button
                variant="outline"
                size="sm"
                disabled={submitting || !isOnline}
                onClick={() => {
                  setErrorMessage('');
                  setMode('reschedule');
                }}
              >
                <CalendarClock size={14} aria-hidden="true" />
                Reschedule
              </Button>
            )}

            {canCancelSession && (
              <Button
                variant="danger"
                size="sm"
                disabled={submitting || !isOnline}
                onClick={() => {
                  setErrorMessage('');
                  setReasonText('');
                  setMode('cancel');
                }}
              >
                <Ban size={14} aria-hidden="true" />
                Batalkan Booking
              </Button>
            )}
          </div>
        )}

        {(mode === 'cancel' || mode === 'no_show' || mode === 'reject') && (
          <div className="grid gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="space-y-1">
              <strong className="text-sm font-semibold text-foreground">
                {mode === 'cancel'
                  ? 'Konfirmasi pembatalan booking'
                  : mode === 'reject'
                    ? 'Tolak permintaan booking'
                    : 'Konfirmasi No-Show'}
              </strong>
              <p className="text-xs text-muted-foreground">
                {mode === 'no_show'
                  ? 'Aksi hanya diterima setelah 15 menit dari jadwal mulai dan jika customer belum check-in.'
                  : 'Alasan disimpan sebagai bagian dari riwayat sesi yang bersifat append-only.'}
              </p>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-foreground" htmlFor="bk-reason-input">
                Alasan {mode === 'no_show' || mode === 'reject' || mode === 'cancel' ? 'wajib' : ''}
              </label>
              <Textarea
                id="bk-reason-input"
                rows={3}
                maxLength={300}
                value={reasonText}
                onChange={(event) => setReasonText(event.target.value)}
                placeholder={
                  mode === 'cancel'
                    ? 'Contoh: Band meminta pembatalan H-1'
                    : mode === 'reject'
                      ? 'Contoh: Studio tidak tersedia pada jadwal yang diminta'
                      : 'Contoh: Customer tidak hadir setelah 15 menit'
                }
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" disabled={submitting} onClick={() => setMode('view')}>
                Kembali
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={submitting}
                disabled={!isOnline || reasonText.trim().length < (mode === 'no_show' ? 4 : 3)}
                onClick={() => {
                  const action = mode === 'cancel'
                    ? SESSION_ACTION.CANCEL
                    : mode === 'reject'
                      ? SESSION_ACTION.REJECT
                      : SESSION_ACTION.NO_SHOW;
                  handleSessionAction(action, reasonText);
                }}
              >
                {mode === 'cancel' ? 'Batalkan Booking' : mode === 'reject' ? 'Tolak Booking' : 'Tandai No-Show'}
              </Button>
            </div>
          </div>
        )}

        {/* Reschedule Atomic Swap Sub-Form */}
        {mode === 'reschedule' && (
          <form onSubmit={handleRescheduleSubmit} className="grid gap-4 rounded-2xl border border-border bg-card p-4">
            <div className="space-y-1">
              <strong className="text-sm font-semibold text-foreground">
                Reschedule Atomik
              </strong>
              <p className="text-xs text-muted-foreground">
                Slot lama dilepas dan slot baru dikunci dalam satu transaksi Firestore.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label={`Tanggal Baru (${timezone})`} required>
                <Input
                  id="rs-date"
                  type="date"
                  value={newDateKey}
                  onChange={(event) => setNewDateKey(event.target.value)}
                  required
                />
              </FormField>
              <FormField label="Jam Mulai Baru" required>
                <SelectField
                  id="rs-start"
                  value={newStartTime}
                  onValueChange={setNewStartTime}
                  options={startOptions.map((option) => {
                    const conflicted = occupiedByOtherBooking.has(option.bucketIndex);
                    return {
                      value: option.timeHHmm,
                      label: `${option.timeHHmm} · ${conflicted ? 'Bentrok' : 'Tersedia'}`,
                      disabled: conflicted,
                    };
                  })}
                />
              </FormField>
              <FormField label="Durasi" required>
                <SelectField
                  id="rs-dur"
                  value={newDurationMinutes}
                  onValueChange={(value) => setNewDurationMinutes(Number(value))}
                  options={durationOptions.map((duration) => ({
                    value: duration,
                    label: `${duration} menit`,
                  }))}
                />
              </FormField>
            </div>

            <FormField label="Alasan Reschedule (opsional)">
              <Textarea
                id="rs-reason"
                rows={2}
                placeholder="Contoh: Pindah jadwal ke sore"
                maxLength={300}
                value={reasonText}
                onChange={(event) => setReasonText(event.target.value)}
              />
            </FormField>

            {reschedulePreview?.error && (
              <StatusAlert variant="warning" title="Jadwal belum valid" message={reschedulePreview.error} />
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setMode('view')}>
                Batal
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={submitting}
                disabled={!isOnline || Boolean(reschedulePreview?.error)}
              >
                {!isOnline ? (
                  <>
                    <WifiOff size={14} aria-hidden="true" />
                    Offline
                  </>
                ) : (
                  'Simpan Reschedule'
                )}
              </Button>
            </div>
          </form>
        )}

        <section className="grid gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <History size={15} aria-hidden="true" />
            <span>Riwayat Sesi (Append-Only)</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{sessionEvents.length}</span>
          </div>
          {sessionEventsError && (
            <StatusAlert
              variant="danger"
              title="Riwayat Sesi Tidak Dapat Dimuat"
              message={sessionEventsError.message || 'Listener riwayat sesi gagal tersambung.'}
            />
          )}
          {sessionEventsFromCache && (
            <StatusAlert
              variant="warning"
              title="Riwayat dari Cache"
              message="Riwayat sesi berasal dari cache lokal; perubahan terbaru mungkin belum tersinkron."
            />
          )}
          {sessionEventsLoading && sessionEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">Memuat riwayat sesi...</p>
          ) : sessionEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {sessionEventsError ? 'Riwayat belum tersedia karena listener gagal.' : 'Belum ada aksi sesi yang tercatat.'}
            </p>
          ) : (
            <div className="grid gap-2">
              {sessionEvents.map((event) => (
                <article key={event.eventId} className="grid gap-1 rounded-xl border border-border bg-card px-3 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="font-semibold text-foreground">{event.action.replaceAll('_', ' ')}</strong>
                    <span className="text-muted-foreground">{formatLogTimestamp(event.createdAt, timezone)} · {event.actorName} ({event.actorRole})</span>
                  </div>
                  <span className="text-muted-foreground">{event.fromStatus.replaceAll('_', ' ')} → {event.toStatus.replaceAll('_', ' ')}</span>
                  {event.reason && <span className="text-muted-foreground">Alasan: {event.reason}</span>}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Append-only Audit Trail */}
        <section style={{ display: 'grid', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            <History size={15} aria-hidden="true" />
            <span>Riwayat Aktivitas Booking (Append-Only)</span>
          </div>
          {activityLogs.length === 0 ? (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Belum ada aktivitas tercatat atau sedang memuat...
            </span>
          ) : (
            <div style={{ display: 'grid', gap: '6px' }}>
              {activityLogs.map((log) => (
                <div
                  key={log.eventId}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-input)',
                    fontSize: '12px',
                    display: 'grid',
                    gap: '2px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{log.eventType}</strong>
                    <span className="mono" style={{ color: 'var(--text-muted)' }}>
                      {formatLogTimestamp(log.createdAt, timezone)} · {log.actorRole}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>{log.summary}</div>
                  {log.reason && <div style={{ color: 'var(--text-muted)' }}>Alasan: {log.reason}</div>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DialogModal>
  );
}
