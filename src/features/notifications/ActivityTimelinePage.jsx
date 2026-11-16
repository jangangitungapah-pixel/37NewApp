import { useCallback, useMemo, useState } from 'react';
import { Activity, Filter, History, RefreshCw } from 'lucide-react';
import { useAuthSession } from '../../app/providers/authSessionContext.js';
import { subscribeBusinessActivityTimeline } from '../../data/repositories/notificationRepository.js';
import { subscribeStudiosForMember } from '../../data/repositories/studioRepository.js';
import { ROLES } from '../../domain/enums/roles.js';
import { StatusAlert } from '../../shared/components/StatusFeedback.jsx';
import { useRegistrySubscription } from '../../shared/hooks/useRegistrySubscription.js';

function formatEventTime(dateVal) {
  if (!(dateVal instanceof Date) || Number.isNaN(dateVal.getTime())) {
    return 'Baru saja';
  }
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dateVal);
}

export function ActivityTimelinePage() {
  const { member, fromCache: sessionFromCache } = useAuthSession();
  const [entityFilter, setEntityFilter] = useState('all'); // 'all' | 'booking' | 'ledger_entry' | 'commission_entry'
  const [studioFilter, setStudioFilter] = useState('all');

  const assignedKey = (member?.assignedStudioIds || []).join(',');

  const subscribeTimeline = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId) return () => {};
      return subscribeBusinessActivityTimeline({
        businessId: member.businessId,
        member,
        limitCount: 40,
        onData,
        onError,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [member?.businessId, member?.role, assignedKey],
  );

  const {
    data: events,
    loading,
    fromCache,
    error,
    retry,
  } = useRegistrySubscription(
    'phase05:activity:timeline',
    member?.businessId ? subscribeTimeline : null,
    [],
  );

  const subscribeStudios = useCallback(
    ({ onData, onError }) => {
      if (!member?.businessId) return () => {};
      return subscribeStudiosForMember({ businessId: member.businessId, member, onData, onError });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [member?.businessId, member?.role, assignedKey],
  );
  const { data: studios } = useRegistrySubscription(
    'phase05:activity:studios',
    member?.businessId ? subscribeStudios : null,
    [],
  );

  const studioNameMap = useMemo(() => {
    const map = new Map();
    for (const s of studios) {
      map.set(s.studioId, s.name);
    }
    return map;
  }, [studios]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (entityFilter !== 'all' && ev.entityType !== entityFilter) {
        return false;
      }
      if (studioFilter !== 'all' && ev.studioId !== studioFilter) {
        return false;
      }
      return true;
    });
  }, [events, entityFilter, studioFilter]);

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Activity Timeline & Kolaborasi Portal</h1>
          <p className="page-subtitle">
            {member?.role === ROLES.OWNER
              ? 'Jejak event operasional booking, settlement, dan adjustment kas secara realtime.'
              : 'Aktivitas operasional terbaru khusus untuk studio yang ditugaskan kepada Anda.'}
          </p>
        </div>

        <button type="button" className="btn btn-sm" onClick={retry}>
          <RefreshCw size={14} aria-hidden="true" />
          <span>Sinkron Ulang Listener</span>
        </button>
      </header>

      {(fromCache || sessionFromCache) && (
        <StatusAlert
          variant="warning"
          title="Menampilkan Data Cache Lokal"
          message="Timeline sementara menggunakan cache lokal perangkat hingga koneksi sinkron kembali."
        />
      )}

      {error && (
        <StatusAlert
          variant="danger"
          title="Gagal Memuat Activity Timeline"
          message={error.message}
        />
      )}

      <section className="panel" style={{ padding: '14px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="tabs" style={{ borderBottom: 0, paddingBottom: 0 }}>
          <button
            type="button"
            className={`tab-btn ${entityFilter === 'all' ? 'active' : ''}`}
            onClick={() => setEntityFilter('all')}
          >
            <Activity size={14} aria-hidden="true" />
            <span>Semua ({events.length})</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${entityFilter === 'booking' ? 'active' : ''}`}
            onClick={() => setEntityFilter('booking')}
          >
            <span>Booking & Settlement</span>
          </button>
          {member?.role === ROLES.OWNER && (
            <>
              <button
                type="button"
                className={`tab-btn ${entityFilter === 'ledger_entry' ? 'active' : ''}`}
                onClick={() => setEntityFilter('ledger_entry')}
              >
                <span>Koreksi Ledger</span>
              </button>
              <button
                type="button"
                className={`tab-btn ${entityFilter === 'commission_entry' ? 'active' : ''}`}
                onClick={() => setEntityFilter('commission_entry')}
              >
                <span>Koreksi Komisi</span>
              </button>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={14} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
          <select
            aria-label="Filter studio aktivitas"
            className="field-input"
            style={{ width: 'auto', minHeight: '34px', padding: '4px 10px' }}
            value={studioFilter}
            onChange={(e) => setStudioFilter(e.target.value)}
          >
            <option value="all">Semua Studio Akses</option>
            {studios.map((s) => (
              <option key={s.studioId} value={s.studioId}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {loading ? (
        <div className="panel" style={{ padding: '18px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Menghubungkan listener aktivitas realtime...
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="empty-state">
          <History size={26} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
          <strong>Belum Ada Aktivitas Tercatat</strong>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Setiap pembuatan booking, check-in, reschedule, cancel, maupun settlement tercatat otomatis di sini.
          </span>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {filteredEvents.map((ev) => (
            <article
              key={ev.eventId}
              className="panel"
              style={{ padding: '14px', display: 'grid', gap: '6px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="badge badge-info">{ev.eventType}</span>
                  <span className="badge">{studioNameMap.get(ev.studioId) || ev.studioId}</span>
                  <span className="badge">{ev.actorRole}</span>
                </div>
                <span className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {formatEventTime(ev.createdAt)} WIB
                </span>
              </div>

              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)' }}>
                {ev.summary}
              </p>

              <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Entity: {ev.entityType} / {ev.entityId}
                {ev.beforeStatus ? ` · ${ev.beforeStatus} -> ${ev.afterStatus}` : ` · -> ${ev.afterStatus}`}
                {ev.reason ? ` · Alasan: ${ev.reason}` : ''}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
