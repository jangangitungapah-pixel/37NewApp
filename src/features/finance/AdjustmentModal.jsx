import { useState } from 'react';
import { RotateCcw, WifiOff } from 'lucide-react';
import {
  recordCommissionAdjustmentUseCase,
  recordLedgerAdjustmentUseCase,
} from '../../application/use-cases/financeUseCases.js';
import {
  COMMISSION_DIRECTION,
  COMMISSION_ENTRY_TYPE,
  LEDGER_DIRECTION,
  LEDGER_ENTRY_TYPE,
} from '../../domain/enums/roles.js';
import { ModalDialog } from '../../shared/components/ModalDialog.jsx';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { formatIdr } from '../../shared/utils/formatters.js';

export function AdjustmentModal({
  targetKind, // 'ledger' | 'commission'
  originalEntry,
  alreadyReversed = false,
  onClose,
  member,
  isOnline,
  onSuccess,
}) {
  const isLedger = targetKind === 'ledger';
  const [entryType, setEntryType] = useState(
    isLedger ? LEDGER_ENTRY_TYPE.ADJUSTMENT : COMMISSION_ENTRY_TYPE.ADJUSTMENT,
  );
  const [direction, setDirection] = useState(
    isLedger ? LEDGER_DIRECTION.OUTFLOW : COMMISSION_DIRECTION.DEBIT,
  );
  const [amountInput, setAmountInput] = useState(String(originalEntry.amountMinor ?? 0));
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const isReversal =
    entryType === LEDGER_ENTRY_TYPE.REVERSAL || entryType === COMMISSION_ENTRY_TYPE.REVERSAL;

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setSubmitting(true);
    try {
      const amountMinor = Math.max(0, Math.trunc(Number(amountInput || 0)));
      if (isLedger) {
        const res = await recordLedgerAdjustmentUseCase({
          member,
          originalEntry,
          entryType,
          direction: entryType === LEDGER_ENTRY_TYPE.REFUND ? LEDGER_DIRECTION.OUTFLOW : direction,
          amountMinor,
          reason,
          isOnline,
        });
        onSuccess?.(`Ledger entry immutable baru (${res.type}) berhasil dicatat.`);
      } else {
        const res = await recordCommissionAdjustmentUseCase({
          member,
          originalEntry,
          entryType,
          direction,
          amountMinor,
          reason,
          isOnline,
        });
        onSuccess?.(`Commission entry immutable baru (${res.entryType}) berhasil dicatat.`);
      }
      onClose();
    } catch (err) {
      setErrorMessage(err.message || 'Gagal mencatat koreksi keuangan.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalDialog
      open
      onClose={onClose}
      title={
        isLedger
          ? 'Catat Adjustment / Refund / Reversal Ledger'
          : 'Catat Adjustment / Reversal Komisi'
      }
      subtitle={`Buku besar bersifat immutable. Koreksi menulis dokumen baru yang mereferensikan ${originalEntry.entryId}.`}
    >
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
        {!isOnline && (
          <StatusAlert
            variant="danger"
            title="Mode Offline"
            message="Koreksi ledger/komisi membutuhkan koneksi aktif."
          />
        )}

        {errorMessage && <StatusAlert variant="danger" title="Gagal" message={errorMessage} />}

        <div className="panel" style={{ padding: '12px', fontSize: '13px', background: 'rgba(13, 18, 28, 0.78)' }}>
          <div>
            Entry Asal: <code className="mono">{originalEntry.entryId}</code>
          </div>
          <div>
            Nilai Asal: <strong>{formatIdr(originalEntry.amountMinor)}</strong> · Tanggal:{' '}
            <span className="mono">{originalEntry.dateKey}</span>
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="field-label" htmlFor="adj-type">
              Jenis Koreksi
            </label>
            <select
              id="adj-type"
              className="field-input"
              value={entryType}
              onChange={(e) => {
                const val = e.target.value;
                setEntryType(val);
                if (val === LEDGER_ENTRY_TYPE.REFUND) {
                  setDirection(LEDGER_DIRECTION.OUTFLOW);
                }
              }}
            >
              {isLedger ? (
                <>
                  <option value={LEDGER_ENTRY_TYPE.ADJUSTMENT}>ADJUSTMENT</option>
                  <option value={LEDGER_ENTRY_TYPE.REFUND}>REFUND (Outflow)</option>
                  {!alreadyReversed && <option value={LEDGER_ENTRY_TYPE.REVERSAL}>REVERSAL (Penuh)</option>}
                </>
              ) : (
                <>
                  <option value={COMMISSION_ENTRY_TYPE.ADJUSTMENT}>ADJUSTMENT</option>
                  {!alreadyReversed && (
                    <option value={COMMISSION_ENTRY_TYPE.REVERSAL}>REVERSAL (Penuh)</option>
                  )}
                </>
              )}
            </select>
          </div>

          {!isReversal && entryType !== LEDGER_ENTRY_TYPE.REFUND && (
            <div className="field">
              <label className="field-label" htmlFor="adj-dir">
                Arah
              </label>
              <select
                id="adj-dir"
                className="field-input"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              >
                {isLedger ? (
                  <>
                    <option value={LEDGER_DIRECTION.OUTFLOW}>Outflow (Kurangi Kas)</option>
                    <option value={LEDGER_DIRECTION.INFLOW}>Inflow (Tambah Kas)</option>
                  </>
                ) : (
                  <>
                    <option value={COMMISSION_DIRECTION.DEBIT}>Debit (Potong Komisi)</option>
                    <option value={COMMISSION_DIRECTION.CREDIT}>Credit (Tambah Komisi)</option>
                  </>
                )}
              </select>
            </div>
          )}
        </div>

        {!isReversal && (
          <div className="field">
            <label className="field-label" htmlFor="adj-amount">
              Nominal Koreksi (IDR)
            </label>
            <input
              id="adj-amount"
              type="number"
              min={0}
              step={1000}
              className="field-input"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              required
            />
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="adj-reason">
            Alasan Audit (wajib min 3 karakter)
          </label>
          <input
            id="adj-reason"
            className="field-input"
            placeholder="Contoh: Koreksi selisih durasi atau refund kelebihan bayar"
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !isOnline}>
            {!isOnline ? (
              <>
                <WifiOff size={15} aria-hidden="true" />
                <span>Offline</span>
              </>
            ) : (
              <>
                <RotateCcw size={15} aria-hidden="true" />
                <span>{submitting ? 'Menyimpan...' : 'Catat Entry Baru (Immutable)'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
