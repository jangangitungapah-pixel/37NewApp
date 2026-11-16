import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Coins,
  Download,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import { loadDashboardAnalyticsUseCase } from '../../application/use-cases/analyticsUseCases.js';
import { subscribeBusinessSettings } from '../../data/repositories/businessProfileRepository.js';
import { subscribeStudiosForMember } from '../../data/repositories/studioRepository.js';
import { subscribeBusinessMembers } from '../../data/repositories/teamRepository.js';
import { ANALYTICS_PRESETS } from '../../domain/calculations/analyticsCalculator.js';
import { addDaysToDateKey, getTodayDateKey } from '../../domain/calculations/slotGenerator.js';
import { PAYMENT_METHOD, ROLES, SETTING_IDS } from '../../domain/enums/roles.js';
import { canViewBusinessAnalytics } from '../../domain/policies/accessPolicy.js';
import {
  buildBookingsCsvReport,
  buildCommissionCsvReport,
  buildLedgerCsvReport,
} from '../../domain/utils/csvExporter.js';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { useRegistrySubscription } from '../../shared/hooks/useRegistrySubscription.js';
import { formatIdr } from '../../shared/utils/formatters.js';
import { MetricTrendChart } from './components/MetricTrendChart.jsx';
import { StudioUtilizationPanel } from './components/StudioUtilizationPanel.jsx';
import { PhaseFoundationDashboard } from './PhaseFoundationDashboard.jsx';

const PAYMENT_LABELS = {
  [PAYMENT_METHOD.CASH]: 'Tunai (Cash)',
  [PAYMENT_METHOD.TRANSFER]: 'Transfer Bank',
  [PAYMENT_METHOD.QRIS]: 'QRIS',
  [PAYMENT_METHOD.CARD]: 'Kartu (Debit/Kredit)',
  [PAYMENT_METHOD.OTHER]: 'Lainnya',
};

