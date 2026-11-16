import { DoorOpen } from 'lucide-react';
import { formatIdr } from '../../../shared/utils/formatters.js';

function formatHoursFromMinutes(minutes) {
  const hrs = Number(minutes || 0) / 60;
  return `${Math.round(hrs * 10) / 10} jam`;
}

/**
 * Studio utilization breakdown comparing booked blocking session minutes against scheduled operating capacity.
 */
export function StudioUtilizationPanel({ studios = [], isOwner = false, overallPercent = 0 }) {
  return (
    <section className="panel" style={{ display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DoorOpen size={18} color="var(--accent-brass)" aria-hidden="true" />
          <h2 style={{ margin: 0, fontSize: '16px' }}>Utilisasi Kapasitas Studio</h2>
        </div>
        <span className="badge badge-info mono">Rata-rata Aktif: {overallPercent}%</span>
      </div>

      {studios.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
          Belum ada studio dalam cakupan filter saat ini.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {studios.map((row) => (
            <article
              key={row.studioId}
              style={{
                display: 'grid',
                gap: '6px',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-input)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>{row.studioName}</strong>
                  <span className={`badge ${row.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                    {row.status === 'active' ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <span className="mono" style={{ fontSize: '13px', fontWeight: 700 }}>
                  {row.utilizationPercent}%{' '}
                  <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>
                    ({formatHoursFromMinutes(row.bookedMinutes)} / {formatHoursFromMinutes(row.capacityMinutes)})
                  </span>
                </span>
              </div>

              <div
                style={{
                  width: '100%',
                  height: '8px',
                  borderRadius: '999px',
                  background: 'var(--muted)',
                  overflow: 'hidden',
                }}
                role="progressbar"
                aria-valuenow={row.utilizationPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Utilisasi ${row.studioName}: ${row.utilizationPercent}%`}
              >
                <div
                  style={{
                    width: `${row.utilizationPercent}%`,
                    height: '100%',
                    background:
                      row.utilizationPercent >= 75
                        ? 'var(--success)'
                        : row.utilizationPercent >= 35
                          ? 'var(--accent-brass)'
                          : 'var(--info)',
                    transition: 'width 200ms ease',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>
                  {row.blockingBookings} booking aktif · {row.settledBookings} settled ·{' '}
                  {row.cancelledOrNoShowBookings} cancel/no-show
                </span>
                {isOwner && row.recognizedRevenueMinor !== null && (
                  <span className="mono" style={{ color: 'var(--text-primary)' }}>
                    Revenue Settled: {formatIdr(row.recognizedRevenueMinor)}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
