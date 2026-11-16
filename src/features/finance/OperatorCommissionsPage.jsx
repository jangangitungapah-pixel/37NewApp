import { useCallback, useMemo, useState } from 'react';
import { Coins, Filter, Lock } from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import { subscribeCommissionEntriesInRange } from '../../data/repositories/financeRepository.js';
import { computeFinanceSummary } from '../../domain/calculations/financeMetricsCalculator.js';
import { addDaysToDateKey, getTodayDateKey } from '../../domain/calculations/slotGenerator.js';
import { COMMISSION_DIRECTION } from '../../domain/enums/roles.js';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { useRegistrySubscription } from '../../shared/hooks/useRegistrySubscription.js';
import { formatIdr } from '../../shared/utils/formatters.js';

export function OperatorCommissionsPage() {
  const { member, business } = useAuthSession();
  const tz = business?.timezone || 'Asia/Jakarta';
  const todayKey = getTodayDateKey(tz);

  const [startDateKey, setStartDateKey] = useState(() => addDaysToDateKey(todayKey, -29));
  const [endDateKey, setEndDateKey] = useState(todayKey);

  const subscribeMyCommissions = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId || !member?.uid) return () => {};
      return subscribeCommissionEntriesInRange({
        businessId: member.businessId,
        member,
        startDateKey,
        endDateKey,
        onData,
        onError,
      });
    },
    [member, startDateKey, endDateKey],
  );

  const {
    data: commissionEntries,
    loading,
    fromCache,
    error,
  } = useRegistrySubscription(
    'phase04:operator:my-commissions',
    member?.businessId && member?.uid ? subscribeMyCommissions : null,
    [],
  );

  const summary = useMemo(
    () =>
      computeFinanceSummary({
        bookings: [],
        ledgerEntries: [],
        commissionEntries,
      }),
    [commissionEntries],
  );

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Komisi Saya</h1>
          <p className="page-subtitle">
            Riwayat komisi immutable milik Anda (<span className="mono">{member?.uid}</span>) dari booking yang sudah di-settle oleh Owner.
          </p>
        </div>
        <span className="badge badge-info">
          <Lock size={13} aria-hidden="true" />
          <span>Scoped Strictly to My UID</span>
        </span>
      </header>

      {error && (
        <StatusAlert variant="danger" title="Gagal Memuat Komisi" message={error.message} />
      )}

      {fromCache && (
        <StatusAlert
          variant="warning"
          title="Menampilkan Cache Lokal"
          message="Data komisi berasal dari cache offline dan akan disinkronkan ulang saat online."
        />
      )}

      <section className="panel" style={{ padding: '14px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <Filter size={14} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
          <label className="field-label" htmlFor="op-comm-start">
            Dari
          </label>
          <input
            id="op-comm-start"
            type="date"
            className="field-input"
            style={{ width: 'auto', minHeight: '34px', padding: '4px 10px' }}
            value={startDateKey}
            onChange={(e) => {
              if (e.target.value) setStartDateKey(e.target.value);
            }}
          />
          <label className="field-label" htmlFor="op-comm-end">
            Sampai
          </label>
          <input
            id="op-comm-end"
            type="date"
            className="field-input"
            style={{ width: 'auto', minHeight: '34px', padding: '4px 10px' }}
            value={endDateKey}
            onChange={(e) => {
              if (e.target.value) setEndDateKey(e.target.value);
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Coins size={18} style={{ color: 'var(--accent-brass)' }} aria-hidden="true" />
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Net Komisi Periode:</span>
          <strong style={{ fontSize: '18px', color: 'var(--accent-brass)' }}>
            {formatIdr(summary.netCommissionMinor)}
          </strong>
        </div>
      </section>

      {loading ? (
        <div className="panel" style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Memuat riwayat komisi...
        </div>
      ) : commissionEntries.length === 0 ? (
        <div className="empty-state">
          <strong>Belum Ada Komisi Tercatat pada Periode Ini</strong>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Komisi otomatis dicatat saat Owner menyelesaikan final settlement untuk sesi yang Anda tangani.
          </span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tanggal & Booking</th>
                <th>Tipe</th>
                <th>Metode & Basis</th>
                <th>Nominal (IDR)</th>
              </tr>
            </thead>
            <tbody>
              {commissionEntries.map((comm) => {
                const isCredit = comm.direction === COMMISSION_DIRECTION.CREDIT;
                return (
                  <tr key={comm.entryId}>
                    <td className="mono">
                      <div>{comm.dateKey}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Booking: {comm.bookingId}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${isCredit ? 'badge-success' : 'badge-danger'}`}>
                        {comm.entryType}
                      </span>
                      {comm.reason && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {comm.reason}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      <div>
                        {comm.method} ({comm.rateOrValue}
                        {comm.method === 'percentage' ? '%' : ''})
                      </div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        Basis {comm.basis}: {formatIdr(comm.basisAmountMinor)}
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: isCredit ? 'var(--status-success)' : 'var(--status-danger)' }}>
                        {isCredit ? '+' : '-'}
                        {formatIdr(comm.amountMinor)}
                      </strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
