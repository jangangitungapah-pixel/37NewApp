import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock, WifiOff } from 'lucide-react';
import {
  requestSettlementReviewUseCase,
  settleBookingUseCase,
} from '../../application/use-cases/financeUseCases.js';
import { computeSettlementCommissionSnapshot } from '../../domain/calculations/financeMetricsCalculator.js';
import { BOOKING_STATUS, PAYMENT_METHOD } from '../../domain/enums/roles.js';
import { ModalDialog } from '../../shared/components/ModalDialog.jsx';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { formatIdr } from '../../shared/utils/formatters.js';

export function SettleBookingModal({
  booking,
  onClose,
  member,
  isOnline,
  onSuccess,
}) {
  const [actionMode, setActionMode] = useState('settle'); // 'settle' | 'review'
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHOD.TRANSFER);
  const [paidAmountInput, setPaidAmountInput] = useState(
    String(booking.priceSnapshot?.totalMinor ?? 0),
  );
  const [settlementReference, setSettlementReference] = useState('');
  const [settlementNotes, setSettlementNotes] = useState('');
  const [reviewReason, setReviewReason] = useState(booking.settlement?.reviewReason || '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const numericPaidMinor = Math.max(0, Math.trunc(Number(paidAmountInput || 0)));

  const previewCommission = useMemo(() => {
    try {
      return computeSettlementCommissionSnapshot({
        booking,
        paidAmountMinor: numericPaidMinor,
      });
    } catch {
      return booking.commissionSnapshot;
    }
  }, [booking, numericPaidMinor]);

  const contractTotal = Number(booking.priceSnapshot?.totalMinor ?? 0);
  const remainingShortfall = Math.max(0, contractTotal - numericPaidMinor);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setSubmitting(true);
    try {
      if (actionMode === 'review') {
        await requestSettlementReviewUseCase({
          member,
          bookingId: booking.bookingId,
          reviewReason,
          isOnline,
        });
        onSuccess?.(`Booking "${booking.customerSnapshot?.name}" dipindah ke SETTLEMENT_REVIEW.`);
      } else {
        const result = await settleBookingUseCase({
          member,
          bookingId: booking.bookingId,
          paymentMethod,
          paidAmountMinor: numericPaidMinor,
          settlementReference: settlementReference.trim() || null,
          settlementNotes: settlementNotes.trim() || null,
          isOnline,
        });
        onSuccess?.(
          result.idempotentReplay
            ? 'Settlement sudah tercatat sebelumnya (idempotent replay).'
            : `Settlement selesai (${formatIdr(numericPaidMinor)}). Ledger & komisi immutable berhasil dicatat.`,
        );
      }
      onClose();
    } catch (err) {
      setErrorMessage(err.message || 'Gagal memproses settlement booking.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalDialog
      open
      onClose={onClose}
      title="Review & Final Settlement Booking"
      subtitle={`${booking.customerSnapshot?.name || ''} · ${booking.studioSnapshot?.name || ''} · ${booking.dateKey} ${booking.startTime}–${booking.endTime} WIB`}
    >
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
        {!isOnline && (
          <StatusAlert
            variant="danger"
            title="Offline — Settlement Ditahan"
            message="Final settlement menulis buku besar & komisi immutable dan wajib tersambung ke Firestore."
          />
        )}

        {errorMessage && (
          <StatusAlert variant="danger" title="Settlement Ditolak" message={errorMessage} />
        )}

        {/* Frozen Booking Financial Snapshot */}
        <div
          className="panel"
          style={{
            padding: '12px',
            display: 'grid',
            gap: '6px',
            background: 'var(--bg-input)',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Snapshot Kontrak Booking (v{booking.serviceSnapshot?.configVersion || 1})</strong>
            <span className="badge badge-info">
              <Lock size={12} aria-hidden="true" />
              <span>{booking.status}</span>
            </span>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            Subtotal: {formatIdr(booking.priceSnapshot?.baseSubtotalMinor)} · Diskon:{' '}
            {formatIdr(booking.priceSnapshot?.discountMinor)} · Total Tagihan:{' '}
            <strong style={{ color: 'var(--accent-brass)' }}>{formatIdr(contractTotal)}</strong>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Aturan Komisi Historis: {booking.commissionSnapshot?.method} ({booking.commissionSnapshot?.rateOrValue}
            {booking.commissionSnapshot?.method === 'percentage' ? '%' : ''}) · basis:{' '}
            <span className="mono">{booking.commissionSnapshot?.basis}</span>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="tabs" style={{ paddingBottom: '10px' }}>
          <button
            type="button"
            className={`tab-btn ${actionMode === 'settle' ? 'active' : ''}`}
            onClick={() => setActionMode('settle')}
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            <span>Approve & Settle Final</span>
          </button>
          {booking.status === BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT && (
            <button
              type="button"
              className={`tab-btn ${actionMode === 'review' ? 'active' : ''}`}
              onClick={() => setActionMode('review')}
            >
              <AlertTriangle size={14} aria-hidden="true" />
              <span>Tandai Perlu Koreksi</span>
            </button>
          )}
        </div>

        {actionMode === 'settle' ? (
          <>
            <div className="grid-2">
              <div className="field">
                <label className="field-label" htmlFor="st-method">
                  Metode Pembayaran Diterima
                </label>
                <select
                  id="st-method"
                  className="field-input"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value={PAYMENT_METHOD.TRANSFER}>Transfer Bank</option>
                  <option value={PAYMENT_METHOD.QRIS}>QRIS</option>
                  <option value={PAYMENT_METHOD.CASH}>Tunai (Cash)</option>
                  <option value={PAYMENT_METHOD.CARD}>Kartu Debit/Kredit</option>
                  <option value={PAYMENT_METHOD.OTHER}>Lainnya</option>
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="st-amount">
                  Nominal Pembayaran Diterima (IDR)
                </label>
                <input
                  id="st-amount"
                  type="number"
                  min={0}
                  step={1000}
                  className="field-input"
                  value={paidAmountInput}
                  onChange={(e) => setPaidAmountInput(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label className="field-label" htmlFor="st-ref">
                  Nomor Referensi / Bukti Transfer (opsional)
                </label>
                <input
                  id="st-ref"
                  className="field-input"
                  placeholder="Contoh: BCA-20261116-991"
                  maxLength={120}
                  value={settlementReference}
                  onChange={(e) => setSettlementReference(e.target.value)}
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="st-notes">
                  Catatan Settlement (opsional)
                </label>
                <input
                  id="st-notes"
                  className="field-input"
                  placeholder="Catatan audit kasir/owner"
                  maxLength={300}
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="panel" style={{ padding: '12px', fontSize: '13px', display: 'grid', gap: '4px', background: 'var(--bg-input)' }}>
              <div>
                Payment Recorded: <strong>{formatIdr(numericPaidMinor)}</strong> · Sisa/Kurang Bayar:{' '}
                <strong style={{ color: remainingShortfall > 0 ? 'var(--status-warning)' : 'var(--status-success)' }}>
                  {formatIdr(remainingShortfall)}
                </strong>
              </div>
              <div>
                Komisi Operator Tercatat: <strong style={{ color: 'var(--accent-brass)' }}>{formatIdr(previewCommission?.amountMinor ?? 0)}</strong> (basis: {previewCommission?.basis})
              </div>
            </div>
          </>
        ) : (
          <div className="field">
            <label className="field-label" htmlFor="st-review-reason">
              Alasan Koreksi / Catatan Review Settlement (wajib min 3 karakter)
            </label>
            <textarea
              id="st-review-reason"
              rows={3}
              className="field-input"
              placeholder="Contoh: Mutasi transfer belum masuk, menunggu bukti pembayaran"
              maxLength={300}
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
              required
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Batal
          </button>
          <button
            type="submit"
            className={actionMode === 'settle' ? 'btn btn-primary' : 'btn btn-danger'}
            disabled={submitting || !isOnline}
          >
            {!isOnline ? (
              <>
                <WifiOff size={15} aria-hidden="true" />
                <span>Offline</span>
              </>
            ) : (
              <span>
                {submitting
                  ? 'Memproses Transaction...'
                  : actionMode === 'settle'
                    ? 'Settle & Catat Ledger Atomik'
                    : 'Pindah ke Review Koreksi'}
              </span>
            )}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
