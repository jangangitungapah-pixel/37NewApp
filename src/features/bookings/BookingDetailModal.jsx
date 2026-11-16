import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  History,
  Play,
  SquareCheck,
  UserX,
  WifiOff,
} from 'lucide-react';
import { RESCHEDULABLE_BOOKING_STATUSES } from '../../domain/validators/bookingValidator.js';
import {
  buildStartTimeOptions,
  computeBookingSlotPlan,
  formatDateKeyLabel,
} from '../../domain/calculations/slotGenerator.js';
import { BOOKING_STATUS, ROLES, SETTING_IDS } from '../../domain/enums/roles.js';
import { canOperateStudioBooking } from '../../domain/policies/accessPolicy.js';
import {
  rescheduleBookingUseCase,
  transitionBookingStatusUseCase,
} from '../../application/use-cases/bookingUseCases.js';
import {
  subscribeActiveSlotsForStudioDay,
  subscribeBookingActivityLogs,
} from '../../data/repositories/bookingRepository.js';
import { ModalDialog } from '../../shared/components/ModalDialog.jsx';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { useRegistrySubscription } from '../../shared/hooks/useRegistrySubscription.js';
import { formatIdr } from '../../shared/utils/formatters.js';
import { getBookingStatusMeta } from './bookingStatusUi.js';

