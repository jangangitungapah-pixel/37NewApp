import { useCallback, useMemo, useState } from 'react';
import {
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Coins,
  Filter,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import { subscribeBookingsInRange } from '../../data/repositories/bookingRepository.js';
import {
  subscribeCommissionEntriesInRange,
  subscribeLedgerEntriesInRange,
  subscribeSettlementQueue,
} from '../../data/repositories/financeRepository.js';
import { subscribeStudiosForMember } from '../../data/repositories/studioRepository.js';
import { subscribeBusinessMembers } from '../../data/repositories/teamRepository.js';
import { computeFinanceSummary } from '../../domain/calculations/financeMetricsCalculator.js';
import { addDaysToDateKey, getTodayDateKey } from '../../domain/calculations/slotGenerator.js';
import {
  BOOKING_STATUS,
  COMMISSION_DIRECTION,
  LEDGER_DIRECTION,
} from '../../domain/enums/roles.js';
import { canSettleBookings } from '../../domain/policies/accessPolicy.js';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { useRegistrySubscription } from '../../shared/hooks/useRegistrySubscription.js';
import { formatIdr } from '../../shared/utils/formatters.js';
import { getBookingStatusMeta } from '../bookings/bookingStatusUi.js';
import { AdjustmentModal } from './AdjustmentModal.jsx';
import { SettleBookingModal } from './SettleBookingModal.jsx';

export function FinanceSettlementPage() {
  const { member, business, isOnline } = useAuthSession();
  const canSettle = canSettleBookings(member);
  const tz = business?.timezone || 'Asia/Jakarta';
  const todayKey = getTodayDateKey(tz);

  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'ledger' | 'commission'
  const [startDateKey, setStartDateKey] = useState(() => addDaysToDateKey(todayKey, -29));
  const [endDateKey, setEndDateKey] = useState(todayKey);
  const [studioFilter, setStudioFilter] = useState('all');

  const [settlingBooking, setSettlingBooking] = useState(null);
  const [adjustTarget, setAdjustTarget] = useState(null); // { kind: 'ledger'|'commission', entry, alreadyReversed }
  const [feedback, setFeedback] = useState({ variant: '', title: '', message: '' });

  const subscribeQueue = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId || !canSettle) return () => {};
      return subscribeSettlementQueue({ businessId: member.businessId, onData, onError });
    },
    [member?.businessId, canSettle],
  );
  const { data: settlementQueue, loading: queueLoading, error: queueError } =
    useRegistrySubscription(
      'phase04:finance:queue',
      member?.businessId && canSettle ? subscribeQueue : null,
      [],
    );

  const subscribeWindowBookings = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId || !canSettle) return () => {};
      return subscribeBookingsInRange({
        businessId: member.businessId,
        member,
        studioId: studioFilter,
        startDateKey,
        endDateKey,
        onData,
        onError,
      });
    },
    [member, canSettle, studioFilter, startDateKey, endDateKey],
  );
  const { data: rangeBookings } = useRegistrySubscription(
    'phase04:finance:bookings',
    member?.businessId && canSettle ? subscribeWindowBookings : null,
    [],
  );

  const subscribeLedger = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId || !canSettle) return () => {};
      return subscribeLedgerEntriesInRange({
        businessId: member.businessId,
        studioId: studioFilter,
        startDateKey,
        endDateKey,
        onData,
        onError,
      });
    },
    [member?.businessId, canSettle, studioFilter, startDateKey, endDateKey],
  );
  const { data: ledgerEntries, loading: ledgerLoading, error: ledgerError } =
    useRegistrySubscription(
      'phase04:finance:ledger',
      member?.businessId && canSettle ? subscribeLedger : null,
      [],
    );

  const subscribeCommissions = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId || !canSettle) return () => {};
      return subscribeCommissionEntriesInRange({
        businessId: member.businessId,
        member,
        startDateKey,
        endDateKey,
        onData,
        onError,
      });
    },
    [member, canSettle, startDateKey, endDateKey],
  );
  const { data: commissionEntries, loading: commLoading, error: commError } =
    useRegistrySubscription(
      'phase04:finance:commissions',
      member?.businessId && canSettle ? subscribeCommissions : null,
      [],
    );

  const subscribeStudios = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId) return () => {};
      return subscribeStudiosForMember({ businessId: member.businessId, member, onData, onError });
    },
    [member],
  );
  const { data: studios } = useRegistrySubscription(
    'phase04:finance:studios',
    member?.businessId ? subscribeStudios : null,
    [],
  );

  const subscribeMembers = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId || !canSettle) return () => {};
      return subscribeBusinessMembers({ businessId: member.businessId, onData, onError });
    },
    [member?.businessId, canSettle],
  );
  const { data: teamMembers } = useRegistrySubscription(
    'phase04:finance:members',
    member?.businessId && canSettle ? subscribeMembers : null,
    [],
  );

  const memberNameMap = useMemo(() => {
    const map = new Map();
    for (const m of teamMembers) {
      map.set(m.uid, m.displayName || m.email || m.uid);
    }
    return map;
  }, [teamMembers]);

  const filteredCommissions = useMemo(() => {
    if (studioFilter === 'all') return commissionEntries;
    return commissionEntries.filter((c) => c.studioId === studioFilter);
  }, [commissionEntries, studioFilter]);

  const summary = useMemo(
    () =>
      computeFinanceSummary({
        bookings: rangeBookings,
        ledgerEntries,
        commissionEntries: filteredCommissions,
      }),
    [rangeBookings, ledgerEntries, filteredCommissions],
  );

  const filteredQueue = useMemo(() => {
    if (studioFilter === 'all') return settlementQueue;
    return settlementQueue.filter((b) => b.studioId === studioFilter);
  }, [settlementQueue, studioFilter]);

  if (!canSettle) {
    return (
      <StatusAlert
        variant="danger"
        title="Akses Keuangan Owner-Only"
        message="Settlement booking, ledger bisnis, dan adjustment keuangan hanya dapat diakses Owner."
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Settlement, Ledger & Komisi</h1>
          <p className="page-subtitle">
            Antrean settlement Owner, buku besar kas immutable, dan komisi operator dalam{' '}
            <span className="mono">IDR</span>.
          </p>
        </div>
        <span className="badge badge-warning">
          <ShieldAlert size={14} aria-hidden="true" />
          <span>Immutable Ledger · Reversal Reference</span>
        </span>
      </header>

      {feedback.message && (
        <StatusAlert variant={feedback.variant} title={feedback.title} message={feedback.message} />
      )}

      {(queueError || ledgerError || commError) && (
        <StatusAlert
          variant="danger"
          title="Gagal Memuat Data Keuangan"
          message={(queueError || ledgerError || commError)?.message}
        />
      )}

      {!isOnline && (
        <StatusAlert
          variant="danger"
          title="Mode Offline"
          message="Settlement, refund, adjustment, dan reversal ditahan sampai koneksi Firestore kembali aktif."
        />
      )}

      {/* Date & Studio Filter Bar */}
      <section className="panel" style={{ padding: '14px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <Filter size={14} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
          <label className="field-label" htmlFor="fin-start">
            Dari
          </label>
          <input
            id="fin-start"
            type="date"
            className="field-input"
            style={{ width: 'auto', minHeight: '34px', padding: '4px 10px' }}
            value={startDateKey}
            onChange={(e) => {
              if (e.target.value) setStartDateKey(e.target.value);
            }}
          />
          <label className="field-label" htmlFor="fin-end">
            Sampai
          </label>
          <input
            id="fin-end"
            type="date"
            className="field-input"
            style={{ width: 'auto', minHeight: '34px', padding: '4px 10px' }}
            value={endDateKey}
            onChange={(e) => {
              if (e.target.value) setEndDateKey(e.target.value);
            }}
          />
        </div>

        <select
          aria-label="Filter studio keuangan"
          className="field-input"
          style={{ width: 'auto', minHeight: '34px', padding: '4px 10px' }}
          value={studioFilter}
          onChange={(e) => setStudioFilter(e.target.value)}
        >
          <option value="all">Semua Studio ({studios.length})</option>
          {studios.map((s) => (
            <option key={s.studioId} value={s.studioId}>
              {s.name}
            </option>
          ))}
        </select>
      </section>

      {/* Distinct 6 Financial Metrics Bar (Never Mixed) */}
      <section className="grid-3" aria-label="Ringkasan Metrik Keuangan">
        <article className="panel" style={{ padding: '14px', display: 'grid', gap: '4px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            1. Recognized Revenue (Settled Contracts)
          </span>
          <strong style={{ fontSize: '20px', color: 'var(--accent-brass)' }}>
            {formatIdr(summary.recognizedRevenueMinor)}
          </strong>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Total nilai kontrak booking berstatus SETTLED pada periode filter
          </span>
        </article>

        <article className="panel" style={{ padding: '14px', display: 'grid', gap: '4px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            2. Payment Received / 3. Net Cash Collected
          </span>
          <strong style={{ fontSize: '20px', color: 'var(--status-success)' }}>
            {formatIdr(summary.paymentReceivedMinor)}
          </strong>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Net Kas (setelah refund & adj): <strong>{formatIdr(summary.netCashCollectedMinor)}</strong>
          </span>
        </article>

        <article className="panel" style={{ padding: '14px', display: 'grid', gap: '4px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            4. Outstanding / Unsettled Balance
          </span>
          <strong style={{ fontSize: '20px', color: summary.outstandingBalanceMinor > 0 ? 'var(--status-warning)' : 'var(--text-primary)' }}>
            {formatIdr(summary.outstandingBalanceMinor)}
          </strong>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Tagihan sesi selesai belum settle atau selisih bayar
          </span>
        </article>

        <article className="panel" style={{ padding: '14px', display: 'grid', gap: '4px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            5. Refunds Tercatat
          </span>
          <strong style={{ fontSize: '18px', color: 'var(--status-danger)' }}>
            {formatIdr(summary.refundTotalMinor)}
          </strong>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Total outflow REFUND pada ledger
          </span>
        </article>

        <article className="panel" style={{ padding: '14px', display: 'grid', gap: '4px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            6. Net Adjustments & Reversals
          </span>
          <strong style={{ fontSize: '18px' }}>
            {summary.netAdjustmentMinor >= 0 ? '+' : '-'}
            {formatIdr(Math.abs(summary.netAdjustmentMinor))}
          </strong>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Selisih koreksi ledger (inflow − outflow)
          </span>
        </article>

        <article className="panel" style={{ padding: '14px', display: 'grid', gap: '4px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            7. Net Operator Commission
          </span>
          <strong style={{ fontSize: '18px', color: 'var(--accent-sky)' }}>
            {formatIdr(summary.netCommissionMinor)}
          </strong>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {summary.commissionByOperator.length} anggota tim pada periode ini
          </span>
        </article>
      </section>

      {/* Navigation Tabs */}
      <div className="tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          <BadgeCheck size={15} aria-hidden="true" />
          <span>Antrean Settlement ({filteredQueue.length})</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          <BookOpen size={15} aria-hidden="true" />
          <span>Ledger Kas ({ledgerEntries.length})</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'commission' ? 'active' : ''}`}
          onClick={() => setActiveTab('commission')}
        >
          <Coins size={15} aria-hidden="true" />
          <span>Komisi Tim ({filteredCommissions.length})</span>
        </button>
      </div>

      {/* TAB 1: SETTLEMENT QUEUE */}
      {activeTab === 'queue' && (
        <section style={{ display: 'grid', gap: '12px' }}>
          {queueLoading ? (
            <div className="panel" style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>
              Memuat antrean settlement...
            </div>
          ) : filteredQueue.length === 0 ? (
            <div className="empty-state">
              <CheckCircle2 size={28} style={{ color: 'var(--status-success)' }} aria-hidden="true" />
              <strong>Antrean Settlement Bersih</strong>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Belum ada sesi selesai (`COMPLETED_PENDING_SETTLEMENT` / `SETTLEMENT_REVIEW`) yang menunggu settlement Owner.
              </span>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tanggal & Jam</th>
                    <th>Customer & Studio</th>
                    <th>Layanan & Status</th>
                    <th>Kontrak & Est. Komisi</th>
                    <th>Aksi Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueue.map((b) => {
                    const meta = getBookingStatusMeta(b.status);
                    return (
                      <tr key={b.bookingId}>
                        <td className="mono">
                          <div>{b.dateKey}</div>
                          <div style={{ color: 'var(--text-muted)' }}>
                            {b.startTime}–{b.endTime}
                          </div>
                        </td>
                        <td>
                          <strong>{b.customerSnapshot?.name}</strong>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {b.studioSnapshot?.name}
                          </div>
                        </td>
                        <td>
                          <div>{b.serviceSnapshot?.name}</div>
                          <span className={`badge ${meta.badgeClass}`} style={{ marginTop: '4px' }}>
                            {meta.label}
                          </span>
                          {b.status === BOOKING_STATUS.SETTLEMENT_REVIEW && b.settlement?.reviewReason && (
                            <div style={{ fontSize: '11px', color: '#ffd0d0', marginTop: '4px' }}>
                              Review: {b.settlement.reviewReason}
                            </div>
                          )}
                        </td>
                        <td>
                          <strong style={{ color: 'var(--accent-brass)' }}>
                            {formatIdr(b.priceSnapshot?.totalMinor)}
                          </strong>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Komisi: {formatIdr(b.commissionSnapshot?.amountMinor)} · Staf:{' '}
                            {memberNameMap.get(b.operatorUid) || b.operatorUid || '—'}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setSettlingBooking(b)}
                          >
                            Review & Settle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: IMMUTABLE LEDGER ENTRIES */}
      {activeTab === 'ledger' && (
        <section style={{ display: 'grid', gap: '12px' }}>
          {ledgerLoading ? (
            <div className="panel" style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>
              Memuat catatan ledger...
            </div>
          ) : ledgerEntries.length === 0 ? (
            <div className="empty-state">
              <strong>Belum Ada Ledger pada Rentang Tanggal Ini</strong>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tanggal & Entry ID</th>
                    <th>Jenis & Metode</th>
                    <th>Nominal (IDR)</th>
                    <th>Referensi & Alasan</th>
                    <th>Koreksi (Append-Only)</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerEntries.map((entry) => {
                    const isInflow = entry.direction === LEDGER_DIRECTION.INFLOW;
                    const alreadyRev = summary.reversedLedgerEntryIds.has(entry.entryId);
                    return (
                      <tr key={entry.entryId}>
                        <td className="mono">
                          <div>{entry.dateKey}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {entry.entryId}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${isInflow ? 'badge-success' : 'badge-danger'}`}>
                            {entry.type} ({entry.direction})
                          </span>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            {entry.paymentMethod || '—'}
                          </div>
                        </td>
                        <td>
                          <strong style={{ color: isInflow ? 'var(--status-success)' : 'var(--status-danger)' }}>
                            {isInflow ? '+' : '-'}
                            {formatIdr(entry.amountMinor)}
                          </strong>
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          {entry.reference && <div>Ref: {entry.reference}</div>}
                          {entry.relatedEntryId && (
                            <div className="mono" style={{ color: 'var(--text-muted)' }}>
                              Parent: {entry.relatedEntryId}
                            </div>
                          )}
                          {entry.reason && <div style={{ color: 'var(--text-secondary)' }}>{entry.reason}</div>}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              setAdjustTarget({
                                kind: 'ledger',
                                entry,
                                alreadyReversed: alreadyRev,
                              })
                            }
                          >
                            <RotateCcw size={13} aria-hidden="true" />
                            <span>Koreksi / Refund</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: OPERATOR COMMISSIONS */}
      {activeTab === 'commission' && (
        <section style={{ display: 'grid', gap: '14px' }}>
          {summary.commissionByOperator.length > 0 && (
            <div className="grid-3">
              {summary.commissionByOperator.map((row) => (
                <article key={row.operatorUid} className="panel" style={{ padding: '12px', display: 'grid', gap: '4px' }}>
                  <strong style={{ fontSize: '14px' }}>
                    {memberNameMap.get(row.operatorUid) || row.operatorUid}
                  </strong>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-brass)' }}>
                    {formatIdr(row.netCommissionMinor)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {row.bookingCount} booking · Earned {formatIdr(row.earnedMinor)} · Adj{' '}
                    {row.adjustedMinor >= 0 ? '+' : '-'}
                    {formatIdr(Math.abs(row.adjustedMinor))}
                  </div>
                </article>
              ))}
            </div>
          )}

          {commLoading ? (
            <div className="panel" style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>
              Memuat catatan komisi...
            </div>
          ) : filteredCommissions.length === 0 ? (
            <div className="empty-state">
              <strong>Belum Ada Komisi Tercatat pada Periode Ini</strong>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tanggal & Booking</th>
                    <th>Operator</th>
                    <th>Jenis & Aturan</th>
                    <th>Nominal (IDR)</th>
                    <th>Koreksi (Append-Only)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCommissions.map((comm) => {
                    const isCredit = comm.direction === COMMISSION_DIRECTION.CREDIT;
                    const alreadyRev = summary.reversedCommissionEntryIds.has(comm.entryId);
                    return (
                      <tr key={comm.entryId}>
                        <td className="mono">
                          <div>{comm.dateKey}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Booking: {comm.bookingId}
                          </div>
                        </td>
                        <td>{memberNameMap.get(comm.operatorUid) || comm.operatorUid}</td>
                        <td>
                          <span className={`badge ${isCredit ? 'badge-info' : 'badge-danger'}`}>
                            {comm.entryType} ({comm.direction})
                          </span>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            {comm.method} · basis {comm.basis} ({formatIdr(comm.basisAmountMinor)})
                          </div>
                          {comm.reason && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{comm.reason}</div>
                          )}
                        </td>
                        <td>
                          <strong style={{ color: isCredit ? 'var(--accent-brass)' : 'var(--status-danger)' }}>
                            {isCredit ? '+' : '-'}
                            {formatIdr(comm.amountMinor)}
                          </strong>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              setAdjustTarget({
                                kind: 'commission',
                                entry: comm,
                                alreadyReversed: alreadyRev,
                              })
                            }
                          >
                            <RotateCcw size={13} aria-hidden="true" />
                            <span>Adjust / Reversal</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {settlingBooking && (
        <SettleBookingModal
          key={`${settlingBooking.bookingId}_${settlingBooking.status}`}
          booking={settlingBooking}
          onClose={() => setSettlingBooking(null)}
          member={member}
          isOnline={isOnline}
          onSuccess={(msg) =>
            setFeedback({
              variant: 'success',
              title: 'Settlement Diproses',
              message: msg,
            })
          }
        />
      )}

      {adjustTarget && (
        <AdjustmentModal
          key={adjustTarget.entry.entryId}
          targetKind={adjustTarget.kind}
          originalEntry={adjustTarget.entry}
          alreadyReversed={adjustTarget.alreadyReversed}
          onClose={() => setAdjustTarget(null)}
          member={member}
          isOnline={isOnline}
          onSuccess={(msg) =>
            setFeedback({
              variant: 'success',
              title: 'Koreksi Tercatat (Immutable)',
              message: msg,
            })
          }
        />
      )}
    </div>
  );
}