function triggerCsvDownload(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function DashboardOverviewPage({ portalRole }) {
  const { member, business, isOnline } = useAuthSession();
  const isOwner = portalRole === ROLES.OWNER && canViewBusinessAnalytics(member);
  const businessId = member?.businessId || '';
  const timeZone = business?.timezone || 'Asia/Jakarta';
  const todayKey = getTodayDateKey(timeZone);
  const assignedKey = (member?.assignedStudioIds || []).join(',');

  const [preset, setPreset] = useState(ANALYTICS_PRESETS.THIRTY_DAYS);
  const [customStartKey, setCustomStartKey] = useState(() => addDaysToDateKey(todayKey, -13));
  const [customEndKey, setCustomEndKey] = useState(todayKey);
  const [studioFilter, setStudioFilter] = useState('all');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [showRoadmap, setShowRoadmap] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [reportBundle, setReportBundle] = useState(null);

  const subscribeStudiosFn = useCallback(
    ({ onData, onError }) => {
      if (!businessId || !member) return () => {};
      return subscribeStudiosForMember({ businessId, member, onData, onError });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [businessId, member?.role, assignedKey],
  );

  const subscribeSettingsFn = useCallback(
    ({ onData, onError }) => {
      if (!businessId) return () => {};
      return subscribeBusinessSettings({ businessId, onData, onError });
    },
    [businessId],
  );

  const subscribeMembersFn = useCallback(
    ({ onData, onError }) => {
      if (!businessId || !isOwner) return () => {};
      return subscribeBusinessMembers({ businessId, onData, onError });
    },
    [businessId, isOwner],
  );

  const { data: studios } = useRegistrySubscription(
    `dash-studios:${businessId}:${member?.role || ''}:${assignedKey}`,
    businessId && member ? subscribeStudiosFn : null,
    [],
  );

  const { data: settingsMap } = useRegistrySubscription(
    `dash-settings:${businessId}`,
    businessId ? subscribeSettingsFn : null,
    {},
  );

  const { data: teamMembers } = useRegistrySubscription(
    `dash-members:${businessId}`,
    businessId && isOwner ? subscribeMembersFn : null,
    [],
  );

  const scheduleSetting = useMemo(() => {
    if (!settingsMap) return null;
    if (Array.isArray(settingsMap)) {
      return settingsMap.find((s) => s?.settingId === SETTING_IDS.SCHEDULE) || null;
    }
    return settingsMap[SETTING_IDS.SCHEDULE] || null;
  }, [settingsMap]);

  const studioNameMap = useMemo(() => {
    const map = new Map();
    for (const st of studios || []) {
      map.set(st.studioId, st.name);
    }
    return map;
  }, [studios]);

  const memberNameMap = useMemo(() => {
    const map = new Map();
    for (const m of teamMembers || []) {
      map.set(m.uid, m.displayName || m.email || m.uid);
    }
    if (member?.uid && !map.has(member.uid)) {
      map.set(member.uid, member.displayName || member.email || member.uid);
    }
    return map;
  }, [teamMembers, member]);

  useEffect(() => {
    if (!businessId || !member) {
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMsg('');

    loadDashboardAnalyticsUseCase({
      member,
      business,
      preset,
      customStartKey,
      customEndKey,
      studioFilter,
      studios,
      scheduleSetting,
      members: teamMembers,
      isOnline,
    })
      .then((result) => {
        if (!cancelled) {
          setReportBundle(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err?.message || 'Gagal memuat analitik dashboard.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    businessId,
    member?.uid,
    member?.role,
    assignedKey,
    timeZone,
    preset,
    customStartKey,
    customEndKey,
    studioFilter,
    studios,
    scheduleSetting,
    teamMembers,
    isOnline,
    refreshNonce,
  ]);

  const analytics = reportBundle?.analytics || null;
  const warnings = reportBundle?.warnings || {};
  const anyCapReached = Boolean(
    warnings.bookingsCapReached || warnings.ledgerCapReached || warnings.commissionCapReached,
  );

  function handleExportBookingsCsv() {
    if (!reportBundle) return;
    const csv = buildBookingsCsvReport({
      member,
      bookings: reportBundle.rawBookings,
      studioNameMap,
    });
    triggerCsvDownload(
      `bookings_${reportBundle.window.startDateKey}_${reportBundle.window.endDateKey}.csv`,
      csv,
    );
  }

  function handleExportLedgerCsv() {
    if (!reportBundle || !isOwner) return;
    const csv = buildLedgerCsvReport({
      member,
      ledgerEntries: reportBundle.rawLedger,
      studioNameMap,
    });
    triggerCsvDownload(
      `ledger_${reportBundle.window.startDateKey}_${reportBundle.window.endDateKey}.csv`,
      csv,
    );
  }

  function handleExportCommissionsCsv() {
    if (!reportBundle) return;
    const csv = buildCommissionCsvReport({
      member,
      commissionEntries: reportBundle.rawCommissions,
      memberNameMap,
    });
    triggerCsvDownload(
      `komisi_${isOwner ? 'bisnis' : 'saya'}_${reportBundle.window.startDateKey}_${reportBundle.window.endDateKey}.csv`,
      csv,
    );
  }

  const quickLinks = isOwner
    ? [
        { to: '/owner/bookings', label: 'Kalender Booking' },
        { to: '/owner/finance', label: 'Antrean Settlement' },
        { to: '/owner/activity', label: 'Aktivitas & Notifikasi' },
        { to: '/owner/gallery', label: 'Galeri Cloudinary' },
        { to: '/owner/studios', label: 'Studios & Rooms' },
      ]
    : [
        { to: '/operator/bookings', label: 'Kalender & Booking Saya' },
        { to: '/operator/commissions', label: 'Detail Komisi Saya' },
        { to: '/operator/activity', label: 'Aktivitas Studio' },
        { to: '/operator/gallery', label: 'Galeri Studio' },
      ];

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <section className="panel" style={{ display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <span className="badge badge-success">
                <TrendingUp size={14} aria-hidden="true" />
                <span>Phase 07 Analytics &amp; Spark-Safe Reporting</span>
              </span>
              <span className="badge badge-info mono">
                {business?.name || businessId} · TZ {timeZone}
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: '24px', lineHeight: 1.2 }}>
              {isOwner
                ? 'Owner Analytics & Ringkasan Bisnis'
                : 'Operator Workspace & Ringkasan Harian'}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {isOwner
                ? 'KPI finansial terpisah (Recognized Revenue vs Net Cash vs Outstanding vs Komisi), utilisasi studio, dan ekspor laporan CSV Spark-safe.'
                : 'Ringkasan booking ter-scope studio yang ditugaskan serta perolehan komisi pribadi Anda.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setRefreshNonce((n) => n + 1)}
              disabled={loading}
            >
              <RefreshCw size={14} aria-hidden="true" />
              <span>{loading ? 'Memuat...' : 'Muat Ulang Data'}</span>
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setShowRoadmap((prev) => !prev)}
            >
              <ShieldCheck size={14} aria-hidden="true" />
              <span>{showRoadmap ? 'Tutup Info Modul' : 'Status Fase (P01–P08)'}</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {quickLinks.map((item) => (
            <Link key={item.to} to={item.to} className="btn btn-sm">
              <span>{item.label}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      {showRoadmap && <PhaseFoundationDashboard portalRole={portalRole} />}

      <section className="panel" style={{ display: 'grid', gap: '12px' }}>
        <div className="grid-3">
          <div className="field">
            <label className="field-label" htmlFor="dash-preset-select">
              Periode Analitik (Maks 90 Hari)
            </label>
            <select
              id="dash-preset-select"
              className="field-input"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
            >
              <option value={ANALYTICS_PRESETS.TODAY}>Hari Ini ({todayKey})</option>
              <option value={ANALYTICS_PRESETS.SEVEN_DAYS}>7 Hari Terakhir</option>
              <option value={ANALYTICS_PRESETS.THIRTY_DAYS}>30 Hari Terakhir</option>
              <option value={ANALYTICS_PRESETS.MONTH_TO_DATE}>Bulan Ini (MTD)</option>
              <option value={ANALYTICS_PRESETS.CUSTOM}>Rentang Kustom (&lt;= 90 hari)</option>
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="dash-studio-select">
              Filter Studio
            </label>
            <select
              id="dash-studio-select"
              className="field-input"
              value={studioFilter}
              onChange={(e) => setStudioFilter(e.target.value)}
            >
              <option value="all">
                {isOwner ? 'Semua Studio Bisnis' : 'Semua Studio Ditugaskan'}
              </option>
              {(studios || []).map((st) => (
                <option key={st.studioId} value={st.studioId}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <span className="field-label">Ekspor Laporan CSV (UTF-8 Safe)</span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={handleExportBookingsCsv}
                disabled={!reportBundle || reportBundle.rawBookings.length === 0}
              >
                <Download size={14} aria-hidden="true" />
                <span>Booking CSV</span>
              </button>
              {isOwner && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={handleExportLedgerCsv}
                  disabled={!reportBundle || reportBundle.rawLedger.length === 0}
                >
                  <Download size={14} aria-hidden="true" />
                  <span>Ledger CSV</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm"
                onClick={handleExportCommissionsCsv}
                disabled={!reportBundle || reportBundle.rawCommissions.length === 0}
              >
                <Download size={14} aria-hidden="true" />
                <span>{isOwner ? 'Komisi Tim CSV' : 'Komisi Saya CSV'}</span>
              </button>
            </div>
          </div>
        </div>

        {preset === ANALYTICS_PRESETS.CUSTOM && (
          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="dash-custom-start">
                Tanggal Mulai (YYYY-MM-DD)
              </label>
              <input
                id="dash-custom-start"
                type="date"
                className="field-input mono"
                value={customStartKey}
                onChange={(e) => setCustomStartKey(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="dash-custom-end">
                Tanggal Akhir (YYYY-MM-DD)
              </label>
              <input
                id="dash-custom-end"
                type="date"
                className="field-input mono"
                value={customEndKey}
                onChange={(e) => setCustomEndKey(e.target.value)}
              />
            </div>
          </div>
        )}

        {analytics && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Menampilkan periode <strong className="mono">{analytics.window.startDateKey}</strong> s/d{' '}
            <strong className="mono">{analytics.window.endDateKey}</strong> ({analytics.window.dayCount} hari) · Kuota Spark
            aman (query on-demand <code className="mono">limit(250)</code>).
          </div>
        )}
      </section>

      <StatusAlert variant="danger" title="Kendala Memuat Analitik" message={errorMsg} />

      {anyCapReached && (
        <section className="panel" role="status" style={{ borderColor: 'var(--accent-brass)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <AlertTriangle size={18} color="var(--accent-brass)" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <div style={{ fontSize: '13px' }}>
            <strong>Batas Proteksi Spark Tercapai (250 Dokumen):</strong> Beberapa metrik mungkin terpotong karena
            volume transaksi pada periode ini melampaui batas query sekali muat. Pilih rentang tanggal yang lebih
            pendek (misal <code className="mono">7 Hari Terakhir</code>) atau filter per studio untuk angka utuh.
          </div>
        </section>
      )}

      {loading ? (
        <div className="grid-3">
          <div className="panel skeleton" style={{ height: '110px' }} />
          <div className="panel skeleton" style={{ height: '110px' }} />
          <div className="panel skeleton" style={{ height: '110px' }} />
        </div>
      ) : analytics ? (
        <>
          {isOwner && analytics.financeSummary ? (
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <article className="panel" style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Recognized Revenue (Settled)
                </span>
                <strong className="mono" style={{ fontSize: '20px', color: '#22c55e' }}>
                  {formatIdr(analytics.financeSummary.recognizedRevenueMinor)}
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Total nilai kontrak {analytics.operationsSummary.settledCount} booking berstatus SETTLED
                </span>
              </article>

              <article className="panel" style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Net Cash Collected (Ledger)
                </span>
                <strong className="mono" style={{ fontSize: '20px' }}>
                  {formatIdr(analytics.financeSummary.netCashCollectedMinor)}
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Masuk {formatIdr(analytics.financeSummary.paymentReceivedMinor)} · Refund{' '}
                  {formatIdr(analytics.financeSummary.refundTotalMinor)} · Adj{' '}
                  {formatIdr(analytics.financeSummary.netAdjustmentMinor)}
                </span>
              </article>

              <article className="panel" style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Outstanding Settlement
                </span>
                <strong className="mono" style={{ fontSize: '20px', color: 'var(--accent-brass)' }}>
                  {formatIdr(analytics.financeSummary.outstandingBalanceMinor)}
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {analytics.operationsSummary.awaitingSettlementCount} sesi selesai menunggu pelunasan/review
                </span>
              </article>

              <article className="panel" style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Net Operator Commission
                </span>
                <strong className="mono" style={{ fontSize: '20px' }}>
                  {formatIdr(analytics.financeSummary.netCommissionMinor)}
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Akumulasi CREDIT - DEBIT pada periode ini
                </span>
              </article>
            </section>
          ) : (
            <section className="grid-3">
              <article className="panel" style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Jadwal Studio Hari Ini ({todayKey})
                </span>
                <strong className="mono" style={{ fontSize: '22px' }}>
                  {analytics.todaySummary.totalToday} sesi
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {analytics.todaySummary.inProgressToday} berjalan · {analytics.todaySummary.confirmedToday} confirmed ·{' '}
                  {analytics.todaySummary.pendingToday} pending
                </span>
              </article>

              <article className="panel" style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Total Booking Periode Ini
                </span>
                <strong className="mono" style={{ fontSize: '22px' }}>
                  {analytics.operationsSummary.blockingBookingsCount} aktif
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Dari {analytics.operationsSummary.totalBookings} total · Utilisasi studio{' '}
                  {analytics.operationsSummary.overallUtilizationPercent}%
                </span>
              </article>

              <article className="panel" style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Komisi Bersih Saya
                </span>
                <strong className="mono" style={{ fontSize: '22px', color: '#22c55e' }}>
                  {formatIdr(analytics.personalCommissionSummary.netCommissionMinor)}
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Dari {analytics.personalCommissionSummary.bookingCount} booking settled · Scoped strictly ke UID Anda
                </span>
              </article>
            </section>
          )}

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div className="panel" style={{ padding: '12px', display: 'grid', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Hari Ini ({todayKey})</span>
              <strong className="mono" style={{ fontSize: '18px' }}>
                {analytics.todaySummary.totalToday} booking
              </strong>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {analytics.todaySummary.inProgressToday} sedang berlangsung
              </span>
            </div>
            <div className="panel" style={{ padding: '12px', display: 'grid', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Menunggu Konfirmasi</span>
              <strong className="mono" style={{ fontSize: '18px' }}>
                {analytics.operationsSummary.pendingConfirmationCount}
              </strong>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Status PENDING_CONFIRMATION</span>
            </div>
            <div className="panel" style={{ padding: '12px', display: 'grid', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Siap / Review Settlement</span>
              <strong className="mono" style={{ fontSize: '18px', color: 'var(--accent-brass)' }}>
                {analytics.operationsSummary.awaitingSettlementCount}
              </strong>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Selesai &amp; menunggu Owner settle</span>
            </div>
            <div className="panel" style={{ padding: '12px', display: 'grid', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Cancel &amp; No-Show</span>
              <strong className="mono" style={{ fontSize: '18px' }}>
                {analytics.operationsSummary.cancelledOrNoShowCount} ({analytics.operationsSummary.cancellationOrNoShowRatePercent}%)
              </strong>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {analytics.operationsSummary.cancelledCount} cancel · {analytics.operationsSummary.noShowCount} no-show
              </span>
            </div>
          </section>

          <MetricTrendChart points={analytics.chartTrend} isOwner={isOwner} />

          <div className="grid-2">
            <StudioUtilizationPanel
              studios={analytics.studioUtilization}
              isOwner={isOwner}
              overallPercent={analytics.operationsSummary.overallUtilizationPercent}
            />

            <section className="panel" style={{ display: 'grid', gap: '12px', alignContent: 'start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} color="var(--accent-brass)" aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: '16px' }}>Layanan Populer Periode Ini</h2>
              </div>

              {analytics.serviceBreakdown.length === 0 ? (
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Belum ada booking layanan aktif pada periode ini.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Layanan</th>
                        <th>Booking</th>
                        <th>Durasi Total</th>
                        {isOwner && <th>Revenue Settled</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.serviceBreakdown.slice(0, 8).map((svc) => (
                        <tr key={svc.serviceId}>
                          <td>
                            <strong>{svc.serviceName}</strong>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                              {svc.category}
                            </div>
                          </td>
                          <td className="mono">{svc.bookingCount}</td>
                          <td className="mono">{Math.round((svc.bookedMinutes / 60) * 10) / 10} jam</td>
                          {isOwner && <td className="mono">{formatIdr(svc.recognizedRevenueMinor || 0)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {isOwner && (
            <div className="grid-2">
              <section className="panel" style={{ display: 'grid', gap: '12px', alignContent: 'start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18} color="var(--accent-brass)" aria-hidden="true" />
                  <h2 style={{ margin: 0, fontSize: '16px' }}>Pembayaran Masuk per Metode</h2>
                </div>

                {analytics.paymentMethodBreakdown.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Belum ada entri pembayaran <code className="mono">PAYMENT_RECEIVED</code> pada periode ini.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {analytics.paymentMethodBreakdown.map((pm) => (
                      <div
                        key={pm.method}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '13px',
                        }}
                      >
                        <div>
                          <strong>{PAYMENT_LABELS[pm.method] || pm.method}</strong>
                          <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                            ({pm.count} trx · {pm.sharePercent}%)
                          </span>
                        </div>
                        <strong className="mono">{formatIdr(pm.amountMinor)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="panel" style={{ display: 'grid', gap: '12px', alignContent: 'start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Coins size={18} color="var(--accent-brass)" aria-hidden="true" />
                  <h2 style={{ margin: 0, fontSize: '16px' }}>Rekap Komisi per Operator</h2>
                </div>

                {!analytics.financeSummary?.commissionByOperator?.length ? (
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Belum ada catatan komisi operator pada periode ini.
                  </p>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Operator</th>
                          <th>Booking</th>
                          <th>Earned</th>
                          <th>Net Komisi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.financeSummary.commissionByOperator.map((op) => (
                          <tr key={op.operatorUid}>
                            <td>
                              <strong>{op.operatorName}</strong>
                            </td>
                            <td className="mono">{op.bookingCount}</td>
                            <td className="mono">{formatIdr(op.earnedMinor)}</td>
                            <td className="mono">
                              <strong>{formatIdr(op.netCommissionMinor)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          <section className="panel" style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'grid', gap: '4px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Definisi Metrik &amp; Kontrak Konsistensi Tanggal</strong>
            <span>
              • Semua tanggal (<code className="mono">YYYY-MM-DD</code>) dievaluasi konsisten pada timezone bisnis{' '}
              <code className="mono">{timeZone}</code> menggunakan bilangan bulat IDR.
            </span>
            {isOwner ? (
              <span>
                • <code className="mono">Recognized Revenue</code> hanya menghitung nilai kontrak booking berstatus{' '}
                <code className="mono">SETTLED</code>; <code className="mono">Net Cash Collected</code> menghitung arus kas
                aktual (<code className="mono">Payment Received - Refund + Adjustment/Reversal</code>) dan dipisahkan dari{' '}
                <code className="mono">Outstanding</code> serta <code className="mono">Komisi</code>.
              </span>
            ) : (
              <span>
                • Seluruh metrik operasional hanya membaca studio pada <code className="mono">assignedStudioIds</code> Anda dan
                komisi hanya menjumlahkan entri milik UID Anda sendiri.
              </span>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