function formatLogTimestamp(dateVal) {
  if (!(dateVal instanceof Date) || Number.isNaN(dateVal.getTime())) {
    return 'Baru saja';
  }
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
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

  const [mode, setMode] = useState('view'); // 'view' | 'reschedule' | 'cancel' | 'no_show'
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
        `Booking di-reschedule ke ${updated.dateKey} ${updated.startTime}–${updated.endTime} WIB.`,
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

  return (
    <ModalDialog
      open
      onClose={onClose}
      title={`${booking.customerSnapshot?.name || 'Customer'} — ${booking.serviceSnapshot?.name || 'Layanan'}`}
      subtitle={`${booking.studioSnapshot?.name || booking.studioId} · ${dateLabel} · ${booking.startTime}–${booking.endTime} WIB`}
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
            background: 'rgba(13, 18, 28, 0.78)',
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

          {booking.notes && (
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
              Catatan: {booking.notes}
            </div>
          )}

          {booking.cancelReason && (
            <div style={{ fontSize: '13px', color: '#ffd0d0', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
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

        {/* Operational Action Bar */}
        {canOperate && mode === 'view' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {booking.status === BOOKING_STATUS.PENDING_CONFIRMATION && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={submitting || !isOnline}
                onClick={() => handleTransition(BOOKING_STATUS.CONFIRMED)}
              >
                <CheckCircle2 size={14} aria-hidden="true" />
                <span>Konfirmasi Booking</span>
              </button>
            )}

            {booking.status === BOOKING_STATUS.CONFIRMED && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={submitting || !isOnline}
                onClick={() => handleTransition(BOOKING_STATUS.IN_PROGRESS)}
              >
                <Play size={14} aria-hidden="true" />
                <span>Mulai Sesi / Check-in</span>
              </button>
            )}

            {booking.status === BOOKING_STATUS.IN_PROGRESS && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={submitting || !isOnline}
                onClick={() => handleTransition(BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT)}
              >
                <SquareCheck size={14} aria-hidden="true" />
                <span>Selesaikan Sesi</span>
              </button>
            )}

            {canReschedule && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={submitting || !isOnline}
                onClick={() => {
                  setErrorMessage('');
                  setMode('reschedule');
                }}
              >
                <CalendarClock size={14} aria-hidden="true" />
                <span>Reschedule</span>
              </button>
            )}

            {booking.status === BOOKING_STATUS.CONFIRMED && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={submitting || !isOnline}
                onClick={() => {
                  setErrorMessage('');
                  setReasonText('');
                  setMode('no_show');
                }}
              >
                <UserX size={14} aria-hidden="true" />
                <span>Tandai No-Show</span>
              </button>
            )}

            {[
              BOOKING_STATUS.PENDING_CONFIRMATION,
              BOOKING_STATUS.CONFIRMED,
              BOOKING_STATUS.IN_PROGRESS,
            ].includes(booking.status) && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={submitting || !isOnline}
                onClick={() => {
                  setErrorMessage('');
                  setReasonText('');
                  setMode('cancel');
                }}
              >
                <Ban size={14} aria-hidden="true" />
                <span>Batalkan Booking</span>
              </button>
            )}
          </div>
        )}

        {/* Cancel / No-Show Confirmation Sub-Form */}
        {(mode === 'cancel' || mode === 'no_show') && (
          <div className="panel" style={{ display: 'grid', gap: '10px', padding: '14px' }}>
            <strong style={{ fontSize: '14px' }}>
              {mode === 'cancel'
                ? 'Konfirmasi Pembatalan Booking (Melepas Slot Atomik)'
                : 'Konfirmasi Status No-Show (Melepas Slot Atomik)'}
            </strong>
            <div className="field">
              <label className="field-label" htmlFor="bk-reason-input">
                Alasan wajib diisi (tersimpan di audit activity log)
              </label>
              <input
                id="bk-reason-input"
                className="field-input"
                placeholder={
                  mode === 'cancel'
                    ? 'Contoh: Band meminta pembatalan H-1'
                    : 'Contoh: Customer tidak hadir hingga 20 menit'
                }
                maxLength={300}
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn btn-sm" onClick={() => setMode('view')}>
                Batal
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={submitting || !isOnline}
                onClick={() =>
                  handleTransition(
                    mode === 'cancel' ? BOOKING_STATUS.CANCELLED : BOOKING_STATUS.NO_SHOW,
                    reasonText,
                  )
                }
              >
                {submitting ? 'Memproses...' : 'Ya, Proses & Lepas Slot'}
              </button>
            </div>
          </div>
        )}

        {/* Reschedule Atomic Swap Sub-Form */}
        {mode === 'reschedule' && (
          <form onSubmit={handleRescheduleSubmit} className="panel" style={{ display: 'grid', gap: '12px', padding: '14px' }}>
            <strong style={{ fontSize: '14px' }}>
              Reschedule Atomik (Melepas Slot Lama & Mengunci Slot Baru)
            </strong>
            <div className="grid-3">
              <div className="field">
                <label className="field-label" htmlFor="rs-date">
                  Tanggal Baru
                </label>
                <input
                  id="rs-date"
                  type="date"
                  className="field-input"
                  value={newDateKey}
                  onChange={(e) => setNewDateKey(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="rs-start">
                  Jam Mulai Baru
                </label>
                <select
                  id="rs-start"
                  className="field-input"
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                >
                  {startOptions.map((opt) => (
                    <option key={opt.timeHHmm} value={opt.timeHHmm}>
                      {opt.timeHHmm} WIB {occupiedByOtherBooking.has(opt.bucketIndex) ? '— [Bentrok]' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="rs-dur">
                  Durasi
                </label>
                <select
                  id="rs-dur"
                  className="field-input"
                  value={newDurationMinutes}
                  onChange={(e) => setNewDurationMinutes(Number(e.target.value))}
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
              <label className="field-label" htmlFor="rs-reason">
                Alasan Reschedule (opsional)
              </label>
              <input
                id="rs-reason"
                className="field-input"
                placeholder="Contoh: Pindah jadwal ke sore"
                maxLength={300}
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
              />
            </div>

            {reschedulePreview?.error && <span className="field-error">{reschedulePreview.error}</span>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn btn-sm" onClick={() => setMode('view')}>
                Batal
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={submitting || !isOnline || Boolean(reschedulePreview?.error)}
              >
                {!isOnline ? (
                  <>
                    <WifiOff size={14} aria-hidden="true" />
                    <span>Offline</span>
                  </>
                ) : (
                  <span>{submitting ? 'Menyimpan...' : 'Simpan Reschedule'}</span>
                )}
              </button>
            </div>
          </form>
        )}

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
                      {formatLogTimestamp(log.createdAt)} · {log.actorRole}
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
    </ModalDialog>
  );
}
